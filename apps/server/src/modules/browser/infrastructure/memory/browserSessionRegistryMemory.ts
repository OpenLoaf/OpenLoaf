type BrowserSessionRecord = {
  pageTargetId: string;
  workspaceId: string;
  tabId: string;
  url: string;
  backend: "electron" | "headless";
  appId?: string;
  cdpTargetId?: string;
  webContentsId?: number;
  createdAt: number;
};

const sessions = new Map<string, BrowserSessionRecord>();

/**
 * BrowserSessionRegistry（MVP 内存态）：
 * - 统一维护 pageTargetId -> 归属（workspace/tab）+ runtime 选择器（cdpTargetId）
 * - 后续 cloud-server 可替换为 Redis/DB（接口保持不变）
 */
export const browserSessionRegistry = {
  register: (input: {
    pageTargetId: string;
    workspaceId: string;
    tabId: string;
    url: string;
    backend: BrowserSessionRecord["backend"];
    appId?: string;
    cdpTargetId?: string;
    webContentsId?: number;
  }) => {
    const record: BrowserSessionRecord = {
      pageTargetId: input.pageTargetId,
      workspaceId: input.workspaceId,
      tabId: input.tabId,
      url: input.url,
      backend: input.backend,
      appId: input.appId,
      cdpTargetId: input.cdpTargetId,
      webContentsId: input.webContentsId,
      createdAt: Date.now(),
    };
    sessions.set(record.pageTargetId, record);
    return record;
  },

  get: (pageTargetId: string) => sessions.get(pageTargetId),

  updateUrl: (pageTargetId: string, url: string) => {
    const record = sessions.get(pageTargetId);
    if (!record) return undefined;
    record.url = url;
    return record;
  },

  updateRuntimeInfo: (
    pageTargetId: string,
    input: {
      backend?: BrowserSessionRecord["backend"];
      appId?: string;
      cdpTargetId?: string;
      webContentsId?: number;
    },
  ) => {
    const record = sessions.get(pageTargetId);
    if (!record) return undefined;
    if (input.backend) record.backend = input.backend;
    if (input.appId !== undefined) record.appId = input.appId;
    if (input.cdpTargetId !== undefined) record.cdpTargetId = input.cdpTargetId;
    if (input.webContentsId !== undefined) record.webContentsId = input.webContentsId;
    return record;
  },
} as const;

