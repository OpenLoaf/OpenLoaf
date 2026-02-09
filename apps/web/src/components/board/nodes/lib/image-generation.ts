import type { ModelTag } from "@tenas-ai/api/common";
import type { AiModel } from "@tenas-saas/sdk";

import type { ProviderModelOption } from "@/lib/provider-models";
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
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${resolveServerUrl()}/ai/execute`, {
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

/** Filter model options by required/excluded tags. */
export function filterModelOptionsByTags(
  options: ProviderModelOption[],
  rules: { required?: ModelTag[]; excluded?: ModelTag[] },
) {
  const required = Array.isArray(rules.required) ? rules.required : [];
  const excluded = Array.isArray(rules.excluded) ? rules.excluded : [];
  return options.filter((option) => {
    const tags = Array.isArray(option.tags) ? option.tags : [];
    // 逻辑：必须命中 required 标签才可用。
    if (!required.every((tag) => tags.includes(tag))) return false;
    // 逻辑：命中 excluded 标签直接剔除。
    if (excluded.some((tag) => tags.includes(tag))) return false;
    return true;
  });
}

/** Check whether a model has a specific media tag. */
function hasModelTag(model: AiModel, tag: string): boolean {
  const tags = Array.isArray(model.tags) ? model.tags : [];
  return tags.includes(tag);
}

/** Filter image media models based on input/output requirements. */
export function filterImageMediaModels(
  models: AiModel[],
  input: { imageCount: number; hasMask: boolean; outputCount: number },
) {
  return models.filter((model) => {
    const tags = Array.isArray(model.tags) ? model.tags : [];
    const inputCaps = model.capabilities?.input;
    const outputCaps = model.capabilities?.output;
    if (
      tags.length > 0 &&
      !hasModelTag(model, "image_generation") &&
      !hasModelTag(model, "image_edit")
    ) {
      return false;
    }
    if (input.hasMask && inputCaps?.supportsMask === false) return false;
    if (input.imageCount > 1) {
      if (inputCaps?.maxImages !== undefined && inputCaps.maxImages < input.imageCount) {
        return false;
      }
    }
    if (input.outputCount > 1 && outputCaps?.supportsMulti === false) return false;
    return true;
  });
}

/** Filter video media models based on input/output requirements. */
export function filterVideoMediaModels(
  models: AiModel[],
  input: {
    imageCount: number;
    hasReference: boolean;
    hasStartEnd: boolean;
    withAudio: boolean;
  },
) {
  return models.filter((model) => {
    const tags = Array.isArray(model.tags) ? model.tags : [];
    const inputCaps = model.capabilities?.input;
    const outputCaps = model.capabilities?.output;
    if (tags.length > 0 && !hasModelTag(model, "video_generation")) return false;
    if (input.hasReference && inputCaps?.supportsReferenceVideo === false) return false;
    if (input.hasStartEnd && inputCaps?.supportsStartEnd === false) return false;
    if (input.imageCount > 1) {
      if (inputCaps?.maxImages !== undefined && inputCaps.maxImages < input.imageCount) {
        return false;
      }
    }
    if (input.withAudio && outputCaps?.supportsAudio === false) return false;
    return true;
  });
}
