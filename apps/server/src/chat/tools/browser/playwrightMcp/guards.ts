import { requireActiveTab } from "@/chat/ui/emit";
import { getPageTarget } from "../pageTargets";

/**
 * 校验 pageTargetId 是否存在且归属当前 activeTab。
 * - 用于“仅查内存缓存”的工具（网络/console 列表与详情），避免重复手写校验逻辑。
 */
export function requireActiveTabPageTarget(pageTargetId: string) {
  const activeTab = requireActiveTab();
  const record = getPageTarget(pageTargetId);
  if (!record) {
    return {
      ok: false as const,
      error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first.`,
    };
  }
  if (record.tabId !== activeTab.id) {
    return {
      ok: false as const,
      error: `pageTargetId=${pageTargetId} does not belong to activeTab.id=${activeTab.id}`,
    };
  }
  return { ok: true as const, record };
}

