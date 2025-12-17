type PageTargetRecord = {
  pageTargetId: string;
  tabId: string;
  url: string;
  createdAt: number;
};

const pageTargets = new Map<string, PageTargetRecord>();

export function registerPageTarget(input: {
  pageTargetId: string;
  tabId: string;
  url: string;
}) {
  const record: PageTargetRecord = {
    pageTargetId: input.pageTargetId,
    tabId: input.tabId,
    url: input.url,
    createdAt: Date.now(),
  };
  pageTargets.set(record.pageTargetId, record);
  return record;
}

export function getPageTarget(pageTargetId: string): PageTargetRecord | undefined {
  return pageTargets.get(pageTargetId);
}

