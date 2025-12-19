export type NetworkRecord = {
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

export type NetworkStore = {
  order: string[];
  records: Map<string, NetworkRecord>;
  max: number;
};

export type ConsoleRecord = {
  msgId: number;
  type: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  argsPreview?: string[];
};

export type ConsoleStore = {
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
export function getOrCreateNetworkStore(pageTargetId: string): NetworkStore {
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
export function getOrCreateConsoleStore(pageTargetId: string): ConsoleStore {
  const existing = consoleStores.get(pageTargetId);
  if (existing) return existing;
  const created: ConsoleStore = { nextId: 1, records: [], max: 1000 };
  consoleStores.set(pageTargetId, created);
  return created;
}

