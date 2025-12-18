import { tool, zodSchema } from "ai";
import { requireActiveTab } from "@/chat/ui/emit";
import { getCdpConfig } from "@teatime-ai/config";
import {
  playwrightClickToolDef,
  playwrightCookiesToolDef,
  playwrightDomSnapshotToolDef,
  playwrightDragToolDef,
  playwrightEvaluateScriptToolDef,
  playwrightFillFormToolDef,
  playwrightFillToolDef,
  playwrightGetConsoleMessageToolDef,
  playwrightGetNetworkRequestToolDef,
  playwrightHoverToolDef,
  playwrightListConsoleMessagesToolDef,
  playwrightListNetworkRequestsToolDef,
  playwrightNavigatePageToolDef,
  playwrightNetworkGetResponseBodyToolDef,
  playwrightPressKeyToolDef,
  playwrightStorageToolDef,
  playwrightTakeSnapshotToolDef,
  playwrightWaitForToolDef,
} from "@teatime-ai/api/types/tools/playwright";
import { getPageTarget, updatePageTargetUrl } from "./pageTargets";

/**
 * 注意：本文件运行在 Node 端，但会把部分函数体传入浏览器执行（page.evaluate / page.waitForFunction）。
 * server 的 tsconfig 不包含 DOM lib，因此这里显式声明 window/document，避免类型检查报错。
 */
declare const window: any;
declare const document: any;

type UrlMatch = { mode: "includes"; url: string };

type NetworkRecord = {
  requestId: string;
  url?: string;
  method?: string;
  resourceType?: string;
  requestHeaders?: Record<string, string>;
  status?: number;
  statusText?: string;
  mimeType?: string;
  responseHeaders?: Record<string, string>;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  encodedDataLength?: number;
  tsRequest?: number;
  tsResponse?: number;
  updatedAt: number;
};

type NetworkStore = {
  order: string[];
  records: Map<string, NetworkRecord>;
  max: number;
};

type ConsoleRecord = {
  msgId: number;
  type: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  argsPreview?: string[];
};

type ConsoleStore = {
  nextId: number;
  records: ConsoleRecord[];
  max: number;
};

const networkStores = new Map<string, NetworkStore>();
const consoleStores = new Map<string, ConsoleStore>();

/**
 * 获取或创建指定 pageTargetId 的网络记录缓存。
 * - 仅用于“摘要展示/定位 requestId”，避免把大字段写进对话上下文。
 */
function getOrCreateNetworkStore(pageTargetId: string): NetworkStore {
  const existing = networkStores.get(pageTargetId);
  if (existing) return existing;
  const created: NetworkStore = { order: [], records: new Map(), max: 1000 };
  networkStores.set(pageTargetId, created);
  return created;
}

/**
 * 获取或创建指定 pageTargetId 的 console 记录缓存。
 * - 仅保存短文本预览，避免输出过长导致上下文溢出。
 */
function getOrCreateConsoleStore(pageTargetId: string): ConsoleStore {
  const existing = consoleStores.get(pageTargetId);
  if (existing) return existing;
  const created: ConsoleStore = { nextId: 1, records: [], max: 1000 };
  consoleStores.set(pageTargetId, created);
  return created;
}

/**
 * 粗略估算 JSON 序列化后的字符长度（用于提前截断超大返回）。
 */
function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return -1;
  }
}

/**
 * 对长文本做截断，避免 tool 输出过长写入对话历史。
 */
function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + `…[truncated ${value.length - maxChars} chars]`;
}

/**
 * 将 take-snapshot 返回的 uid（backendDOMNodeId）解析成数字。
 */
function parseBackendNodeId(uid: string): number {
  const raw = String(uid ?? "").trim();
  if (!raw) throw new Error("Missing uid");
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid uid: ${raw}`);
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Invalid uid: ${raw}`);
  return num;
}

/**
 * 将 URL 匹配规则转换为匹配函数（MVP：仅支持 includes）。
 */
function toUrlMatcher(rule: UrlMatch): (url: string) => boolean {
  return (url: string) => url.includes(rule.url);
}

/**
 * 从 /json/version 拉取 CDP webSocketDebuggerUrl（由 @teatime-ai/config 提供 versionUrl）。
 */
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

/**
 * 在现有 CDP browser 连接里选中一个“已存在的 page”。
 * - 约束：不允许通过 CDP 创建/切换标签页，只能 attach 到 open-url 打开的页面。
 */
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
  const matches = toUrlMatcher(preferredUrlRule);

  while (Date.now() - startedAt < timeoutMs) {
    const contexts = browser.contexts?.() ?? [];
    const pages = contexts.flatMap((ctx: any) => (ctx.pages?.() ?? []));
    const match = [...pages].reverse().find((p: any) => matches(p.url?.() ?? ""));
    if (match) return match;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/**
 * 安装“禁止新页面”的约束：
 * - 如果页面内产生 popup/new tab，自动关闭，只允许在当前 page 内导航。
 */
function installNoNewPageConstraint(page: any) {
  const closeIfNotCurrent = async (p: any) => {
    if (!p || p === page) return;
    try {
      await p.close?.();
    } catch {
      // ignore
    }
  };
  try {
    page.on?.("popup", closeIfNotCurrent);
  } catch {
    // ignore
  }
  try {
    page.context?.().on?.("page", closeIfNotCurrent);
  } catch {
    // ignore
  }
}

/**
 * 将 CDP 网络/console 事件收敛到内存缓存中（仅短摘要）。
 * 注意：此缓存只在当前 node 进程内有效。
 */
async function installCdpCollectors(pageTargetId: string, cdp: any) {
  const networkStore = getOrCreateNetworkStore(pageTargetId);
  const consoleStore = getOrCreateConsoleStore(pageTargetId);

  await cdp.send("Network.enable").catch(() => {});
  await cdp.send("Runtime.enable").catch(() => {});

  cdp.on("Network.requestWillBeSent", (evt: any) => {
    const requestId = String(evt?.requestId ?? "");
    if (!requestId) return;

    const url = String(evt?.request?.url ?? "");
    const method = String(evt?.request?.method ?? "");
    const resourceType = typeof evt?.type === "string" ? evt.type : undefined;
    const headers = evt?.request?.headers;

    let record = networkStore.records.get(requestId);
    if (!record) {
      record = { requestId, updatedAt: Date.now() };
      networkStore.records.set(requestId, record);
      networkStore.order.push(requestId);
      if (networkStore.order.length > networkStore.max) {
        const removed = networkStore.order.splice(
          0,
          networkStore.order.length - networkStore.max,
        );
        for (const id of removed) networkStore.records.delete(id);
      }
    }

    record.url = url || record.url;
    record.method = method || record.method;
    record.resourceType = resourceType || record.resourceType;
    if (headers && typeof headers === "object") {
      record.requestHeaders = headers as Record<string, string>;
    }
    record.tsRequest = typeof evt?.timestamp === "number" ? evt.timestamp : record.tsRequest;
    record.updatedAt = Date.now();
  });

  cdp.on("Network.responseReceived", (evt: any) => {
    const requestId = String(evt?.requestId ?? "");
    if (!requestId) return;

    const response = evt?.response ?? {};
    const status = typeof response?.status === "number" ? response.status : undefined;
    const statusText = typeof response?.statusText === "string" ? response.statusText : undefined;
    const mimeType = typeof response?.mimeType === "string" ? response.mimeType : undefined;
    const headers = response?.headers;
    const fromDiskCache = Boolean(response?.fromDiskCache);
    const fromServiceWorker = Boolean(response?.fromServiceWorker);

    let record = networkStore.records.get(requestId);
    if (!record) {
      record = { requestId, updatedAt: Date.now() };
      networkStore.records.set(requestId, record);
      networkStore.order.push(requestId);
      if (networkStore.order.length > networkStore.max) {
        const removed = networkStore.order.splice(
          0,
          networkStore.order.length - networkStore.max,
        );
        for (const id of removed) networkStore.records.delete(id);
      }
    }

    record.status = status ?? record.status;
    record.statusText = statusText ?? record.statusText;
    record.mimeType = mimeType ?? record.mimeType;
    record.fromDiskCache = fromDiskCache;
    record.fromServiceWorker = fromServiceWorker;
    if (headers && typeof headers === "object") {
      record.responseHeaders = headers as Record<string, string>;
    }
    record.tsResponse = typeof evt?.timestamp === "number" ? evt.timestamp : record.tsResponse;
    record.updatedAt = Date.now();
  });

  cdp.on("Network.loadingFinished", (evt: any) => {
    const requestId = String(evt?.requestId ?? "");
    if (!requestId) return;
    const record = networkStore.records.get(requestId);
    if (!record) return;
    if (typeof evt?.encodedDataLength === "number") {
      record.encodedDataLength = evt.encodedDataLength;
      record.updatedAt = Date.now();
    }
  });

  const pushConsoleRecord = (record: Omit<ConsoleRecord, "msgId">) => {
    const msgId = consoleStore.nextId++;
    const item: ConsoleRecord = { msgId, ...record };
    consoleStore.records.push(item);
    if (consoleStore.records.length > consoleStore.max) {
      consoleStore.records.splice(0, consoleStore.records.length - consoleStore.max);
    }
  };

  cdp.on("Runtime.consoleAPICalled", (evt: any) => {
    const type = typeof evt?.type === "string" ? evt.type : "log";
    const args = Array.isArray(evt?.args) ? evt.args : [];
    const preview = args
      .map((a: any) => {
        if (typeof a?.value === "string") return truncateText(a.value, 200);
        if (typeof a?.value === "number") return String(a.value);
        if (typeof a?.value === "boolean") return String(a.value);
        if (a?.type === "undefined") return "undefined";
        if (a?.type === "object" && a?.subtype === "null") return "null";
        if (typeof a?.description === "string") return truncateText(a.description, 200);
        return truncateText(String(a?.type ?? "unknown"), 50);
      })
      .slice(0, 10);
    const text = preview.join(" ");
    pushConsoleRecord({
      type,
      text,
      timestamp: typeof evt?.timestamp === "number" ? evt.timestamp : Date.now(),
      argsPreview: preview,
    });
  });

  cdp.on("Runtime.exceptionThrown", (evt: any) => {
    const details = evt?.exceptionDetails ?? {};
    const text =
      typeof details?.text === "string"
        ? details.text
        : typeof evt?.exceptionDetails?.exception?.description === "string"
          ? evt.exceptionDetails.exception.description
          : "exceptionThrown";
    pushConsoleRecord({
      type: "exception",
      text: truncateText(text, 500),
      timestamp: typeof evt?.timestamp === "number" ? evt.timestamp : Date.now(),
      url:
        typeof details?.url === "string"
          ? details.url
          : undefined,
      lineNumber: typeof details?.lineNumber === "number" ? details.lineNumber : undefined,
      columnNumber: typeof details?.columnNumber === "number" ? details.columnNumber : undefined,
    });
  });
}

/**
 * 计算元素的中心点坐标（用于鼠标点击/hover/拖拽）。
 */
async function getNodeCenterPoint(cdp: any, backendNodeId: number) {
  await cdp.send("DOM.enable").catch(() => {});
  await cdp.send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});

  try {
    const res = await cdp.send("DOM.getContentQuads", { backendNodeId });
    const quad = (res as any)?.quads?.[0];
    if (Array.isArray(quad) && quad.length === 8) {
      const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
      const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
      return { x, y };
    }
  } catch {
    // fall through
  }

  const res = await cdp.send("DOM.getBoxModel", { backendNodeId });
  const quad = (res as any)?.model?.content;
  if (!Array.isArray(quad) || quad.length !== 8) {
    throw new Error("Cannot compute element center point.");
  }
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  return { x, y };
}

/**
 * 用 CDP Input.dispatchMouseEvent 在坐标点执行一次点击。
 */
async function dispatchClickAtPoint(cdp: any, point: { x: number; y: number }, clickCount: number) {
  const x = Math.max(0, point.x);
  const y = Math.max(0, point.y);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount,
  });
}

/**
 * 通用的 CDP Page wrapper：
 * - 校验 pageTargetId 归属当前 activeTab
 * - connectOverCDP + attach page
 * - 安装“禁止新页面”与网络/console 收敛器
 */
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

    installNoNewPageConstraint(page);

    const context = page.context?.();
    if (!context?.newCDPSession) {
      return { ok: false, error: "CDP session is not available for this page." };
    }

    const cdp = await context.newCDPSession(page);
    await installCdpCollectors(pageTargetId, cdp);

    return { ok: true, data: await fn({ page, cdp }) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    try {
      await browser?.close?.();
    } catch {
      // ignore
    }
  }
}

/**
 * 将 CDP AXValue 转换为可读字符串。
 */
function axValueToText(v: any): string {
  const value = v?.value;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (value == null) return "";
  return String(value);
}

/**
 * 粗略判断“更可能可操作/可定位”的 a11y role。
 */
function isInterestingAxRole(role: string) {
  return (
    role === "button" ||
    role === "link" ||
    role === "textbox" ||
    role === "searchbox" ||
    role === "combobox" ||
    role === "checkbox" ||
    role === "radio" ||
    role === "switch" ||
    role === "tab" ||
    role === "menuitem" ||
    role === "option" ||
    role === "listbox" ||
    role === "slider" ||
    role === "spinbutton" ||
    role === "heading"
  );
}

/**
 * 将 Accessibility Tree 收敛为“可读文本 + uid 列表”。
 * - 默认只输出“更可能可操作/可定位”的节点，避免返回整棵树导致超长。
 */
function buildAxSnapshotText(input: {
  nodes: any[];
  verbose: boolean;
  maxChars: number;
}) {
  const { nodes, verbose, maxChars } = input;
  const lines: string[] = [];
  let currentChars = 0;

  const pushLine = (line: string) => {
    const next = currentChars + line.length + (lines.length > 0 ? 1 : 0);
    if (next > maxChars) return false;
    lines.push(line);
    currentChars = next;
    return true;
  };

  let shown = 0;
  for (const node of nodes) {
    if (!node || node.ignored === true) continue;
    const role = axValueToText(node.role);
    const name = axValueToText(node.name);
    const value = axValueToText(node.value);
    const uid =
      typeof node.backendDOMNodeId === "number"
        ? String(node.backendDOMNodeId)
        : undefined;

    const interesting =
      verbose ||
      Boolean(uid) ||
      isInterestingAxRole(role) ||
      Boolean(name) ||
      Boolean(value);
    if (!interesting) continue;

    const parts: string[] = [];
    if (uid) parts.push(`uid=${uid}`);
    if (role) parts.push(`role=${role}`);
    if (name) parts.push(`name=${JSON.stringify(truncateText(name, 200))}`);
    if (value) parts.push(`value=${JSON.stringify(truncateText(value, 200))}`);

    if (parts.length === 0) continue;
    if (!pushLine(`- ${parts.join(" ")}`)) break;
    shown++;
    if (!verbose && shown >= 300) {
      pushLine("- …[truncated: too many nodes]");
      break;
    }
  }

  const text = lines.join("\n");
  return { text: truncateText(text, maxChars), shown };
}

export const playwrightTakeSnapshotTool = tool({
  description: playwrightTakeSnapshotToolDef.description,
  inputSchema: zodSchema(playwrightTakeSnapshotToolDef.parameters),
  execute: async ({ pageTargetId, verbose, maxChars }) => {
    return await withCdpPage(pageTargetId, async ({ page, cdp }) => {
      await cdp.send("Accessibility.enable").catch(() => {});
      const tree = await cdp.send("Accessibility.getFullAXTree");
      const nodes = Array.isArray((tree as any)?.nodes)
        ? (tree as any).nodes
        : Array.isArray(tree)
          ? tree
          : [];

      const max = typeof maxChars === "number" ? maxChars : 20_000;
      const { text, shown } = buildAxSnapshotText({
        nodes,
        verbose: verbose ?? false,
        maxChars: max,
      });

      let title: string | null = null;
      try {
        title = typeof page?.title === "function" ? await page.title() : null;
      } catch {
        // ignore
      }

      return {
        url: typeof page?.url === "function" ? page.url() : undefined,
        title,
        nodeCount: nodes.length,
        shown,
        snapshotText: text,
      };
    });
  },
});

export const playwrightClickTool = tool({
  description: playwrightClickToolDef.description,
  inputSchema: zodSchema(playwrightClickToolDef.parameters),
  execute: async ({ pageTargetId, uid, dblClick }) => {
    const backendNodeId = parseBackendNodeId(uid);
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      const point = await getNodeCenterPoint(cdp, backendNodeId);
      if (!dblClick) {
        await dispatchClickAtPoint(cdp, point, 1);
        return { clicked: true };
      }
      await dispatchClickAtPoint(cdp, point, 1);
      await dispatchClickAtPoint(cdp, point, 2);
      return { clicked: true, dblClick: true };
    });
  },
});

export const playwrightHoverTool = tool({
  description: playwrightHoverToolDef.description,
  inputSchema: zodSchema(playwrightHoverToolDef.parameters),
  execute: async ({ pageTargetId, uid }) => {
    const backendNodeId = parseBackendNodeId(uid);
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      const point = await getNodeCenterPoint(cdp, backendNodeId);
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Math.max(0, point.x),
        y: Math.max(0, point.y),
      });
      return { hovered: true };
    });
  },
});

export const playwrightDragTool = tool({
  description: playwrightDragToolDef.description,
  inputSchema: zodSchema(playwrightDragToolDef.parameters),
  execute: async ({ pageTargetId, from_uid, to_uid }) => {
    const from = parseBackendNodeId(from_uid);
    const to = parseBackendNodeId(to_uid);
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      const start = await getNodeCenterPoint(cdp, from);
      const end = await getNodeCenterPoint(cdp, to);
      const sx = Math.max(0, start.x);
      const sy = Math.max(0, start.y);
      const ex = Math.max(0, end.x);
      const ey = Math.max(0, end.y);

      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sx, y: sy });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: sx,
        y: sy,
        button: "left",
        clickCount: 1,
      });

      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: sx + (ex - sx) * t,
          y: sy + (ey - sy) * t,
          buttons: 1,
        });
      }

      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: ex,
        y: ey,
        button: "left",
        clickCount: 1,
      });
      return { dragged: true };
    });
  },
});

export const playwrightFillTool = tool({
  description: playwrightFillToolDef.description,
  inputSchema: zodSchema(playwrightFillToolDef.parameters),
  execute: async ({ pageTargetId, uid, value }) => {
    const backendNodeId = parseBackendNodeId(uid);
    return await withCdpPage(pageTargetId, async ({ page, cdp }) => {
      // 先点击聚焦，再用键盘全选清空，最后输入（更兼容 React/Vue 表单）。
      const point = await getNodeCenterPoint(cdp, backendNodeId);
      await dispatchClickAtPoint(cdp, point, 1);

      const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A";
      try {
        await page.keyboard?.press?.(selectAll);
        await page.keyboard?.press?.("Backspace");
      } catch {
        // ignore
      }

      await page.keyboard?.type?.(String(value ?? ""));
      return { filled: true, chars: String(value ?? "").length };
    });
  },
});

export const playwrightFillFormTool = tool({
  description: playwrightFillFormToolDef.description,
  inputSchema: zodSchema(playwrightFillFormToolDef.parameters),
  execute: async ({ pageTargetId, elements }) => {
    return await withCdpPage(pageTargetId, async ({ page, cdp }) => {
      const results: Array<{ uid: string; ok: boolean; error?: string }> = [];
      for (const el of elements) {
        try {
          const backendNodeId = parseBackendNodeId(el.uid);
          const point = await getNodeCenterPoint(cdp, backendNodeId);
          await dispatchClickAtPoint(cdp, point, 1);

          const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A";
          try {
            await page.keyboard?.press?.(selectAll);
            await page.keyboard?.press?.("Backspace");
          } catch {
            // ignore
          }

          await page.keyboard?.type?.(String(el.value ?? ""));
          results.push({ uid: el.uid, ok: true });
        } catch (err: any) {
          results.push({ uid: el.uid, ok: false, error: err?.message ?? String(err) });
        }
      }
      return { results };
    });
  },
});

export const playwrightPressKeyTool = tool({
  description: playwrightPressKeyToolDef.description,
  inputSchema: zodSchema(playwrightPressKeyToolDef.parameters),
  execute: async ({ pageTargetId, key }) => {
    return await withCdpPage(pageTargetId, async ({ page }) => {
      await page.keyboard?.press?.(key);
      return { pressed: true };
    });
  },
});

export const playwrightNavigatePageTool = tool({
  description: playwrightNavigatePageToolDef.description,
  inputSchema: zodSchema(playwrightNavigatePageToolDef.parameters),
  execute: async ({ pageTargetId, type, url, ignoreCache, timeoutMs }) => {
    return await withCdpPage(pageTargetId, async ({ page, cdp }) => {
      const timeout = typeof timeoutMs === "number" ? timeoutMs : 0;
      if (type === "url") {
        if (!url) throw new Error("Missing url when type=url");
        await page.goto(url, { timeout: timeout || undefined });
      } else if (type === "reload") {
        if (ignoreCache) {
          await cdp.send("Page.reload", { ignoreCache: true });
        } else {
          await page.reload({ timeout: timeout || undefined });
        }
      } else if (type === "back") {
        await page.goBack({ timeout: timeout || undefined });
      } else if (type === "forward") {
        await page.goForward({ timeout: timeout || undefined });
      }

      const nextUrl = typeof page?.url === "function" ? page.url() : undefined;
      if (nextUrl) updatePageTargetUrl(pageTargetId, nextUrl);
      return { navigated: true, url: nextUrl };
    });
  },
});

export const playwrightWaitForTool = tool({
  description: playwrightWaitForToolDef.description,
  inputSchema: zodSchema(playwrightWaitForToolDef.parameters),
  execute: async ({ pageTargetId, text, timeoutMs }) => {
    return await withCdpPage(pageTargetId, async ({ page }) => {
      const timeout = typeof timeoutMs === "number" ? timeoutMs : 0;
      await page.waitForFunction(
        (t: string) =>
          Boolean(document.body?.innerText) &&
          document.body.innerText.includes(t),
        text,
        { timeout: timeout || undefined },
      );
      return { found: true };
    });
  },
});

export const playwrightEvaluateScriptTool = tool({
  description: playwrightEvaluateScriptToolDef.description,
  inputSchema: zodSchema(playwrightEvaluateScriptToolDef.parameters),
  execute: async ({ pageTargetId, function: fn, args, awaitPromise, returnByValue }) => {
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      await cdp.send("Runtime.enable").catch(() => {});

      const uids = Array.isArray(args) ? args.map((a: any) => String(a?.uid ?? "")).filter(Boolean) : [];
      const awaitP = awaitPromise ?? true;
      const rbv = returnByValue ?? true;

      // 无参数：直接 evaluate `(${fn})()`
      if (uids.length === 0) {
        const result = await cdp.send("Runtime.evaluate", {
          expression: `(${fn})()`,
          awaitPromise: awaitP,
          returnByValue: rbv,
        });
        const approxChars = safeJsonSize(result);
        const MAX_CHARS = 40_000;
        if (approxChars > MAX_CHARS) {
          return { summary: { approxChars, maxChars: MAX_CHARS, truncated: true } };
        }
        return result;
      }

      // 有元素参数：用第一个元素做 this，并把 this 作为第一个参数传入用户函数。
      const [first, ...rest] = uids;
      if (!first) throw new Error("Missing uid args[0].uid");
      const firstNodeId = parseBackendNodeId(first);

      const resolvedFirst = await cdp.send("DOM.resolveNode", { backendNodeId: firstNodeId });
      const firstObjectId = (resolvedFirst as any)?.object?.objectId;
      if (!firstObjectId) throw new Error("Cannot resolve first uid to objectId.");

      const callArgs: any[] = [];
      for (const u of rest) {
        const nodeId = parseBackendNodeId(u);
        const resolved = await cdp.send("DOM.resolveNode", { backendNodeId: nodeId });
        const objectId = (resolved as any)?.object?.objectId;
        if (!objectId) throw new Error(`Cannot resolve uid=${u} to objectId.`);
        callArgs.push({ objectId });
      }

      const result = await cdp.send("Runtime.callFunctionOn", {
        objectId: firstObjectId,
        functionDeclaration: `function(...args){ const fn = (${fn}); return fn(this, ...args); }`,
        arguments: callArgs,
        awaitPromise: awaitP,
        returnByValue: rbv,
      });

      const approxChars = safeJsonSize(result);
      const MAX_CHARS = 40_000;
      if (approxChars > MAX_CHARS) {
        return { summary: { approxChars, maxChars: MAX_CHARS, truncated: true } };
      }
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
      const snapshot = await cdp.send("DOMSnapshot.captureSnapshot", {
        computedStyles: computedStyles ?? [],
        includeDOMRects: includeDOMRects ?? false,
        includePaintOrder: includePaintOrder ?? false,
      });
      const approxChars = safeJsonSize(snapshot);
      const summary = {
        approxChars,
        documentsCount: Array.isArray((snapshot as any)?.documents)
          ? (snapshot as any).documents.length
          : 0,
        stringsCount: Array.isArray((snapshot as any)?.strings)
          ? (snapshot as any).strings.length
          : 0,
        hasLayout: Boolean((snapshot as any)?.layout),
        computedStylesCount: Array.isArray(computedStyles)
          ? computedStyles.length
          : 0,
        includeDOMRects: includeDOMRects ?? false,
        includePaintOrder: includePaintOrder ?? false,
      };
      return { summary };
    });
  },
});

export const playwrightListNetworkRequestsTool = tool({
  description: playwrightListNetworkRequestsToolDef.description,
  inputSchema: zodSchema(playwrightListNetworkRequestsToolDef.parameters),
  execute: async ({ pageTargetId, limit, kind }) => {
    const activeTab = requireActiveTab();
    const record = getPageTarget(pageTargetId);
    if (!record) {
      return { ok: false, error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first.` };
    }
    if (record.tabId !== activeTab.id) {
      return { ok: false, error: `pageTargetId=${pageTargetId} does not belong to activeTab.id=${activeTab.id}` };
    }

    const store = getOrCreateNetworkStore(pageTargetId);
    const take = typeof limit === "number" ? limit : 50;
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
        fromDiskCache: r!.fromDiskCache,
        fromServiceWorker: r!.fromServiceWorker,
        encodedDataLength: r!.encodedDataLength,
        updatedAt: r!.updatedAt,
      }));

    const filtered =
      kind === "request"
        ? entries.filter((e) => Boolean(e.method))
        : kind === "response"
          ? entries.filter((e) => typeof e.status === "number")
          : entries;

    return { ok: true, data: { count: filtered.length, entries: filtered } };
  },
});

export const playwrightGetNetworkRequestTool = tool({
  description: playwrightGetNetworkRequestToolDef.description,
  inputSchema: zodSchema(playwrightGetNetworkRequestToolDef.parameters),
  execute: async ({ pageTargetId, requestId }) => {
    const activeTab = requireActiveTab();
    const record = getPageTarget(pageTargetId);
    if (!record) {
      return { ok: false, error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first.` };
    }
    if (record.tabId !== activeTab.id) {
      return { ok: false, error: `pageTargetId=${pageTargetId} does not belong to activeTab.id=${activeTab.id}` };
    }

    const store = getOrCreateNetworkStore(pageTargetId);
    const rec = store.records.get(String(requestId));
    if (!rec) {
      return { ok: false, error: `Unknown requestId=${requestId} (not captured yet).` };
    }

    const summarizeHeaders = (headers?: Record<string, string>) => {
      if (!headers) return undefined;
      const allKeys = Object.keys(headers);
      const keys = allKeys.slice(0, 50);
      const important: Record<string, string> = {};
      const pick = (k: string) => {
        const v = headers[k];
        if (typeof v !== "string") return;
        important[k] = truncateText(v, 500);
      };
      pick("content-type");
      pick("location");
      pick("referer");
      pick("user-agent");
      return {
        count: allKeys.length,
        keys,
        important,
      };
    };

    return {
      ok: true,
      data: {
        requestId: rec.requestId,
        url: rec.url,
        method: rec.method,
        resourceType: rec.resourceType,
        status: rec.status,
        statusText: rec.statusText,
        mimeType: rec.mimeType,
        fromDiskCache: rec.fromDiskCache,
        fromServiceWorker: rec.fromServiceWorker,
        encodedDataLength: rec.encodedDataLength,
        requestHeaders: summarizeHeaders(rec.requestHeaders),
        responseHeaders: summarizeHeaders(rec.responseHeaders),
        updatedAt: rec.updatedAt,
      },
    };
  },
});

export const playwrightNetworkGetResponseBodyTool = tool({
  description: playwrightNetworkGetResponseBodyToolDef.description,
  inputSchema: zodSchema(playwrightNetworkGetResponseBodyToolDef.parameters),
  execute: async ({ pageTargetId, requestId }) => {
    return await withCdpPage(pageTargetId, async ({ cdp }) => {
      await cdp.send("Network.enable").catch(() => {});
      const result = await cdp.send("Network.getResponseBody", { requestId });
      const body: string = (result as any)?.body ?? "";
      const base64Encoded: boolean = Boolean((result as any)?.base64Encoded);
      const MAX_PREVIEW_CHARS = 2000;
      return {
        requestId,
        base64Encoded,
        bodyChars: body.length,
        bodyPreview: body.slice(0, MAX_PREVIEW_CHARS),
        truncated: body.length > MAX_PREVIEW_CHARS,
      };
    });
  },
});

export const playwrightListConsoleMessagesTool = tool({
  description: playwrightListConsoleMessagesToolDef.description,
  inputSchema: zodSchema(playwrightListConsoleMessagesToolDef.parameters),
  execute: async ({ pageTargetId, limit, types }) => {
    const activeTab = requireActiveTab();
    const record = getPageTarget(pageTargetId);
    if (!record) {
      return { ok: false, error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first.` };
    }
    if (record.tabId !== activeTab.id) {
      return { ok: false, error: `pageTargetId=${pageTargetId} does not belong to activeTab.id=${activeTab.id}` };
    }

    const store = getOrCreateConsoleStore(pageTargetId);
    const take = typeof limit === "number" ? limit : 50;
    const list = store.records.slice(-take);
    const filtered =
      Array.isArray(types) && types.length > 0
        ? list.filter((m) => types.includes(m.type))
        : list;
    return {
      ok: true,
      data: {
        count: filtered.length,
        messages: filtered.map((m) => ({
          msgId: m.msgId,
          type: m.type,
          text: truncateText(m.text, 500),
          timestamp: m.timestamp,
        })),
      },
    };
  },
});

export const playwrightGetConsoleMessageTool = tool({
  description: playwrightGetConsoleMessageToolDef.description,
  inputSchema: zodSchema(playwrightGetConsoleMessageToolDef.parameters),
  execute: async ({ pageTargetId, msgId }) => {
    const activeTab = requireActiveTab();
    const record = getPageTarget(pageTargetId);
    if (!record) {
      return { ok: false, error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first.` };
    }
    if (record.tabId !== activeTab.id) {
      return { ok: false, error: `pageTargetId=${pageTargetId} does not belong to activeTab.id=${activeTab.id}` };
    }

    const store = getOrCreateConsoleStore(pageTargetId);
    const found = store.records.find((m) => m.msgId === msgId);
    if (!found) return { ok: false, error: `Unknown msgId=${msgId}` };
    return {
      ok: true,
      data: {
        msgId: found.msgId,
        type: found.type,
        text: truncateText(found.text, 5_000),
        timestamp: found.timestamp,
        url: found.url,
        lineNumber: found.lineNumber,
        columnNumber: found.columnNumber,
        argsPreview: found.argsPreview,
      },
    };
  },
});

export const playwrightStorageTool = tool({
  description: playwrightStorageToolDef.description,
  inputSchema: zodSchema(playwrightStorageToolDef.parameters),
  execute: async ({
    pageTargetId,
    storage,
    op,
    keys,
    entries,
    includeValues,
    maxValueChars,
  }) => {
    return await withCdpPage(pageTargetId, async ({ page }) => {
      const max = typeof maxValueChars === "number" ? maxValueChars : 2000;
      const include = includeValues ?? false;
      const keyList = Array.isArray(keys) ? keys.map(String).filter(Boolean) : [];
      const entryObj = (entries ?? {}) as Record<string, string>;

      const data = await page.evaluate(
        ({ storage, op, keyList, entryObj, include, max }: any) => {
          const s: any =
            storage === "sessionStorage" ? window.sessionStorage : window.localStorage;

          const allKeys: string[] = [];
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k) allKeys.push(k);
          }
          const MAX_KEYS = 200;

          if (op === "keys") {
            return {
              keyCount: allKeys.length,
              keys: allKeys.slice(0, MAX_KEYS),
              truncated: allKeys.length > MAX_KEYS,
            };
          }

          if (op === "get") {
            const raw = keyList.length > 0 ? keyList : allKeys;
            const targetKeys = raw.slice(0, MAX_KEYS);
            const truncatedKeys = raw.length > MAX_KEYS;
            if (!include) {
              const valueChars: Record<string, number> = {};
              for (const k of targetKeys) {
                const v = s.getItem(k) ?? "";
                valueChars[k] = v.length;
              }
              return {
                keyCount: raw.length,
                keys: targetKeys,
                truncatedKeys,
                valueChars,
              };
            }

            const values: Record<string, string> = {};
            const truncated: Record<string, boolean> = {};
            for (const k of targetKeys) {
              const v = s.getItem(k) ?? "";
              values[k] = v.slice(0, max);
              truncated[k] = v.length > max;
            }
            return {
              keyCount: raw.length,
              keys: targetKeys,
              truncatedKeys,
              values,
              truncated,
            };
          }

          if (op === "set") {
            const list = Object.entries(entryObj ?? {});
            for (const [k, v] of list) s.setItem(k, String(v));
            return { setCount: list.length };
          }

          if (op === "remove") {
            const targetKeys = keyList.length > 0 ? keyList : [];
            for (const k of targetKeys) s.removeItem(k);
            return { removedCount: targetKeys.length };
          }

          if (op === "clear") {
            const before = s.length;
            s.clear();
            return { cleared: true, before };
          }

          return { error: `Unsupported op: ${op}` };
        },
        { storage, op, keyList, entryObj, include, max },
      );

      return { storage, op, data };
    });
  },
});

export const playwrightCookiesTool = tool({
  description: playwrightCookiesToolDef.description,
  inputSchema: zodSchema(playwrightCookiesToolDef.parameters),
  execute: async ({ pageTargetId, includeValue, maxValueChars }) => {
    return await withCdpPage(pageTargetId, async ({ page, cdp }) => {
      await cdp.send("Network.enable").catch(() => {});
      const url = typeof page?.url === "function" ? page.url() : undefined;
      const result = await cdp.send("Network.getCookies", {
        urls: url ? [url] : undefined,
      });
      const cookies = Array.isArray((result as any)?.cookies)
        ? (result as any).cookies
        : [];

      const include = includeValue ?? false;
      const max = typeof maxValueChars === "number" ? maxValueChars : 200;

      const list = cookies.map((c: any) => {
        const value: string = String(c?.value ?? "");
        return {
          name: String(c?.name ?? ""),
          domain: String(c?.domain ?? ""),
          path: String(c?.path ?? ""),
          expires: typeof c?.expires === "number" ? c.expires : undefined,
          httpOnly: Boolean(c?.httpOnly),
          secure: Boolean(c?.secure),
          sameSite: typeof c?.sameSite === "string" ? c.sameSite : undefined,
          valueChars: value.length,
          valuePreview: include ? truncateText(value, max) : undefined,
          truncated: include ? value.length > max : undefined,
        };
      });

      return { url, count: list.length, cookies: list };
    });
  },
});
