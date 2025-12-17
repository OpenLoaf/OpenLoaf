import { tool, zodSchema } from "ai";
import { requireActiveTab } from "@/chat/ui/emit";
import { getCdpConfig } from "@teatime-ai/config";
import {
  playwrightDomSnapshotToolDef,
  playwrightGetAccessibilityTreeToolDef,
  playwrightNetworkGetResponseBodyToolDef,
  playwrightRuntimeEvaluateToolDef,
} from "@teatime-ai/api/types/tools/playwright";
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

async function getWebSocketDebuggerUrl(): Promise<string> {
  const { versionUrl } = getCdpConfig(process.env);
  const res = await fetch(versionUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch CDP version info: ${res.status} ${res.statusText}`,
    );
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
  preferredUrlRule: UrlMatch;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const contexts = browser.contexts?.() ?? [];
    const pages = contexts.flatMap((ctx: any) => (ctx.pages?.() ?? []));

    const match = [...pages]
      .reverse()
      .find((p: any) => matchesUrl(p.url?.() ?? "", preferredUrlRule));
    if (match) return match;

    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function withCdpPage<T>(
  pageTargetId: string,
  fn: (input: { page: any; cdp: any }) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
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

  let browser: any;
  try {
    const wsUrl = await getWebSocketDebuggerUrl();
    const { chromium } = await import("playwright-core");
    browser = await chromium.connectOverCDP(wsUrl);

    const page = await pickExistingPage({
      browser,
      preferredUrlRule: { mode: "includes", url: record.url },
      timeoutMs: 10_000,
    });
    if (!page) {
      return {
        ok: false,
        error: `No matching CDP page found for pageTargetId=${pageTargetId}. Re-run \`open-url\` with the same pageTargetId to reopen it.`,
      };
    }

    const context = page.context?.();
    if (!context?.newCDPSession) {
      return { ok: false, error: "CDP session is not available for this page." };
    }

    const cdp = await context.newCDPSession(page);
    return { ok: true, data: await fn({ page, cdp }) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    try {
      await browser?.close?.();
    } catch {}
  }
}

export const playwrightGetAccessibilityTreeTool = tool({
  description: playwrightGetAccessibilityTreeToolDef.description,
  inputSchema: zodSchema(playwrightGetAccessibilityTreeToolDef.parameters),
  execute: async ({ pageTargetId, interestingOnly }) => {
    return await withCdpPage(pageTargetId, async ({ page }) => {
      const snapshot = await page.accessibility.snapshot({
        interestingOnly: interestingOnly ?? true,
      });
      return { snapshot };
    });
  },
});

export const playwrightRuntimeEvaluateTool = tool({
  description: playwrightRuntimeEvaluateToolDef.description,
  inputSchema: zodSchema(playwrightRuntimeEvaluateToolDef.parameters),
  execute: async ({ pageTargetId, expression, awaitPromise, returnByValue }) => {
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      await cdp.send("Runtime.enable");
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: awaitPromise ?? true,
        returnByValue: returnByValue ?? true,
      });
      return result;
    });
  },
});

export const playwrightDomSnapshotTool = tool({
  description: playwrightDomSnapshotToolDef.description,
  inputSchema: zodSchema(playwrightDomSnapshotToolDef.parameters),
  execute: async ({ pageTargetId, computedStyles, includeDOMRects, includePaintOrder }) => {
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      await cdp.send("DOMSnapshot.enable").catch(() => {});
      const result = await cdp.send("DOMSnapshot.captureSnapshot", {
        computedStyles: computedStyles ?? [],
        includeDOMRects: includeDOMRects ?? false,
        includePaintOrder: includePaintOrder ?? false,
      });
      return result;
    });
  },
});

export const playwrightNetworkGetResponseBodyTool = tool({
  description: playwrightNetworkGetResponseBodyToolDef.description,
  inputSchema: zodSchema(playwrightNetworkGetResponseBodyToolDef.parameters),
  execute: async ({ pageTargetId, requestId }) => {
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      await cdp.send("Network.enable");
      const result = await cdp.send("Network.getResponseBody", { requestId });
      return result;
    });
  },
});

