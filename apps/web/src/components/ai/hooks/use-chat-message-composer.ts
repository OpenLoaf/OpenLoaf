/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import { normalizeCodexOptions } from "@/lib/chat/codex-options";
import { normalizeClaudeCodeOptions } from "@/lib/chat/claude-code-options";
import type { ImageGenerateOptions } from "@openloaf/api/types/image";
import type { CodexOptions } from "@/lib/chat/codex-options";
import type { ClaudeCodeOptions } from "@/lib/chat/claude-code-options";

export function useChatMessageComposer(input: {
  canImageGeneration: boolean;
  isCodexProvider: boolean;
  selectedCliProvider?: "codex-cli" | "claude-code-cli";
  /** Selected CLI model ID (e.g., "codex-cli:gpt-5.3-codex") */
  selectedCliModelId?: string;
}) {
  return React.useCallback(
    (params: {
      textValue: string;
      imageParts: Array<any>;
      imageOptions?: ImageGenerateOptions;
      codexOptions?: CodexOptions;
      claudeCodeOptions?: ClaudeCodeOptions;
      onlineSearchEnabled?: boolean;
      reasoningMode?: "fast" | "deep";
      autoApproveTools?: boolean;
      directCli?: boolean;
    }) => {
      const normalizedImageOptions = normalizeImageOptions(params.imageOptions);
      const safeImageOptions = input.canImageGeneration
        ? normalizedImageOptions
        : undefined;
      const normalizedCodexOptions = input.isCodexProvider
        ? normalizeCodexOptions(params.codexOptions)
        : undefined;
      const normalizedCcOptions =
        params.directCli && input.selectedCliProvider === "claude-code-cli"
        ? normalizeClaudeCodeOptions(params.claudeCodeOptions)
        : undefined;
      const metadataPayload = {
        ...(safeImageOptions ? { imageOptions: safeImageOptions } : {}),
        ...(normalizedCodexOptions ? { codexOptions: normalizedCodexOptions } : {}),
        ...(normalizedCcOptions ? { claudeCodeOptions: normalizedCcOptions } : {}),
        ...(params.reasoningMode
          ? { reasoning: { mode: params.reasoningMode } }
          : {}),
        ...(typeof params.onlineSearchEnabled === "boolean"
          ? { webSearch: { enabled: params.onlineSearchEnabled } }
          : {}),
        ...(params.autoApproveTools ? { toolApproval: { autoApprove: true } } : {}),
        ...(params.directCli ? { directCli: true } : {}),
      };
      const metadata =
        Object.keys(metadataPayload).length > 0 ? metadataPayload : undefined;
      const parts = [
        ...params.imageParts,
        ...(params.textValue ? [{ type: "text", text: params.textValue }] : []),
      ];
      // 逻辑：CLI 直连模式下，将选择的模型 ID 作为 chatModelId 传递给后端
      const bodyExtras = params.directCli && input.selectedCliModelId
        ? { chatModelId: input.selectedCliModelId }
        : {};
      return { parts, metadata, ...bodyExtras };
    },
    [input.canImageGeneration, input.isCodexProvider, input.selectedCliProvider, input.selectedCliModelId]
  );
}
