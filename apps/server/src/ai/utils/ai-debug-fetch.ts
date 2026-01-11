import type { HeadersInit } from "undici";
import { getEnvString } from "@tenas-ai/config";
import { logger } from "@/common/logger";

/** 将 Headers 规范化为普通对象。 */
function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

/** 构建 AI 请求调试用的 fetch。 */
export function buildAiDebugFetch(): typeof fetch | undefined {
  const enabled = getEnvString(process.env, "TENAS_DEBUG_AI_STREAM");
  if (!enabled) return undefined;
  const log = logger.debug.bind(logger);
  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const fallbackHeaders =
      typeof input === "string" ? undefined : input instanceof Request ? input.headers : undefined;
    const headerRecord = toHeaderRecord(init?.headers ?? fallbackHeaders);
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : undefined;
    // 中文注释：若 body 是 JSON 字符串，尝试解析以便 pretty 输出。
    const parsedBody =
      typeof body === "string"
        ? (() => {
            try {
              return JSON.parse(body);
            } catch {
              return body;
            }
          })()
        : body;
    // 仅输出请求头，避免打印正文。
    log({ url, headers: headerRecord }, "[ai-debug] request headers");
    // 仅在可读字符串场景输出请求体。
    if (body) {
      log({ url, body: parsedBody }, "[ai-debug] request body");
    }
    const response = await fetch(input, init);
    try {
      const contentType = response.headers.get("content-type") ?? "";
      const shouldLogBody = url.includes("/images/") && contentType.includes("application/json");
      if (shouldLogBody) {
        const responseText = await response.clone().text();
        // 中文注释：响应体若为 JSON 字符串，尝试解析后再输出。
        const parsedResponseBody = (() => {
          try {
            return JSON.parse(responseText);
          } catch {
            return responseText;
          }
        })();
        log({
          url,
          status: response.status,
          length: responseText.length,
          body: parsedResponseBody,
        }, "[ai-debug] response body");
      } else {
        log({
          url,
          status: response.status,
          contentType,
        }, "[ai-debug] response info");
      }
    } catch (error) {
      logger.warn({
        url,
        error: error instanceof Error ? error.message : String(error),
      }, "[ai-debug] response read failed");
    }
    return response;
  };
}
