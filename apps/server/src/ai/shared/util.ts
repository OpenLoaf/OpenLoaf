import { Buffer } from "node:buffer";
import type { HeadersInit } from "undici";
import { getEnvString } from "@tenas-ai/config";
import { prisma } from "@tenas-ai/db";
import { resolveProjectAncestorRootUris } from "@tenas-ai/api/services/projectDbService";
import { resolveFilePathFromUri } from "@tenas-ai/api/services/vfsService";
import { logger } from "@/common/logger";

const DATA_URL_PREFIX = "data:";

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

/** 解析 data: URL 为二进制数据。 */
function parseDataUrl(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(",", 2);
  if (!base64) {
    throw new Error("data URL 缺少 base64 内容");
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
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
        // const parsedResponseBody = (() => {
        //   try {
        //     return JSON.parse(responseText);
        //   } catch {
        //     return responseText;
        //   }
        // })();
        log(
          {
            url,
            status: response.status,
            length: responseText.length,
            body: responseText,
          },
          "[ai-debug] response body",
        );
      } else {
        log(
          {
            url,
            status: response.status,
            contentType,
          },
          "[ai-debug] response info",
        );
      }
    } catch (error) {
      logger.warn(
        {
          url,
          error: error instanceof Error ? error.message : String(error),
        },
        "[ai-debug] response read failed",
      );
    }
    return response;
  };
}

/** 下载图片并转换为二进制数据。 */
export async function downloadImageData(
  url: string,
  abortSignal?: AbortSignal,
): Promise<Uint8Array> {
  if (url.startsWith(DATA_URL_PREFIX)) {
    return parseDataUrl(url);
  }
  const response = await fetch(url, { signal: abortSignal });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`图片下载失败: ${response.status} ${text}`.trim());
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Convert finite numbers or return undefined. */
export function toNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 统一 OpenAI 兼容服务的 baseURL 格式。 */
export function ensureOpenAiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

/** Resolve parent project root paths from database. */
export async function resolveParentProjectRootPaths(projectId?: string): Promise<string[]> {
  const normalizedId = projectId?.trim() ?? "";
  if (!normalizedId) return [];
  try {
    const parentRootUris = await resolveProjectAncestorRootUris(prisma, normalizedId);
    // 逻辑：父项目 rootUri 需转成本地路径，过滤掉无效 URI。
    return parentRootUris
      .map((rootUri) => {
        try {
          return resolveFilePathFromUri(rootUri);
        } catch {
          return null;
        }
      })
      .filter((rootPath): rootPath is string => Boolean(rootPath));
  } catch (error) {
    logger.warn({ err: error, projectId: normalizedId }, "[chat] resolve parent project roots");
    return [];
  }
}

/** 从 authConfig 里读取 apiKey。 */
export function readApiKey(authConfig: Record<string, unknown>): string {
  const apiKey = authConfig.apiKey;
  return typeof apiKey === "string" ? apiKey.trim() : "";
}

/** Check whether value is a plain record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
