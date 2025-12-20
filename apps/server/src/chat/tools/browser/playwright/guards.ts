import { requireTabId } from "@/chat/ui/tabContext";
import { getPageTarget } from "../pageTargets";

/**
 * 校验 pageTargetId 是否存在且归属当前 activeTab。
 * - 用于“仅查内存缓存”的工具（例如 diagnostics），避免重复手写校验逻辑。
 */
export function requireActiveTabPageTarget(input: { pageTargetId: string; targetId?: string }) {
  const { pageTargetId, targetId } = input;
  const tabId = requireTabId();
  const record = getPageTarget(pageTargetId);
  if (!record) {
    return {
      ok: false as const,
      error: `Unknown pageTargetId=${pageTargetId}. Call \`open-url\` first.`,
    };
  }
  if (record.tabId !== tabId) {
    return {
      ok: false as const,
      error: `pageTargetId=${pageTargetId} does not belong to tabId=${tabId}`,
    };
  }
  if (targetId && record.cdpTargetId && record.cdpTargetId !== targetId) {
    return {
      ok: false as const,
      error: `targetId mismatch: record.cdpTargetId=${record.cdpTargetId} input.targetId=${targetId}`,
    };
  }
  return { ok: true as const, record };
}
