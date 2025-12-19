import { AbortError, sleepWithAbort } from "./abort";
import { pwDebugLog } from "./log";

type UrlMatch = { mode: "includes"; url: string };

/**
 * 将 URL 匹配规则转换为匹配函数（MVP：仅支持 includes）。
 */
function toUrlMatcher(rule: UrlMatch): (url: string) => boolean {
  return (url: string) => url.includes(rule.url);
}

/**
 * 在现有 CDP browser 连接里选中一个“已存在的 page”。
 * - 约束：不允许通过 CDP 创建/切换标签页，只能 attach 到 open-url 打开的页面。
 */
export async function pickExistingPage({
  browser,
  preferredUrlRule,
  preferredTargetId,
  timeoutMs,
  abortSignal,
}: {
  browser: any;
  preferredUrlRule: UrlMatch;
  preferredTargetId?: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}) {
  const startedAt = Date.now();
  const matches = toUrlMatcher(preferredUrlRule);

  pwDebugLog("pagePicker:start", {
    preferredTargetId: preferredTargetId ?? null,
    timeoutMs,
    preferredUrlIncludes: preferredUrlRule.url,
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (abortSignal?.aborted) {
      pwDebugLog("pagePicker:aborted", { elapsedMs: Date.now() - startedAt });
      throw new AbortError();
    }

    const contexts = browser.contexts?.() ?? [];
    const pages = contexts.flatMap((ctx: any) => (ctx.pages?.() ?? []));
    const reversed = [...pages].reverse();

    pwDebugLog("pagePicker:enumerate", {
      contexts: contexts.length,
      pages: pages.length,
      elapsedMs: Date.now() - startedAt,
    });

    // 只允许按 cdpTargetId 精确匹配，避免多 tab/同 URL 串页（不再提供 URL 猜测兜底）。
    if (!preferredTargetId) {
      pwDebugLog("pagePicker:missingPreferredTargetId", {});
      return null;
    }

    let inspected = 0;
    for (const p of reversed) {
      inspected++;
      try {
        if (abortSignal?.aborted) throw new AbortError();
        const ctx = p.context?.();
        if (!ctx?.newCDPSession) continue;
        const cdp = await ctx.newCDPSession(p);
        try {
          const info = await cdp.send("Target.getTargetInfo");
          const id = String((info as any)?.targetInfo?.targetId ?? "");
          // 仅在开启 debug 时输出少量采样，避免刷屏
          if (inspected <= 20) {
            pwDebugLog("pagePicker:seenTarget", {
              seenTargetId: id || null,
              pageUrl: typeof p?.url === "function" ? p.url() : undefined,
            });
          }
          if (id && id === preferredTargetId) return p;
        } finally {
          try {
            await cdp.detach?.();
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    // 注意：保留一次 URL 读取是为了尽量减少未来改动（避免上层类型变更），但不再用于匹配兜底。
    void matches;
    await sleepWithAbort(150, abortSignal);
  }
  pwDebugLog("pagePicker:timeout", {
    preferredTargetId: preferredTargetId ?? null,
    timeoutMs,
  });
  return null;
}

/**
 * 安装“禁止新页面”的约束：
 * - 如果页面内产生 popup/new tab，自动关闭，只允许在当前 page 内导航。
 */
export function installNoNewPageConstraint(page: any) {
  /**
   * 若出现 popup/new tab，且不是当前 page，则自动关闭。
   */
  const closeIfNotCurrent = async (p: any) => {
    if (!p || p === page) return;
    try {
      await p.close?.();
    } catch {
      // ignore
    }
  };
  try {
    page.on?.("popup", closeIfNotCurrent);
  } catch {
    // ignore
  }
  try {
    page.context?.().on?.("page", closeIfNotCurrent);
  } catch {
    // ignore
  }
}
