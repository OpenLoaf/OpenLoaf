import { getOrCreateConsoleStore, getOrCreateNetworkStore } from "./stores";
import { truncateText } from "./text";

/**
 * 将 CDP 网络/console 事件收敛到内存缓存中（仅短摘要）。
 * 注意：此缓存只在当前 node 进程内有效。
 */
export async function installCdpCollectors(pageTargetId: string, cdp: any) {
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
    record.tsRequest =
      typeof evt?.timestamp === "number" ? evt.timestamp : record.tsRequest;
    record.updatedAt = Date.now();
  });

  cdp.on("Network.responseReceived", (evt: any) => {
    const requestId = String(evt?.requestId ?? "");
    if (!requestId) return;

    const response = evt?.response ?? {};
    const status = typeof response?.status === "number" ? response.status : undefined;
    const statusText =
      typeof response?.statusText === "string" ? response.statusText : undefined;
    const mimeType =
      typeof response?.mimeType === "string" ? response.mimeType : undefined;
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
    record.tsResponse =
      typeof evt?.timestamp === "number" ? evt.timestamp : record.tsResponse;
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
      url: typeof details?.url === "string" ? details.url : undefined,
      lineNumber: typeof details?.lineNumber === "number" ? details.lineNumber : undefined,
      columnNumber:
        typeof details?.columnNumber === "number" ? details.columnNumber : undefined,
    });
  });
}
