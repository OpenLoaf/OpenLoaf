import { requireActiveTab } from "@/chat/ui/emit";
import { requestContextManager } from "@/context/requestContext";
import { getPageTarget, updatePageTargetRuntimeInfo } from "../pageTargets";
import { getWebSocketDebuggerUrl } from "./cdpWs";
import { installPlaywrightCollectors } from "./collectors";
import { AbortError } from "./abort";
import { pwDebugLog } from "./log";
import { installNoNewPageConstraint, pickExistingPage } from "./pagePicker";

/**
 * 通用的 CDP Page wrapper：
 * - 校验 pageTargetId 归属当前 activeTab
 * - connectOverCDP + attach page
 * - 安装“禁止新页面”与网络/console 收敛器
 */
export async function withCdpPage<T>(
  input: { pageTargetId: string; targetId: string },
  fn: (input: { page: any }) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { pageTargetId, targetId } = input;

  let browser: any;
  try {
    const abortSignal = requestContextManager.getAbortSignal();
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

    // 重要：由工具输入传入 targetId（cdpTargetId）作为“精确 attach”依据。
    // - open-url 会返回 cdpTargetId，但中间可能发生页面重建/重连；这里以入参为准更新内存态映射。
    if (!record.cdpTargetId || record.cdpTargetId !== targetId) {
      updatePageTargetRuntimeInfo(pageTargetId, { cdpTargetId: targetId });
    }

    // stop 后应尽量“静默且快速”退出：不要继续连接，也不要刷无意义日志
    if (abortSignal?.aborted) throw new AbortError();

    pwDebugLog("withCdpPage:start", {
      pageTargetId,
      targetId,
      activeTabId: activeTab.id,
      recordUrl: record.url,
      recordCdpTargetId: record.cdpTargetId,
      backend: record.backend,
    });

    const wsUrl = await getWebSocketDebuggerUrl();
    pwDebugLog("withCdpPage:wsUrl", { wsUrl });
    const { chromium } = await import("playwright-core");
    if (abortSignal?.aborted) throw new AbortError();
    browser = await chromium.connectOverCDP(wsUrl);
    pwDebugLog("withCdpPage:connectedOverCDP", {});

    const page = await pickExistingPage({
      browser,
      preferredUrlRule: { mode: "includes", url: record.url },
      preferredTargetId: targetId,
      timeoutMs: 10_000,
      abortSignal,
    });
    if (!page) {
      pwDebugLog("withCdpPage:noMatchingPage", { pageTargetId, targetId });
      return {
        ok: false,
        error: `No matching CDP page found for pageTargetId=${pageTargetId} targetId=${targetId}. Re-run \`open-url\` to reopen it.`,
      };
    }

    installNoNewPageConstraint(page);

    const context = page.context?.();
    void context;
    await installPlaywrightCollectors(pageTargetId, page);
    pwDebugLog("withCdpPage:ready", {
      pageUrl: typeof page?.url === "function" ? page.url() : undefined,
    });
    return { ok: true, data: await fn({ page }) };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      pwDebugLog("withCdpPage:aborted", { pageTargetId, targetId });
      return { ok: false, error: "aborted" };
    }
    pwDebugLog("withCdpPage:error", {
      pageTargetId,
      targetId,
      message: err?.message ?? String(err),
    });
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    try {
      await browser?.close?.();
    } catch {
      // ignore
    }
    pwDebugLog("withCdpPage:finally", { pageTargetId, targetId });
  }
}
