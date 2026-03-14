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

type AnyPart = { type?: string; text?: string; isTransient?: boolean };

/**
 * Serialize displayed text parts of a UIMessage to markdown.
 * Only includes `type: "text"` parts, skipping tool calls, reasoning, and transient parts.
 */
export function messageToMarkdown(message: { parts?: unknown[] } | undefined): string {
  const parts = Array.isArray(message?.parts) ? (message.parts as AnyPart[]) : [];
  const chunks: string[] = [];

  for (const part of parts) {
    if (part?.isTransient) continue;
    if (part?.type === "text" && typeof part.text === "string") {
      const text = part.text.trim();
      if (text) chunks.push(text);
    }
  }

  return chunks.join("\n\n");
}
