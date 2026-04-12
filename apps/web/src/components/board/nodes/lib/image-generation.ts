/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { CLIENT_HEADERS } from "@/lib/client-headers";
import { resolveServerUrl } from "@/utils/server-url";
import { getAccessToken } from "@/lib/saas-auth";
import {
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_INPUT_IMAGES,
  IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
} from "../node-config";

/** Shared helpers for image generation nodes (SSE/model selection). */
export {
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_INPUT_IMAGES,
  IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
} from "../node-config";
export type ChatSseRequest = {
  /** Payload posted to the SSE endpoint. */
  payload: unknown;
  /** Abort signal for cancelling the request. */
  signal: AbortSignal;
  /** Handler for each parsed SSE JSON event. */
  onEvent: (event: unknown) => void | boolean;
};

/** Extract SSE data payload from a single event chunk. */
function extractSseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return null;
  return dataLines
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

/** Stream SSE events from the unified AI endpoint. */
export async function runChatSseRequest({ payload, signal, onEvent }: ChatSseRequest) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...CLIENT_HEADERS,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${resolveServerUrl()}/ai/chat`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const data = extractSseData(chunk);
      if (!data) continue;
      if (data === "[DONE]") {
        // 逻辑：遇到结束标记时主动停止读取，避免阻塞。
        await reader.cancel();
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const shouldContinue = onEvent(parsed);
      if (shouldContinue === false) {
        // 逻辑：业务侧要求中断时立即停止读取。
        await reader.cancel();
        return;
      }
    }
  }
}
