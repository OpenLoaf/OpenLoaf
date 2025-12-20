type PageTargetRecord = {
  pageTargetId: string;
  tabId: string;
  url: string;
  backend: "electron" | "headless";
  appId?: string;
  cdpTargetId?: string;
  webContentsId?: number;
  createdAt: number;
};

const pageTargets = new Map<string, PageTargetRecord>();

export function registerPageTarget(input: {
  pageTargetId: string;
  tabId: string;
  url: string;
  backend: PageTargetRecord["backend"];
  appId?: string;
  cdpTargetId?: string;
  webContentsId?: number;
}) {
  const record: PageTargetRecord = {
    pageTargetId: input.pageTargetId,
    tabId: input.tabId,
    url: input.url,
    backend: input.backend,
    appId: input.appId,
    cdpTargetId: input.cdpTargetId,
    webContentsId: input.webContentsId,
    createdAt: Date.now(),
  };
  pageTargets.set(record.pageTargetId, record);
  return record;
}

export function getPageTarget(pageTargetId: string): PageTargetRecord | undefined {
  return pageTargets.get(pageTargetId);
}

/**
 * 更新 pageTargetId 绑定的 url（用于页面导航后继续 attach 到正确的 CDP page）。
 * 注意：这是内存态映射，重启 server 会丢失。
 */
export function updatePageTargetUrl(pageTargetId: string, url: string) {
  const record = pageTargets.get(pageTargetId);
  if (!record) return undefined;
  record.url = url;
  return record;
}

/**
 * 更新 pageTargetId 绑定的 runtime 信息（例如 cdpTargetId）。
 * 注意：这是内存态映射，重启 server 会丢失。
 */
export function updatePageTargetRuntimeInfo(
  pageTargetId: string,
  input: {
    backend?: PageTargetRecord["backend"];
    appId?: string;
    cdpTargetId?: string;
    webContentsId?: number;
  },
) {
  const record = pageTargets.get(pageTargetId);
  if (!record) return undefined;
  if (input.backend) record.backend = input.backend;
  if (input.appId !== undefined) record.appId = input.appId;
  if (input.cdpTargetId !== undefined) record.cdpTargetId = input.cdpTargetId;
  if (input.webContentsId !== undefined) record.webContentsId = input.webContentsId;
  return record;
}
