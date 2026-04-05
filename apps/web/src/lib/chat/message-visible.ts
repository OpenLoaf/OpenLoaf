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

import { isHiddenToolPart, isToolPart } from "./message-parts";

/**
 * 判断消息是否有"可见内容"（文本/工具卡片等）。
 * - 用于控制：MessageActions 是否显示、Thinking 是否显示等 UI 逻辑
 */
export function messageHasVisibleContent(
  message: { parts?: unknown[]; metadata?: unknown } | undefined,
): boolean {
  const parts = Array.isArray(message?.parts) ? message!.parts! : [];

  const hasText = parts.some((part: any) => {
    return (
      part?.type === "text" &&
      typeof part?.text === "string" &&
      part.text.trim().length > 0
    );
  });
  if (hasText) return true;

  const hasRevisedPrompt = parts.some((part: any) => {
    return (
      part?.type === "data-revised-prompt" &&
      typeof part?.data?.text === "string" &&
      part.data.text.trim().length > 0
    );
  });
  if (hasRevisedPrompt) return true;

  const hasFile = parts.some((part: any) => {
    return part?.type === "file" && typeof part?.url === "string";
  });
  if (hasFile) return true;

  return parts.some((part: any) => isToolPart(part) && !isHiddenToolPart(part));
}
