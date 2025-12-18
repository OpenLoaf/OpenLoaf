import { tool, zodSchema } from "ai";
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
import { updatePageTargetUrl } from "./pageTargets";
import { buildAxSnapshotText } from "./playwrightMcp/axSnapshot";
import {
  dispatchClickAtPoint,
  dispatchMouseMoveAtPoint,
  getNodeCenterPoint,
  parseBackendNodeId,
} from "./playwrightMcp/dom";
import { requireActiveTabPageTarget } from "./playwrightMcp/guards";
import { summarizeHeaders } from "./playwrightMcp/networkSummary";
import { getOrCreateConsoleStore, getOrCreateNetworkStore } from "./playwrightMcp/stores";
import { safeJsonSize, truncateText } from "./playwrightMcp/text";
import { withCdpPage } from "./playwrightMcp/withCdpPage";

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
 * 在页面上下文内执行 storage 操作（keys/get/set/remove/clear）。
 * - 注意：该函数会被序列化后注入浏览器执行（用于 page.evaluate）。
 */
function evalStorageOperationInPage({
  storage,
  op,
  keyList,
  entryObj,
  include,
  max,
}: any) {
  const s: any = storage === "sessionStorage" ? window.sessionStorage : window.localStorage;

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
      await dispatchMouseMoveAtPoint(cdp, point);
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

      const selectAll = getSelectAllShortcut();
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

          const selectAll = getSelectAllShortcut();
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
        pageBodyIncludesText,
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
    const guard = requireActiveTabPageTarget(pageTargetId);
    if (!guard.ok) return guard;

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
    const guard = requireActiveTabPageTarget(pageTargetId);
    if (!guard.ok) return guard;

    const store = getOrCreateNetworkStore(pageTargetId);
    const rec = store.records.get(String(requestId));
    if (!rec) {
      return { ok: false, error: `Unknown requestId=${requestId} (not captured yet).` };
    }

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
    const guard = requireActiveTabPageTarget(pageTargetId);
    if (!guard.ok) return guard;

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
    const guard = requireActiveTabPageTarget(pageTargetId);
    if (!guard.ok) return guard;

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
        evalStorageOperationInPage,
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
