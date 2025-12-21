/**
 * Playwright/CDP 调试日志工具：
 * - 默认不输出，避免污染服务端日志
 * - 通过环境变量开启：TEATIME_PLAYWRIGHT_DEBUG=1 / true
 */
import { getSessionId } from "@/common/requestContext";
import { logger } from "@/common/logger";

export function isPlaywrightDebugEnabled() {
  const raw = String(process.env.TEATIME_PLAYWRIGHT_DEBUG ?? "").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * 输出 Playwright/CDP 调试日志（仅在开启时输出）。
 */
export function pwDebugLog(message: string, data?: Record<string, unknown>) {
  if (!isPlaywrightDebugEnabled()) return;
  const sessionId = getSessionId();
  if (data && Object.keys(data).length > 0) {
    logger.debug({ scope: "playwright", sessionId, ...data }, message);
    return;
  }
  logger.debug({ scope: "playwright", sessionId }, message);
}
