/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  convertToModelMessages,
  validateUIMessages,
  type UIMessage,
  type ToolSet,
} from "ai";
import { trimToContextWindow } from "@/ai/shared/contextWindowManager";

/** Convert UI messages into model messages with custom data-part handling. */
export async function buildModelMessages(
  messages: UIMessage[],
  tools?: ToolSet,
  options?: { modelId?: string },
) {
  validateUIMessages({ messages: messages as any });
  const modelMessages = await convertToModelMessages(messages as any, {
    tools,
    convertDataPart: (part) => {
      // 逻辑：将 data-skill 转为模型可读的文本块。
      if (part?.type !== "data-skill") return undefined;
      const payload = (part as any).data ?? {};
      const name = typeof payload.name === "string" ? payload.name : "unknown";
      const scope = typeof payload.scope === "string" ? payload.scope : "unknown";
      const path = typeof payload.path === "string" ? payload.path : "unknown";
      const content = typeof payload.content === "string" ? payload.content : "";
      const text = [
        `# Skill: ${name}`,
        `- scope: ${scope}`,
        `- path: ${path}`,
        "<skill>",
        content,
        "</skill>",
      ].join("\n");
      return { type: "text", text };
    },
  });

  // 逻辑：上下文窗口管理（MAST FM-1.4）— 防止长对话 token 溢出导致截断。
  return trimToContextWindow(modelMessages, options);
}
