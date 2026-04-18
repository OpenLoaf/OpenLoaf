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
import type { ModelDefinition, ModelTag } from "@openloaf/api/common";
import { trimToContextWindow } from "@/ai/shared/contextWindowManager";
import {
  expandAttachmentTagsForModel,
  type AttachmentExpansionMutation,
} from "@/ai/shared/attachmentTagExpander";

export type BuildModelMessagesOptions = {
  modelId?: string;
  /**
   * Current model definition. When provided, attachment tags in user messages
   * are upgraded to native multimodal file parts (CDN URL or base64) based
   * on the model's declared tags.
   */
  modelDefinition?: ModelDefinition;
  /**
   * Called when at least one tag gained a fresh CDN url and should be
   * persisted back to storage. Invoked with the full mutation list after
   * expansion completes. Caller decides how/where to persist.
   */
  onMutations?: (mutations: AttachmentExpansionMutation[]) => Promise<void> | void;
};

/** Convert UI messages into model messages with custom data-part handling. */
export async function buildModelMessages(
  messages: UIMessage[],
  tools?: ToolSet,
  options?: BuildModelMessagesOptions,
) {
  // 过滤被中止的空 assistant 消息，避免 AI_TypeValidationError
  // 最终防线：过滤掉非标准 role（如 task-report），防止 LLM 400 错误
  const VALID_ROLES = new Set(["system", "user", "assistant"]);
  let sanitized = messages.filter(
    (m) =>
      VALID_ROLES.has(m.role) &&
      (m.role === "user" || (Array.isArray(m.parts) && m.parts.length > 0)),
  );

  // 逻辑：按模型能力把用户消息里的 attachment tag 升级为原生 file part。
  // 未传 modelDefinition 的内部路径（summary/aux 等）自动跳过，保持既有行为。
  if (options?.modelDefinition) {
    const expansion = await expandAttachmentTagsForModel(
      sanitized,
      options.modelDefinition,
    );
    sanitized = expansion.messages;
    if (expansion.mutations.length > 0 && options.onMutations) {
      await options.onMutations(expansion.mutations);
    }
  }

  // 逻辑：把「当前模型能力」注入到最后一条 user message 的 msg-context。
  // 只注入到最后一条是因为：(1) 模型在会话中途可能被切换，历史轮的 capability
  // 是"当时"的快照、现在可能已经失效；(2) 模型决策基于"当前"能力即可。
  // 不持久化（只对本次请求生效），避免污染 JSONL。
  const capability = deriveModelCapability(options?.modelDefinition);
  if (capability) {
    sanitized = injectCapabilityToLastUser(sanitized, capability);
  }

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
          `<system-tag type="skill" id="${name}">`,
          content,
          "</system-tag>",
        ].join("\n");
        return { type: "text", text };
      }

      // 逻辑：将 data-msg-context 转为 <system-tag type="msg-context"> XML 标签。
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

/** Escape XML attribute values. */
function xmlAttr(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render a data-msg-context payload to XML string. */
function renderMsgContextXml(d: Record<string, unknown>): string {
  const datetime = d.datetime ? ` datetime="${xmlAttr(d.datetime)}"` : "";
  const children: string[] = [];

  const scope = d.scope === "project" ? "project" : "global";
  if (d.page) {
    const pageAttrs: string[] = [`component="${xmlAttr(d.page)}"`];
    if (d.pageTitle) pageAttrs.push(`title="${xmlAttr(d.pageTitle)}"`);
    pageAttrs.push(`scope="${scope}"`);
    if (scope === "project" && d.projectId) {
      pageAttrs.push(`projectId="${xmlAttr(d.projectId)}"`);
    }
    if (d.boardId) pageAttrs.push(`boardId="${xmlAttr(d.boardId)}"`);
    children.push(`  <page ${pageAttrs.join(" ")} />`);
  }

  const stack = Array.isArray(d.stack) ? d.stack : [];
  if (stack.length > 0) {
    const items = stack.map((item: Record<string, unknown>) => {
      const itemAttrs = [`component="${xmlAttr(item.component)}"`];
      if (item.title) itemAttrs.push(`title="${xmlAttr(item.title)}"`);
      const params = item.params as Record<string, unknown> | undefined;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v != null) itemAttrs.push(`${k}="${xmlAttr(v)}"`);
        }
      }
      return `    <stack-item ${itemAttrs.join(" ")} />`;
    });
    children.push(`  <stack>\n${items.join("\n")}\n  </stack>`);
  }

  // 逻辑：当前模型能力（仅由 buildModelMessages 注入最后一条 user msg）。
  const cap = d._capability as ModelCapabilityInline | undefined;
  if (cap) {
    const capAttrs: string[] = [];
    if (cap.name) capAttrs.push(`name="${xmlAttr(cap.name)}"`);
    capAttrs.push(`native-inputs="${xmlAttr(cap.nativeInputs.join(" "))}"`);
    children.push(`  <model ${capAttrs.join(" ")} />`);
  }

  if (children.length === 0) {
    return `<system-tag type="msg-context"${datetime} />`;
  }
  return `<system-tag type="msg-context"${datetime}>\n${children.join("\n")}\n</system-tag>`;
}

type ModelCapabilityInline = {
  name?: string;
  nativeInputs: string[];
};

/** Derive the capability summary to inline into msg-context. */
function deriveModelCapability(
  modelDefinition: ModelDefinition | undefined,
): ModelCapabilityInline | null {
  if (!modelDefinition) return null;
  const tagList: ModelTag[] = Array.isArray(modelDefinition.tags)
    ? (modelDefinition.tags as ModelTag[])
    : [];
  const tags = new Set<ModelTag>(tagList);
  const inputs: string[] = ["text"];
  if (tags.has("image_input") || tags.has("image_analysis")) inputs.push("image");
  if (tags.has("audio_analysis")) inputs.push("audio");
  if (tags.has("video_analysis")) inputs.push("video");
  const name = typeof modelDefinition.name === "string" && modelDefinition.name.trim()
    ? modelDefinition.name.trim()
    : undefined;
  return { name, nativeInputs: inputs };
}

/** Inject capability summary into the most recent data-msg-context part. */
function injectCapabilityToLastUser(
  messages: UIMessage[],
  capability: ModelCapabilityInline,
): UIMessage[] {
  // 逻辑：splitUserMessageParts 把 data-msg-context 和用户真实 parts 拆成了
  // 两条相邻的 user message；此处必须找"最近一条含 data-msg-context 的 user
  // message"去合并，而不是简单的 lastUserIdx — 否则会凭空塞出一条孤立的
  // msg-context 消息，跟上一条 msg-context(datetime) 形成重复。
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg: any = messages[i];
    if (msg?.role !== "user") continue;
    const parts: any[] = Array.isArray(msg?.parts) ? msg.parts : [];
    const ctxIdx = parts.findIndex((p) => p?.type === "data-msg-context");
    if (ctxIdx < 0) continue;
    const target = parts[ctxIdx];
    const nextCtx = {
      ...target,
      data: { ...(target.data ?? {}), _capability: capability },
    };
    const nextParts = parts.slice();
    nextParts[ctxIdx] = nextCtx;
    const next = messages.slice();
    next[i] = { ...msg, parts: nextParts } as UIMessage;
    return next;
  }
  return messages;
}
