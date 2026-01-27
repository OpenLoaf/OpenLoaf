"use client";

import * as React from "react";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import { normalizeCodexOptions } from "@/lib/chat/codex-options";
import type { ImageGenerateOptions } from "@tenas-ai/api/types/image";
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
