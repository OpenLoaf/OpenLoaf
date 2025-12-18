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
}: {
  browser: any;
  preferredUrlRule: UrlMatch;
  preferredTargetId?: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  const matches = toUrlMatcher(preferredUrlRule);

  while (Date.now() - startedAt < timeoutMs) {
    const contexts = browser.contexts?.() ?? [];
    const pages = contexts.flatMap((ctx: any) => (ctx.pages?.() ?? []));
    const reversed = [...pages].reverse();

    // 只允许按 cdpTargetId 精确匹配，避免多 tab/同 URL 串页（不再提供 URL 猜测兜底）。
    if (!preferredTargetId) return null;

    for (const p of reversed) {
      try {
        const ctx = p.context?.();
        if (!ctx?.newCDPSession) continue;
        const cdp = await ctx.newCDPSession(p);
        try {
          const info = await cdp.send("Target.getTargetInfo");
          const id = String((info as any)?.targetInfo?.targetId ?? "");
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
    await new Promise((r) => setTimeout(r, 150));
  }
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
