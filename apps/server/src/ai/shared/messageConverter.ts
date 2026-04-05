/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import nodePath from "node:path";
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
  // 过滤被中止的空 assistant 消息，避免 AI_TypeValidationError
  // 最终防线：过滤掉非标准 role（如 task-report），防止 LLM 400 错误
  const VALID_ROLES = new Set(["system", "user", "assistant"]);
  const sanitized = messages.filter(
    (m) =>
      VALID_ROLES.has(m.role) &&
      (m.role === "user" || (Array.isArray(m.parts) && m.parts.length > 0)),
  );
  validateUIMessages({ messages: sanitized as any });
  const modelMessages = await convertToModelMessages(sanitized as any, {
    tools,
    convertDataPart: (part) => {
      // 逻辑：将 data-skill 转为模型可读的文本块。
      if (part?.type === "data-skill") {
        const payload = (part as any).data ?? {};
        const name = typeof payload.name === "string" ? payload.name : "unknown";
        const scope = typeof payload.scope === "string" ? payload.scope : "unknown";
        const path = typeof payload.path === "string" ? payload.path : "unknown";
        const content = typeof payload.content === "string" ? payload.content : "";
        const basePath = typeof path === "string" ? nodePath.dirname(path) : "unknown";
        const text = [
          `# Skill: ${name}`,
          `- scope: ${scope}`,
          `- basePath: ${basePath}`,
          `- skillFile: ${path}`,
          "",
          "注意：技能内容中的相对路径均相对于上述 basePath，请拼接后访问。",
          "",
          "<skill>",
          content,
          "</skill>",
        ].join("\n");
        return { type: "text", text };
      }

      // 逻辑：将 data-msg-context 转为 <msg-context> XML 标签。
      if (part?.type === "data-msg-context") {
        const d = (part as any).data ?? {};
        return { type: "text", text: renderMsgContextXml(d) };
      }

      return undefined;
    },
  });

  // 逻辑：上下文窗口管理（MAST FM-1.4）— 防止长对话 token 溢出导致截断。
  return trimToContextWindow(modelMessages, options);
}

/** Render a data-msg-context payload to XML string. */
function renderMsgContextXml(d: Record<string, unknown>): string {
  const attrs: string[] = [];
  if (d.datetime) attrs.push(`datetime="${d.datetime}"`);
  if (d.page) attrs.push(`page="${d.page}"`);
  if (d.projectId) attrs.push(`projectId="${d.projectId}"`);
  if (d.boardId) attrs.push(`boardId="${d.boardId}"`);

  const stack = Array.isArray(d.stack) ? d.stack : [];
  if (stack.length === 0) {
    return `<msg-context ${attrs.join(" ")} />`;
  }

  const items = stack.map((item: Record<string, unknown>) => {
    const itemAttrs = [`component="${item.component}"`];
    if (item.title) itemAttrs.push(`title="${item.title}"`);
    const params = item.params as Record<string, unknown> | undefined;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) itemAttrs.push(`${k}="${String(v)}"`);
      }
    }
    return `  <stack-item ${itemAttrs.join(" ")} />`;
  });

  return `<msg-context ${attrs.join(" ")}>\n${items.join("\n")}\n</msg-context>`;
}
