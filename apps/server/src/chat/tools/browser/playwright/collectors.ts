import { getOrCreateConsoleStore, getOrCreateNetworkStore } from "./stores";
import { truncateText } from "./text";

/**
 * 将 Playwright 的 network/console 事件收敛到内存缓存中（仅短摘要）。
 * 注意：此缓存只在当前 node 进程内有效。
 */
export async function installPlaywrightCollectors(pageTargetId: string, page: any) {
  const networkStore = getOrCreateNetworkStore(pageTargetId);
  const consoleStore = getOrCreateConsoleStore(pageTargetId);

  const requestIds = new WeakMap<any, string>();
  let nextRequestId = 1;

  const ensureNetworkRecord = (requestId: string) => {
    let record = networkStore.records.get(requestId);
    if (record) return record;

    record = { requestId, updatedAt: Date.now() };
    networkStore.records.set(requestId, record);
    networkStore.order.push(requestId);

    if (networkStore.order.length > networkStore.max) {
      const removed = networkStore.order.splice(0, networkStore.order.length - networkStore.max);
      for (const id of removed) networkStore.records.delete(id);
    }
    return record;
  };

  /**
   * 网络请求开始
   */
  page.on?.("request", (req: any) => {
    try {
      const requestId = `${nextRequestId++}`;
      requestIds.set(req, requestId);
      const record = ensureNetworkRecord(requestId);
      record.url = String(req?.url?.() ?? "");
      record.method = String(req?.method?.() ?? "");
      record.resourceType = typeof req?.resourceType === "function" ? req.resourceType() : undefined;
      record.requestHeaders =
        typeof req?.headers === "function" ? (req.headers() as Record<string, string>) : undefined;
      record.tsRequest = Date.now();
      record.updatedAt = Date.now();
    } catch {
      // ignore
    }
  });

  /**
   * 网络响应到达
   */
  page.on?.("response", (res: any) => {
    try {
      const req = typeof res?.request === "function" ? res.request() : null;
      const requestId = req ? requestIds.get(req) : undefined;
      if (!requestId) return;
      const record = ensureNetworkRecord(requestId);
      record.status = typeof res?.status === "function" ? res.status() : undefined;
      record.statusText = typeof res?.statusText === "function" ? res.statusText() : undefined;
      record.responseHeaders =
        typeof res?.headers === "function" ? (res.headers() as Record<string, string>) : undefined;
      record.tsResponse = Date.now();
      record.updatedAt = Date.now();
    } catch {
      // ignore
    }
  });

  /**
   * 将一条 console 记录写入内存缓存（带自增 msgId，并做容量裁剪）。
   */
  const pushConsoleRecord = (record: {
    type: string;
    text: string;
    timestamp: number;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
    argsPreview?: string[];
  }) => {
    const msgId = consoleStore.nextId++;
    consoleStore.records.push({ msgId, ...record });
    if (consoleStore.records.length > consoleStore.max) {
      consoleStore.records.splice(0, consoleStore.records.length - consoleStore.max);
    }
  };

  page.on?.("console", (msg: any) => {
    try {
      const type = typeof msg?.type === "function" ? msg.type() : "log";
      const text = typeof msg?.text === "function" ? msg.text() : String(msg ?? "");
      const loc = typeof msg?.location === "function" ? msg.location() : undefined;
      pushConsoleRecord({
        type,
        text: truncateText(text, 1000),
        timestamp: Date.now(),
        url: typeof loc?.url === "string" ? loc.url : undefined,
        lineNumber: typeof loc?.lineNumber === "number" ? loc.lineNumber : undefined,
        columnNumber: typeof loc?.columnNumber === "number" ? loc.columnNumber : undefined,
      });
    } catch {
      // ignore
    }
  });

  page.on?.("pageerror", (err: any) => {
    const text = err?.message ?? String(err);
    pushConsoleRecord({
      type: "pageerror",
      text: truncateText(text, 2000),
      timestamp: Date.now(),
    });
  });
}
