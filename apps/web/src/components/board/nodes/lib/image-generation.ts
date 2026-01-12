import type { ModelTag } from "@tenas-ai/api/common";

import type { ProviderModelOption } from "@/lib/provider-models";
import { resolveServerUrl } from "@/utils/server-url";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import {
  buildTenasFileUrl,
  getRelativePathFromUri,
  parseTenasFileUrl,
} from "@/components/project/filesystem/utils/file-system-utils";
import type { BoardFileContext } from "../../core/BoardProvider";

/** Shared helpers for image generation nodes (SSE/model selection). */
/** Default output count for image generation nodes. */
export const IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT = 1;
/** Maximum number of input images supported by image generation nodes. */
export const IMAGE_GENERATE_MAX_INPUT_IMAGES = 9;
/** Maximum number of output images supported by image generation nodes. */
export const IMAGE_GENERATE_MAX_OUTPUT_IMAGES = 4;
/** Prefix used for board-relative tenas-file paths. */
export const BOARD_RELATIVE_URI_PREFIX = "tenas-file://./";

export type BoardFolderScope = {
  /** Project id for resolving absolute file urls. */
  projectId: string;
  /** Relative folder path under the project root. */
  relativeFolderPath: string;
};

export type ChatSseRequest = {
  /** Payload posted to the SSE endpoint. */
  payload: unknown;
  /** Abort signal for cancelling the request. */
  signal: AbortSignal;
  /** Handler for each parsed SSE JSON event. */
  onEvent: (event: unknown) => void | boolean;
};

/** Normalize a relative path string. */
function normalizeRelativePath(value: string) {
  return value.replace(/^\/+/, "");
}

/** Return true when the relative path attempts to traverse parents. */
function hasParentTraversal(value: string) {
  return value.split("/").some((segment) => segment === "..");
}

/** Extract SSE data payload from a single event chunk. */
function extractSseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return null;
  return dataLines
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

/** Resolve the board folder scope from file context. */
export function resolveBoardFolderScope(
  fileContext?: BoardFileContext,
): BoardFolderScope | null {
  if (!fileContext?.boardFolderUri) return null;
  // 逻辑：优先解析 boardFolderUri，失败时用 rootUri 计算相对路径。
  const parsed = parseTenasFileUrl(fileContext.boardFolderUri);
  if (parsed) {
    return {
      projectId: parsed.projectId,
      relativeFolderPath: parsed.relativePath,
    };
  }
  if (!fileContext.projectId || !fileContext.rootUri) return null;
  const relativeFolderPath = getRelativePathFromUri(
    fileContext.rootUri,
    fileContext.boardFolderUri,
  );
  if (!relativeFolderPath) return null;
  return { projectId: fileContext.projectId, relativeFolderPath };
}

/** Resolve board-relative tenas-file urls into absolute paths. */
export function resolveBoardRelativeUri(
  uri: string,
  boardFolderScope: BoardFolderScope | null,
) {
  if (!boardFolderScope) return uri;
  if (!uri.startsWith(BOARD_RELATIVE_URI_PREFIX)) return uri;
  const relativePath = normalizeRelativePath(uri.slice(BOARD_RELATIVE_URI_PREFIX.length));
  if (!relativePath || hasParentTraversal(relativePath)) return uri;
  // 逻辑：仅允许解析资产目录内的相对路径，避免误引用工程外文件。
  if (!relativePath.startsWith(`${BOARD_ASSETS_DIR_NAME}/`)) return uri;
  const combined = `${boardFolderScope.relativeFolderPath}/${relativePath}`;
  return buildTenasFileUrl(boardFolderScope.projectId, combined);
}

/** Stream SSE events from the chat endpoint. */
export async function runChatSseRequest({ payload, signal, onEvent }: ChatSseRequest) {
  const response = await fetch(`${resolveServerUrl()}/chat/sse`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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

/** Filter model options for image generation rules. */
export function filterImageGenerationModelOptions(
  options: ProviderModelOption[],
  input: { imageCount: number; outputCount: number },
) {
  const requiredTags: ModelTag[] = ["image_generation"];
  // 逻辑：多图输出时需要 image_multi_generation。
  if (input.outputCount > 1) requiredTags.push("image_multi_generation");
  return options.filter((option) => {
    const tags = Array.isArray(option.tags) ? option.tags : [];
    // 逻辑：必须命中基础生成标签。
    if (!requiredTags.every((tag) => tags.includes(tag))) return false;
    if (input.imageCount > 1) {
      // 逻辑：多图输入必须支持 image_multi_input。
      return tags.includes("image_multi_input");
    }
    if (input.imageCount === 1) {
      // 逻辑：单图输入允许 image_input 或 image_multi_input。
      return tags.includes("image_input") || tags.includes("image_multi_input");
    }
    return true;
  });
}

/** Resolve required tags for image generation model selection. */
export function resolveImageGenerationRequiredTags(input: {
  imageCount: number;
  outputCount: number;
}) {
  const requiredTags: ModelTag[] = ["image_generation"];
  // 逻辑：多图输出时需要 image_multi_generation。
  if (input.outputCount > 1) requiredTags.push("image_multi_generation");
  if (input.imageCount > 1) {
    // 逻辑：多图输入必须包含 image_multi_input。
    requiredTags.push("image_multi_input");
  } else if (input.imageCount === 1) {
    // 逻辑：单图输入优先匹配 image_input（兼容 image_multi_input）。
    requiredTags.push("image_input");
  }
  return requiredTags;
}
