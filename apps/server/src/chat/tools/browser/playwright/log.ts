/**
 * Playwright/CDP 调试日志工具：
 * - 默认不输出，避免污染服务端日志
 * - 通过环境变量开启：TEATIME_PLAYWRIGHT_DEBUG=1 / true
 */
import { requestContextManager } from "@/context/requestContext";

export function isPlaywrightDebugEnabled() {
  const raw = String(process.env.TEATIME_PLAYWRIGHT_DEBUG ?? "").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * 输出 Playwright/CDP 调试日志（仅在开启时输出）。
 */
export function pwDebugLog(message: string, data?: Record<string, unknown>) {
  if (!isPlaywrightDebugEnabled()) return;
  const prefix = "[playwright]";
  const sessionId = requestContextManager.getSessionId();
  const sessionPart = sessionId ? `[chatId=${sessionId}]` : "";
  const fullPrefix = sessionPart ? `${prefix} ${sessionPart}` : prefix;
  if (data && Object.keys(data).length > 0) {
    // eslint-disable-next-line no-console
    console.log(fullPrefix, message, data);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(fullPrefix, message);
}
