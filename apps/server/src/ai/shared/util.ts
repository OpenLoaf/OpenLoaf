/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Buffer } from "node:buffer";
import type { HeadersInit } from "undici";
import { getEnvString } from "@openloaf/config";
import { prisma } from "@openloaf/db";
import { resolveProjectAncestorRootUris } from "@openloaf/api/services/projectDbService";
import { resolveFilePathFromUri } from "@openloaf/api/services/vfsService";
import { logger } from "@/common/logger";

const DATA_URL_PREFIX = "data:";

/** Check whether parsed object includes chat chunk payload fields. */
function hasChatChunkPayload(value: Record<string, unknown>): boolean {
  return "choices" in value || "error" in value;
}

/** Parse SSE event payload from raw event text. */
function readSseData(rawEvent: string): string | null {
  const lines = rawEvent.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

/** 判断是否需要忽略自定义计费 SSE 事件。 */
function shouldDropBillingSseEvent(eventData: string): boolean {
  if (!eventData || eventData === "[DONE]") return false;
  try {
    const parsed = JSON.parse(eventData);
    if (!isRecord(parsed)) return false;
    // 逻辑：仅过滤自定义计费事件，避免误伤正常聊天 chunk。
    if (hasChatChunkPayload(parsed)) return false;
    return "x_credits_consumed" in parsed;
  } catch {
    return false;
  }
}

/** Filter custom billing SSE events from OpenAI-compatible chat stream. */
function filterChatCompletionSseBody(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary >= 0) {
          const delimiter = buffer.startsWith("\r\n\r\n", boundary) ? 4 : 2;
          const rawEvent = buffer.slice(0, boundary + delimiter);
          buffer = buffer.slice(boundary + delimiter);
          const eventData = readSseData(rawEvent);
          if (eventData && shouldDropBillingSseEvent(eventData)) {
            continue;
          }
          controller.enqueue(encoder.encode(rawEvent));
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (!buffer) return;
        const eventData = readSseData(buffer);
        if (eventData && shouldDropBillingSseEvent(eventData)) {
          return;
        }
        controller.enqueue(encoder.encode(buffer));
      },
    }),
  );
}

/** Wrap response body to ignore custom billing SSE events for chat completions. */
function sanitizeChatCompletionStream(url: string, response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!url.includes("/chat/completions")) return response;
  if (!contentType.includes("text/event-stream")) return response;
  if (!response.body) return response;
  return new Response(filterChatCompletionSseBody(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

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
export function buildAiDebugFetch(): typeof fetch {
  const enabled = Boolean(getEnvString(process.env, "OPENLOAF_DEBUG_AI_STREAM"));
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
    if (enabled) {
      // 仅输出请求头，避免打印正文。
      log({ url, headers: headerRecord }, "[ai-debug] request headers");
    }
    const response = await fetch(input, init);
    try {
      const contentType = response.headers.get("content-type") ?? "";
      const shouldLogBody = url.includes("/images/") && contentType.includes("application/json");
      if (enabled && shouldLogBody) {
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
      } else if (enabled) {
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
      if (!enabled) return sanitizeChatCompletionStream(url, response);
      logger.warn(
        {
          url,
          error: error instanceof Error ? error.message : String(error),
        },
        "[ai-debug] response read failed",
      );
    }
    return sanitizeChatCompletionStream(url, response);
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
