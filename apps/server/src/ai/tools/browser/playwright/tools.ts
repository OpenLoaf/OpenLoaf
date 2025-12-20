import { tool, zodSchema } from "ai";
import {
  playwrightActToolDef,
  playwrightDiagnosticsToolDef,
  playwrightPageToolDef,
  playwrightSnapshotToolDef,
  playwrightVerifyToolDef,
  playwrightWaitToolDef,
} from "@teatime-ai/api/types/tools/playwright";
import { browserSessionRegistry } from "@/modules/browser/infrastructure/memory/browserSessionRegistryMemory";
import { requireActiveTabPageTarget } from "./guards";
import { getOrCreateConsoleStore, getOrCreateNetworkStore } from "./stores";
import { truncateText } from "./text";
import { withCdpPage } from "./withCdpPage";

/**
 * 注意：本文件运行在 Node 端，但会把部分函数体传入浏览器执行（page.evaluate / page.waitForFunction）。
 * server 的 tsconfig 不包含 DOM lib，因此这里显式声明 window/document，避免类型检查报错。
 */
declare const window: any;
declare const document: any;

/**
 * 获取“全选”快捷键（Mac 用 Meta，其他平台用 Control）。
 */
function getSelectAllShortcut() {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}

/**
 * 在页面上下文内判断 body 文本是否包含目标字符串。
 * - 注意：该函数会被序列化后注入浏览器执行（用于 page.waitForFunction）。
 */
function pageBodyIncludesText(t: string) {
  return Boolean(document.body?.innerText) && document.body.innerText.includes(t);
}

/**
 * 在页面上下文内判断 location.href 是否包含目标字符串。
 * - 注意：该函数会被序列化后注入浏览器执行（用于 page.waitForFunction）。
 */
function pageUrlIncludesText(t: string) {
  return String(window.location?.href ?? "").includes(t);
}

function escapeSelectorName(input: string) {
  // role selector 的 name 部分使用双引号包裹，这里做最小转义。
  return input.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function isActionableRole(role: string) {
  const actionable = new Set([
    "button",
    "link",
    "textbox",
    "combobox",
    "checkbox",
    "radio",
    "switch",
    "option",
    "menuitem",
    "tab",
  ]);
  return actionable.has(role);
}

/**
 * 将 Playwright accessibility snapshot 收敛为可读文本，并为“可操作节点”附带推荐 selector。
 */
function formatAccessibilitySnapshot(input: {
  root: any;
  maxChars: number;
  verbose: boolean;
}) {
  const { root, maxChars, verbose } = input;
  const lines: string[] = [];
  let chars = 0;

  const pushLine = (line: string) => {
    if (chars >= maxChars) return false;
    const next = line + "\n";
    if (chars + next.length > maxChars) return false;
    lines.push(line);
    chars += next.length;
    return true;
  };

  const walk = (node: any, depth: number) => {
    if (!node) return;
    const role = String(node.role ?? "");
    const name = typeof node.name === "string" ? node.name : "";
    const value =
      typeof node.value === "string" || typeof node.value === "number" ? String(node.value) : "";

    const indent = "  ".repeat(Math.min(depth, 12));
    const parts: string[] = [];
    if (role) parts.push(role);
    if (name) parts.push(`"${name}"`);
    if (verbose && value) parts.push(`value="${truncateText(value, 80)}"`);

    let suffix = "";
    if (role && isActionableRole(role) && name) {
      const selector = `role=${role}[name="${escapeSelectorName(name)}"]`;
      suffix = `  selector=${selector}`;
    }

    if (!pushLine(`${indent}- ${parts.join(" ")}${suffix}`)) return;

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      walk(child, depth + 1);
      if (chars >= maxChars) return;
    }
  };

  walk(root, 0);
  return { text: lines.join("\n"), shown: lines.length, truncated: chars >= maxChars };
}

export const playwrightSnapshotTool = tool({
  description: playwrightSnapshotToolDef.description,
  inputSchema: zodSchema(playwrightSnapshotToolDef.parameters),
  execute: async ({ pageTargetId, targetId, verbose, maxChars }) => {
    return await withCdpPage({ pageTargetId, targetId }, async ({ page }) => {
      const root = await page.accessibility?.snapshot?.({ interestingOnly: true });
      const max = typeof maxChars === "number" ? maxChars : 20_000;
      const { text, shown, truncated } = formatAccessibilitySnapshot({
        root,
        verbose: verbose ?? false,
        maxChars: max,
      });

      let title: string | null = null;
      try {
        title = typeof page?.title === "function" ? await page.title() : null;
      } catch {
        // ignore
      }

      // 顺带刷新内存态 URL（用于后续 attach 的 URL rule，不作为匹配兜底）。
      try {
        const nextUrl = typeof page?.url === "function" ? page.url() : undefined;
        if (nextUrl) browserSessionRegistry.updateUrl(pageTargetId, nextUrl);
      } catch {
        // ignore
      }

      return {
        url: typeof page?.url === "function" ? page.url() : undefined,
        title,
        nodeCount: shown,
        shown,
        snapshotText: text,
        truncated,
      };
    });
  },
});

export const playwrightActTool = tool({
  description: playwrightActToolDef.description,
  inputSchema: zodSchema(playwrightActToolDef.parameters),
  execute: async ({ pageTargetId, targetId, action, selector, value, key }) => {
    return await withCdpPage({ pageTargetId, targetId }, async ({ page }) => {
      // press 支持“不指定 selector”，直接对页面发送按键
      if (action === "press" && !selector) {
        if (!key) throw new Error("Missing key for action=press");
        await page.keyboard?.press?.(key);
        return { acted: true, action, used: "page", key };
      }

      const sel = String(selector ?? "").trim();
      if (!sel) throw new Error("Missing selector (推荐使用 snapshot 输出的 role selector)。");

      const loc = page.locator?.(sel);
      if (!loc) throw new Error("locator is not available on this page.");

      if (action === "scrollIntoView") {
        await loc.first?.().scrollIntoViewIfNeeded?.();
      } else if (action === "click") {
        await loc.first?.().click?.();
      } else if (action === "dblclick") {
        await loc.first?.().dblclick?.();
      } else if (action === "hover") {
        await loc.first?.().hover?.();
      } else if (action === "fill") {
        // 兼容框架表单：先聚焦，再全选清空，最后输入
        await loc.first?.().click?.();
        const selectAll = getSelectAllShortcut();
        try {
          await page.keyboard?.press?.(selectAll);
          await page.keyboard?.press?.("Backspace");
        } catch {
          // ignore
        }
        await page.keyboard?.type?.(String(value ?? ""));
      } else if (action === "type") {
        await loc.first?.().type?.(String(value ?? ""));
      } else if (action === "press") {
        if (!key) throw new Error("Missing key for action=press");
        await loc.first?.().press?.(key);
      } else if (action === "select") {
        await loc.first?.().selectOption?.(String(value ?? ""));
      } else if (action === "check") {
        await loc.first?.().check?.();
      } else if (action === "uncheck") {
        await loc.first?.().uncheck?.();
      } else {
        throw new Error(`Unsupported action=${action}`);
      }

      const postUrl = typeof page?.url === "function" ? page.url() : undefined;
      if (postUrl) browserSessionRegistry.updateUrl(pageTargetId, postUrl);
      return { acted: true, action, used: "selector", selector: sel, postUrl };
    });
  },
});

export const playwrightWaitTool = tool({
  description: playwrightWaitToolDef.description,
  inputSchema: zodSchema(playwrightWaitToolDef.parameters),
  execute: async ({ pageTargetId, targetId, type, url, text, selector, timeoutMs }) => {
    return await withCdpPage({ pageTargetId, targetId }, async ({ page }) => {
      const timeout = typeof timeoutMs === "number" ? timeoutMs : 0;

      if (type === "timeout") {
        const ms = typeof timeoutMs === "number" ? timeoutMs : 0;
        await page.waitForTimeout?.(ms);
        return { waited: true, type, timeoutMs: ms };
      }

      if (type === "load") {
        await page.waitForLoadState?.("load", { timeout: timeout || undefined });
        return { waited: true, type };
      }

      if (type === "networkidle") {
        await page.waitForLoadState?.("networkidle", { timeout: timeout || undefined });
        return { waited: true, type };
      }

      if (type === "selector") {
        if (!selector) throw new Error("Missing selector when type=selector");
        await page.waitForSelector?.(selector, { timeout: timeout || undefined });
        return { waited: true, type, selector };
      }

      if (type === "text") {
        if (!text) throw new Error("Missing text when type=text");
        await page.waitForFunction(pageBodyIncludesText, text, { timeout: timeout || undefined });
        return { waited: true, type, text };
      }

      if (type === "url") {
        if (!url) throw new Error("Missing url when type=url");
        // 约定：url 为“子串 includes”，避免要求 LLM 拼完整 URL。
        await page.waitForFunction(pageUrlIncludesText, url, { timeout: timeout || undefined });
        return { waited: true, type, urlIncludes: url };
      }

      throw new Error(`Unsupported wait type=${type}`);
    });
  },
});

export const playwrightVerifyTool = tool({
  description: playwrightVerifyToolDef.description,
  inputSchema: zodSchema(playwrightVerifyToolDef.parameters),
  execute: async ({ pageTargetId, targetId, type, url, title, text, selector }) => {
    return await withCdpPage({ pageTargetId, targetId }, async ({ page }) => {
      if (type === "urlIncludes") {
        const current = typeof page?.url === "function" ? page.url() : "";
        const expected = String(url ?? "");
        const pass = expected ? current.includes(expected) : false;
        return { pass, type, currentUrl: current, expected };
      }

      if (type === "titleIncludes") {
        const current = typeof page?.title === "function" ? await page.title() : "";
        const expected = String(title ?? "");
        const pass = expected ? current.includes(expected) : false;
        return { pass, type, currentTitle: current, expected };
      }

      if (type === "textIncludes") {
        const expected = String(text ?? "");
        const pass = expected
          ? Boolean(await page.evaluate((t: string) => document.body?.innerText?.includes(t), expected))
          : false;
        return { pass, type, expected };
      }

      if (type === "elementExists") {
        const sel = String(selector ?? "").trim();
        if (!sel) throw new Error("Missing selector for elementExists");
        const count = await page.locator(sel).count();
        return { pass: count > 0, type, selector: sel, count };
      }

      if (type === "elementEnabled") {
        const sel = String(selector ?? "").trim();
        if (!sel) throw new Error("Missing selector for elementEnabled");
        const enabled = await page.locator(sel).first().isEnabled({ timeout: 2000 });
        return { pass: enabled, type, selector: sel };
      }

      throw new Error(`Unsupported verify type=${type}`);
    });
  },
});

export const playwrightDiagnosticsTool = tool({
  description: playwrightDiagnosticsToolDef.description,
  inputSchema: zodSchema(playwrightDiagnosticsToolDef.parameters),
  execute: async ({ pageTargetId, targetId, target, limit }) => {
    const guard = requireActiveTabPageTarget({ pageTargetId, targetId });
    if (!guard.ok) return guard;

    const take = typeof limit === "number" ? limit : 50;

    if (target === "consoleRecent") {
      const store = getOrCreateConsoleStore(pageTargetId);
      const list = store.records.slice(-take);
      return {
        ok: true as const,
        data: {
          count: list.length,
          messages: list.map((m) => ({
            msgId: m.msgId,
            type: m.type,
            text: truncateText(m.text, 500),
            timestamp: m.timestamp,
          })),
        },
      };
    }

    if (target === "networkRecent" || target === "networkFailedRecent") {
      const store = getOrCreateNetworkStore(pageTargetId);
      const ids = store.order.slice(-take);
      const entries = ids
        .map((id) => store.records.get(id))
        .filter(Boolean)
        .map((r) => ({
          requestId: r!.requestId,
          url: r!.url,
          method: r!.method,
          status: r!.status,
          resourceType: r!.resourceType,
          mimeType: r!.mimeType,
          updatedAt: r!.updatedAt,
        }));

      const filtered =
        target === "networkFailedRecent"
          ? entries.filter((e) => typeof e.status === "number" && e.status >= 400)
          : entries;

      return { ok: true as const, data: { count: filtered.length, entries: filtered } };
    }

    if (target === "urlTitle") {
      return await withCdpPage({ pageTargetId, targetId }, async ({ page }) => {
        let title: string | null = null;
        try {
          title = typeof page?.title === "function" ? await page.title() : null;
        } catch {
          // ignore
        }
        const url = typeof page?.url === "function" ? page.url() : undefined;
        if (url) browserSessionRegistry.updateUrl(pageTargetId, url);
        return { url, title };
      });
    }

    return { ok: false as const, error: `Unsupported diagnostics target=${target}` };
  },
});

export const playwrightPageTool = tool({
  description: playwrightPageToolDef.description,
  inputSchema: zodSchema(playwrightPageToolDef.parameters),
  execute: async ({ pageTargetId, targetId, action, url, waitUntil, timeoutMs }) => {
    return await withCdpPage({ pageTargetId, targetId }, async ({ page }) => {
      const timeout = typeof timeoutMs === "number" ? timeoutMs : 0;
      const wait = waitUntil ?? "load";

      if (action === "navigate") {
        if (!url) throw new Error("Missing url when action=navigate");
        await page.goto?.(url, { timeout: timeout || undefined, waitUntil: wait });
      } else if (action === "reload") {
        await page.reload?.({ timeout: timeout || undefined, waitUntil: wait });
      } else if (action === "back") {
        await page.goBack?.({ timeout: timeout || undefined, waitUntil: wait });
      } else if (action === "forward") {
        await page.goForward?.({ timeout: timeout || undefined, waitUntil: wait });
      } else {
        throw new Error(`Unsupported page action=${action}`);
      }

      const nextUrl = typeof page?.url === "function" ? page.url() : undefined;
      if (nextUrl) browserSessionRegistry.updateUrl(pageTargetId, nextUrl);
      return { navigated: true, action, url: nextUrl };
    });
  },
});
