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
import type { ImageGenerateOptions } from "@openloaf/api/types/image";
import type { CodexOptions } from "@/lib/chat/codex-options";

export function useChatMessageComposer(input: {
  canImageGeneration: boolean;
  isCodexProvider: boolean;
}) {
  return React.useCallback(
    (params: {
      textValue: string;
      imageParts: Array<any>;
      imageOptions?: ImageGenerateOptions;
      codexOptions?: CodexOptions;
      onlineSearchEnabled?: boolean;
      reasoningMode?: "fast" | "deep";
      autoApproveTools?: boolean;
    }) => {
      const normalizedImageOptions = normalizeImageOptions(params.imageOptions);
      const safeImageOptions = input.canImageGeneration
        ? normalizedImageOptions
        : undefined;
      const normalizedCodexOptions = input.isCodexProvider
        ? normalizeCodexOptions(params.codexOptions)
        : undefined;
      const metadataPayload = {
        ...(safeImageOptions ? { imageOptions: safeImageOptions } : {}),
        ...(normalizedCodexOptions ? { codexOptions: normalizedCodexOptions } : {}),
        ...(params.reasoningMode
          ? { reasoning: { mode: params.reasoningMode } }
          : {}),
        ...(typeof params.onlineSearchEnabled === "boolean"
          ? { webSearch: { enabled: params.onlineSearchEnabled } }
          : {}),
        ...(params.autoApproveTools ? { toolApproval: { autoApprove: true } } : {}),
      };
      const metadata =
        Object.keys(metadataPayload).length > 0 ? metadataPayload : undefined;
      const parts = [
        ...params.imageParts,
        ...(params.textValue ? [{ type: "text", text: params.textValue }] : []),
      ];
      return { parts, metadata };
    },
    [input.canImageGeneration, input.isCodexProvider]
  );
}
