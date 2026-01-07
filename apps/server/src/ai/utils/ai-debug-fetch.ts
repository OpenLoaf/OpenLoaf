import type { HeadersInit } from "undici";
import { getEnvString } from "@teatime-ai/config";

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
  const enabled = getEnvString(process.env, "TEATIME_DEBUG_AI_STREAM");
  if (!enabled) return undefined;
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
    // 仅输出请求头，避免打印正文。
    console.info("[ai-debug] request headers", { url, headers: headerRecord });
    // 仅在可读字符串场景输出请求体。
    if (body) {
      console.info("[ai-debug] request body", { url, body });
    }
    const response = await fetch(input, init);
    try {
      const contentType = response.headers.get("content-type") ?? "";
      const shouldLogBody = url.includes("/images/") && contentType.includes("application/json");
      if (shouldLogBody) {
        const responseText = await response.clone().text();
        console.info("[ai-debug] response body", {
          url,
          status: response.status,
          length: responseText.length,
          body: responseText,
        });
      } else {
        console.info("[ai-debug] response info", {
          url,
          status: response.status,
          contentType,
        });
      }
    } catch (error) {
      console.info("[ai-debug] response read failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return response;
  };
}
