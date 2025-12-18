import { requireActiveTab } from "@/chat/ui/emit";
import { getPageTarget } from "../pageTargets";
import { getWebSocketDebuggerUrl } from "./cdpWs";
import { installCdpCollectors } from "./collectors";
import { installNoNewPageConstraint, pickExistingPage } from "./pagePicker";

/**
 * 通用的 CDP Page wrapper：
 * - 校验 pageTargetId 归属当前 activeTab
 * - connectOverCDP + attach page
 * - 安装“禁止新页面”与网络/console 收敛器
 */
export async function withCdpPage<T>(
  pageTargetId: string,
  fn: (input: { page: any; cdp: any }) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
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
  if (!record.cdpTargetId) {
    return {
      ok: false,
      error: `pageTargetId=${pageTargetId} missing cdpTargetId. Re-run \`open-url\` to (re)open the page via runtime.`,
    };
  }

  let browser: any;
  try {
    const wsUrl = await getWebSocketDebuggerUrl();
    const { chromium } = await import("playwright-core");
    browser = await chromium.connectOverCDP(wsUrl);

    const page = await pickExistingPage({
      browser,
      preferredUrlRule: { mode: "includes", url: record.url },
      preferredTargetId: record.cdpTargetId,
      timeoutMs: 10_000,
    });
    if (!page) {
      return {
        ok: false,
        error: `No matching CDP page found for pageTargetId=${pageTargetId}. Re-run \`open-url\` with the same pageTargetId to reopen it.`,
      };
    }

    installNoNewPageConstraint(page);

    const context = page.context?.();
    if (!context?.newCDPSession) {
      return { ok: false, error: "CDP session is not available for this page." };
    }

    const cdp = await context.newCDPSession(page);
    await installCdpCollectors(pageTargetId, cdp);

    return { ok: true, data: await fn({ page, cdp }) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    try {
      await browser?.close?.();
    } catch {
      // ignore
    }
  }
}
