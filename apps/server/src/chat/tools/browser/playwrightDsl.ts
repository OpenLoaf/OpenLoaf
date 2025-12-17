import { tool, zodSchema } from "ai";
import { requireActiveTab } from "@/chat/ui/emit";
import { getCdpConfig } from "@teatime-ai/config";
import { playwrightDslToolDef } from "@teatime-ai/api/types/tools/playwright";
import { getPageTarget } from "./pageTargets";

type UrlMatch =
  | { mode: "exact"; url: string }
  | { mode: "includes"; url: string }
  | { mode: "regex"; pattern: string };

function matchesUrl(url: string, rule: UrlMatch): boolean {
  if (rule.mode === "exact") return url === rule.url;
  if (rule.mode === "includes") return url.includes(rule.url);
  try {
    const re = new RegExp(rule.pattern);
    return re.test(url);
  } catch {
    return false;
  }
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPlaywrightUrlMatcher(rule: UrlMatch): string | RegExp {
  if (rule.mode === "exact") return rule.url;
  if (rule.mode === "includes") return new RegExp(escapeRegExp(rule.url));
  return new RegExp(rule.pattern);
}

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return -1;
  }
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + `…[truncated ${value.length - maxChars} chars]`;
}

function maybeTruncateStringValue(value: unknown, maxChars: number): unknown {
  if (typeof value === "string") return truncateText(value, maxChars);
  return value;
}

async function getWebSocketDebuggerUrl(): Promise<string> {
  const { versionUrl } = getCdpConfig(process.env);
  const res = await fetch(versionUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch CDP version info: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { webSocketDebuggerUrl?: string };
  if (!data.webSocketDebuggerUrl) {
    throw new Error("CDP version info missing webSocketDebuggerUrl");
  }
  return data.webSocketDebuggerUrl;
}

async function pickExistingPage({
  browser,
  preferredUrlRule,
  timeoutMs,
}: {
  browser: any;
  preferredUrlRule?: UrlMatch;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const contexts = browser.contexts?.() ?? [];
    const pages = contexts.flatMap((ctx: any) => (ctx.pages?.() ?? []));

    if (pages.length > 0) {
      if (!preferredUrlRule) return pages[0];
      const exact = [...pages]
        .reverse()
        .find((p: any) => matchesUrl(p.url?.() ?? "", preferredUrlRule));
      if (exact) return exact;
      const fuzzy = [...pages]
        .reverse()
        .find((p: any) => (p.url?.() ?? "").includes((preferredUrlRule as any).url ?? ""));
      if (fuzzy) return fuzzy;
      return pages[0];
    }

    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

export const playwrightDslTool = tool({
  description: playwrightDslToolDef.description,
  inputSchema: zodSchema(playwrightDslToolDef.parameters),
  execute: async ({ pageTargetId, steps, options }) => {
    const activeTab = requireActiveTab();

    const record = getPageTarget(pageTargetId);
    if (!record) {
      return {
        ok: false,
        error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first and use the returned pageTargetId.`,
      };
    }

    if (record.tabId !== activeTab.id) {
      return {
        ok: false,
        error: `pageTargetId=${pageTargetId} does not belong to activeTab.id=${activeTab.id}`,
      };
    }
    const preferredUrlRule: UrlMatch = { mode: "includes", url: record.url };

    const stopOnError = options?.stopOnError ?? true;
    const totalTimeoutMs = options?.timeoutMs ?? 60_000;
    const connectionTimeoutMs = Math.min(totalTimeoutMs, 10_000);

    const results: Array<{
      index: number;
      type: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }> = [];

    const capture = {
      enabled: false,
      includeHeaders: false,
      maxEntries: 1000,
      entries: [] as any[],
    };

    let browser: any;
    try {
      const wsUrl = await getWebSocketDebuggerUrl();
      const { chromium } = await import("playwright-core");
      browser = await chromium.connectOverCDP(wsUrl);

      let page = await pickExistingPage({
        browser,
        preferredUrlRule,
        timeoutMs: connectionTimeoutMs,
      });
      if (!page) {
        return {
          ok: false,
          error: `No matching CDP page found for pageTargetId=${pageTargetId}. Re-run \`open-url\` with the same pageTargetId to reopen it.`,
        };
      }

      // 关键约束：禁止产生/保留新的 page（popup/new tab）。
      // - 允许在“当前 page”内导航（page.goto），但不允许打开新页面。
      const closeIfNotCurrent = async (p: any) => {
        if (!p || p === page) return;
        try {
          await p.close?.();
        } catch {}
      };
      try {
        page.on?.("popup", closeIfNotCurrent);
      } catch {}
      try {
        page.context?.().on?.("page", closeIfNotCurrent);
      } catch {}

      const onRequest = (req: any) => {
        if (!capture.enabled) return;
        const entry: any = {
          kind: "request",
          url: req.url?.(),
          method: req.method?.(),
          resourceType: req.resourceType?.(),
        };
        if (capture.includeHeaders) entry.headers = req.headers?.();
        const postData = req.postData?.();
        if (postData) entry.postData = postData;
        capture.entries.push(entry);
        if (capture.entries.length > capture.maxEntries) capture.entries.shift();
      };

      const onResponse = (res: any) => {
        if (!capture.enabled) return;
        const entry: any = {
          kind: "response",
          url: res.url?.(),
          status: res.status?.(),
        };
        if (capture.includeHeaders) entry.headers = res.headers?.();
        capture.entries.push(entry);
        if (capture.entries.length > capture.maxEntries) capture.entries.shift();
      };

      page.on?.("request", onRequest);
      page.on?.("response", onResponse);

      const startedAt = Date.now();
      for (let i = 0; i < steps.length; i++) {
        const step: any = steps[i];
        const now = Date.now();
        if (now - startedAt > totalTimeoutMs) {
          results.push({
            index: i,
            type: step.type,
            ok: false,
            error: `DSL timeout: exceeded ${totalTimeoutMs}ms`,
          });
          break;
        }

        try {
          switch (step.type) {
            case "goto":
              await page.goto(step.url, {
                waitUntil: step.waitUntil,
                timeout: step.timeoutMs,
              });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "waitForLoadState":
              await page.waitForLoadState(step.state, { timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "waitForURL": {
              const matcher =
                step.urlMatch.mode === "exact"
                  ? step.urlMatch.url
                  : step.urlMatch.mode === "includes"
                    ? (u: URL) => u.toString().includes(step.urlMatch.url)
                    : new RegExp(step.urlMatch.pattern);
              await page.waitForURL(matcher as any, { timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            }
            case "getInfo": {
              const data: any = {};
              for (const f of step.fields) {
                if (f === "url") data.url = page.url();
                if (f === "title") data.title = await page.title();
              }
              results.push({ index: i, type: step.type, ok: true, data });
              break;
            }

            case "click":
              await page.locator(step.selector).click({
                timeout: step.timeoutMs,
                button: step.button,
                clickCount: step.clickCount,
              });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "dblclick":
              await page.locator(step.selector).dblclick({ timeout: step.timeoutMs, button: step.button });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "hover":
              await page.locator(step.selector).hover({ timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "fill":
              await page.locator(step.selector).fill(step.text, { timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "type":
              await page.locator(step.selector).type(step.text, { delay: step.delayMs, timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "press":
              await page.locator(step.selector).press(step.key, { timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "check":
              await page.locator(step.selector).check({ timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "uncheck":
              await page.locator(step.selector).uncheck({ timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "selectOption":
              await page.locator(step.selector).selectOption(step.values, { timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "setInputFiles":
              await page.locator(step.selector).setInputFiles(step.filePaths, { timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "scrollIntoView":
              await page.locator(step.selector).scrollIntoViewIfNeeded({ timeout: step.timeoutMs });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "getElement": {
              const loc = page.locator(step.selector);
              if (typeof step.timeoutMs === "number") await loc.waitFor({ timeout: step.timeoutMs });
              const data: any = {};
              for (const f of step.fields) {
                const MAX_FIELD_CHARS = 5000;
                if (f === "textContent") data.textContent = truncateText((await loc.textContent()) ?? "", MAX_FIELD_CHARS);
                if (f === "innerText") data.innerText = truncateText(await loc.innerText(), MAX_FIELD_CHARS);
                if (f === "innerHTML") data.innerHTML = truncateText(await loc.innerHTML(), MAX_FIELD_CHARS);
                if (f === "value") data.value = truncateText(await loc.inputValue(), MAX_FIELD_CHARS);
                if (f === "isVisible") data.isVisible = await loc.isVisible();
                if (f === "isEnabled") data.isEnabled = await loc.isEnabled();
                if (f === "isChecked") data.isChecked = await loc.isChecked();
                if (f === "count") data.count = await loc.count();
              }
              results.push({ index: i, type: step.type, ok: true, data });
              break;
            }

            case "evaluate": {
              const data =
                step.arg === undefined
                  ? await page.evaluate(step.expression)
                  : await page.evaluate(step.expression, step.arg);
              const approxChars = safeJsonSize(data);
              const MAX_EVAL_CHARS = 20_000;
              if (approxChars > MAX_EVAL_CHARS) {
                results.push({
                  index: i,
                  type: step.type,
                  ok: true,
                  data: { truncated: true, approxChars, maxChars: MAX_EVAL_CHARS },
                });
              } else {
                results.push({
                  index: i,
                  type: step.type,
                  ok: true,
                  data: maybeTruncateStringValue(data, 5000),
                });
              }
              break;
            }
            case "addInitScript":
              await page.addInitScript(step.script);
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "addScriptTag":
              await page.addScriptTag({ content: step.content });
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "addStyleTag":
              await page.addStyleTag({ content: step.content });
              results.push({ index: i, type: step.type, ok: true });
              break;

            case "cookies.get": {
              const ctx = page.context();
              const data = await ctx.cookies(step.urls);
              results.push({ index: i, type: step.type, ok: true, data });
              break;
            }
            case "cookies.add":
              await page.context().addCookies(step.cookies);
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "cookies.clear":
              await page.context().clearCookies();
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "storageState.get": {
              const ctx = page.context();
              const data = step.path ? await ctx.storageState({ path: step.path }) : await ctx.storageState();
              results.push({ index: i, type: step.type, ok: true, data });
              break;
            }
            case "localStorage.get": {
              const data = await page.evaluate((keys?: string[]) => {
                const all: Record<string, string> = {};
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (!k) continue;
                  all[k] = localStorage.getItem(k) ?? "";
                }
                if (!keys || keys.length === 0) return all;
                const picked: Record<string, string> = {};
                for (const k of keys) {
                  const value = all[k];
                  if (value !== undefined) picked[k] = value;
                }
                return picked;
              }, step.keys);
              results.push({ index: i, type: step.type, ok: true, data });
              break;
            }
            case "localStorage.set":
              await page.evaluate((entries: Record<string, string>) => {
                for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
              }, step.entries);
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "localStorage.remove":
              await page.evaluate((keys: string[]) => {
                for (const k of keys) localStorage.removeItem(k);
              }, step.keys);
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "localStorage.clear":
              await page.evaluate(() => localStorage.clear());
              results.push({ index: i, type: step.type, ok: true });
              break;

            case "sessionStorage.get": {
              const data = await page.evaluate((keys?: string[]) => {
                const all: Record<string, string> = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                  const k = sessionStorage.key(i);
                  if (!k) continue;
                  all[k] = sessionStorage.getItem(k) ?? "";
                }
                if (!keys || keys.length === 0) return all;
                const picked: Record<string, string> = {};
                for (const k of keys) {
                  const value = all[k];
                  if (value !== undefined) picked[k] = value;
                }
                return picked;
              }, step.keys);
              results.push({ index: i, type: step.type, ok: true, data });
              break;
            }
            case "sessionStorage.set":
              await page.evaluate((entries: Record<string, string>) => {
                for (const [k, v] of Object.entries(entries)) sessionStorage.setItem(k, v);
              }, step.entries);
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "sessionStorage.remove":
              await page.evaluate((keys: string[]) => {
                for (const k of keys) sessionStorage.removeItem(k);
              }, step.keys);
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "sessionStorage.clear":
              await page.evaluate(() => sessionStorage.clear());
              results.push({ index: i, type: step.type, ok: true });
              break;

            case "waitForRequest": {
              const data = await page.waitForRequest((req: any) => matchesUrl(req.url?.() ?? "", step.urlMatch), {
                timeout: step.timeoutMs,
              });
              results.push({
                index: i,
                type: step.type,
                ok: true,
                data: { url: data.url?.(), method: data.method?.(), resourceType: data.resourceType?.() },
              });
              break;
            }
            case "waitForResponse": {
              const data = await page.waitForResponse((res: any) => matchesUrl(res.url?.() ?? "", step.urlMatch), {
                timeout: step.timeoutMs,
              });
              results.push({
                index: i,
                type: step.type,
                ok: true,
                data: { url: data.url?.(), status: data.status?.() },
              });
              break;
            }
            case "route.add": {
              const matcher = toPlaywrightUrlMatcher(step.urlMatch);
              const handler = async (route: any) => {
                if (step.handler.mode === "continue") return route.continue();
                if (step.handler.mode === "abort") return route.abort(step.handler.errorCode);
                return route.fulfill({
                  status: step.handler.status,
                  headers: step.handler.headers,
                  body: step.handler.body,
                  json: step.handler.json,
                });
              };
              await page.route(matcher as any, handler);
              results.push({ index: i, type: step.type, ok: true });
              break;
            }
            case "route.clear":
              if (typeof (page as any).unrouteAll === "function") await (page as any).unrouteAll();
              results.push({ index: i, type: step.type, ok: true });
              break;

            case "capture.start":
              capture.enabled = true;
              capture.includeHeaders = step.includeHeaders ?? false;
              capture.maxEntries = step.maxEntries ?? capture.maxEntries;
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "capture.stop":
              capture.enabled = false;
              results.push({ index: i, type: step.type, ok: true });
              break;
            case "capture.get":
              results.push({
                index: i,
                type: step.type,
                ok: true,
                data: {
                  entryCount: capture.entries.length,
                  entries: capture.entries.slice(-100),
                },
              });
              break;
            case "capture.clear":
              capture.entries = [];
              results.push({ index: i, type: step.type, ok: true });
              break;

            default:
              results.push({ index: i, type: step.type, ok: false, error: `Unsupported step type: ${step.type}` });
              if (stopOnError) i = steps.length;
              break;
          }
        } catch (err: any) {
          results.push({
            index: i,
            type: step.type,
            ok: false,
            error: err?.message ?? String(err),
          });
          if (stopOnError) break;
        }
      }

      return { ok: true, data: { results } };
    } finally {
      try {
        await browser?.close?.();
      } catch {}
    }
  },
});
