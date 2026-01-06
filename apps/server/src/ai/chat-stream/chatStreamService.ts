import { generateId, type UIMessage } from "ai";
import type { ModelTag } from "@teatime-ai/api/common";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import {
  setAssistantMessageId,
  setChatModel,
  setRequestContext,
} from "@/ai/chat-stream/requestContext";
import { logger } from "@/common/logger";
import type { ChatStreamRequest } from "./chatStreamTypes";
import { loadMessageChain } from "./messageChainLoader";
import { buildFilePartFromTeatimeUrl } from "./attachmentResolver";
import { resolveRightmostLeafId, saveMessage } from "./messageStore";
import { createChatStreamResponse, createErrorStreamResponse } from "./streamOrchestrator";

/** Max messages to load for a chain. */
const MAX_CHAIN_MESSAGES = 80;

/** Run chat stream and return SSE response. */
export async function runChatStream(input: {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
}): Promise<Response> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    tabId,
    chatModelId,
    chatModelSource,
  } = input.request;

  setRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId: clientId || undefined,
    tabId: tabId || undefined,
  });

  const abortController = new AbortController();
  input.requestSignal.addEventListener("abort", () => {
    abortController.abort();
  });

  const requestStartAt = new Date();
  const assistantMessageId = typeof messageId === "string" && messageId ? messageId : generateId();
  setAssistantMessageId(assistantMessageId);

  const lastMessage = incomingMessages.at(-1) as TeatimeUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求无效：缺少最后一条消息。",
    });
  }

  // 流程：保存最后一条消息 -> 补全历史链路 -> 解析模型 -> 启动 SSE stream 并落库 assistant。
  let leafMessageId = String(lastMessage.id);
  let assistantParentUserId: string | null = null;

  try {
    if (lastMessage.role === "user") {
      const explicitParent =
        typeof lastMessage.parentMessageId === "string" || lastMessage.parentMessageId === null
          ? (lastMessage.parentMessageId as string | null)
          : undefined;
      const parentMessageIdToUse =
        explicitParent === undefined ? await resolveRightmostLeafId(sessionId) : explicitParent;

      const saved = await saveMessage({
        sessionId,
        message: lastMessage as any,
        parentMessageId: parentMessageIdToUse ?? null,
        createdAt: requestStartAt,
      });
      leafMessageId = saved.id;
      assistantParentUserId = saved.id;
    } else if (lastMessage.role === "assistant") {
      const parentId = typeof lastMessage.parentMessageId === "string" ? lastMessage.parentMessageId : null;
      if (!parentId) {
        return createErrorStreamResponse({
          sessionId,
          assistantMessageId,
          parentMessageId: await resolveRightmostLeafId(sessionId),
          errorText: "请求无效：assistant 缺少 parentMessageId。",
        });
      }
      assistantParentUserId = parentId;

      await saveMessage({
        sessionId,
        message: lastMessage as any,
        parentMessageId: parentId,
        allowEmpty: true,
        createdAt: requestStartAt,
      });
      leafMessageId = String(lastMessage.id);
    } else {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求无效：不支持的消息角色。",
      });
    }
  } catch (err) {
    logger.error({ err }, "[chat] save last message failed");
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：保存消息出错。",
    });
  }

  const messages = await loadMessageChain({
    sessionId,
    leafMessageId,
    maxMessages: MAX_CHAIN_MESSAGES,
  });
  logger.debug(
    {
      sessionId,
      leafMessageId,
      messageCount: Array.isArray(messages) ? messages.length : null,
    },
    "[chat] load message chain",
  );

  const modelMessages = await replaceTeatimeFileParts(messages as UIMessage[]);
  if (messages.length === 0) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: assistantParentUserId ?? (await resolveRightmostLeafId(sessionId)),
      errorText: "请求失败：历史消息不存在。",
    });
  }
  if (!assistantParentUserId) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：找不到父消息。",
    });
  }

  let agentMetadata: Record<string, unknown> = {};
  let masterAgent: ReturnType<typeof createMasterAgentRunner>;

  try {
    // 按输入能力与历史偏好选择模型，失败时直接返回错误流。
    const requiredTags = !chatModelId ? resolveRequiredInputTags(messages as UIMessage[]) : [];
    const preferredChatModelId = !chatModelId
      ? resolvePreviousChatModelId(messages as UIMessage[])
      : null;
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource,
      requiredTags,
      preferredChatModelId,
    });
    masterAgent = createMasterAgentRunner({
      model: resolved.model,
      modelInfo: resolved.modelInfo,
    });
    setChatModel(resolved.model);
    agentMetadata = {
      id: masterAgent.frame.agentId,
      name: masterAgent.frame.name,
      kind: masterAgent.frame.kind,
      model: masterAgent.frame.model,
      chatModelId: resolved.chatModelId,
      modelDefinition: resolved.modelDefinition,
    };
  } catch (err) {
    const errorText = err instanceof Error ? `请求失败：${err.message}` : "请求失败：模型解析失败。";
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: assistantParentUserId,
      errorText,
    });
  }

  return createChatStreamResponse({
    sessionId,
    assistantMessageId,
    parentMessageId: assistantParentUserId,
    requestStartAt,
    modelMessages: modelMessages as UIMessage[],
    agentRunner: masterAgent,
    agentMetadata,
    abortController,
  });
}

/** Replace teatime-file parts with data urls. */
async function replaceTeatimeFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
  const next: UIMessage[] = [];
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    const replaced: any[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        replaced.push(part);
        continue;
      }
      if ((part as any).type !== "file") {
        replaced.push(part);
        continue;
      }
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url || !url.startsWith("teatime-file://")) {
        replaced.push(part);
        continue;
      }
      const mediaType =
        typeof (part as any).mediaType === "string" ? (part as any).mediaType : undefined;
      try {
        const filePart = await buildFilePartFromTeatimeUrl({ url, mediaType });
        if (filePart) replaced.push(filePart);
      } catch {
        // 读取或压缩失败时直接跳过该图片，避免阻断对话。
      }
    }
    next.push({ ...message, parts: replaced } as UIMessage);
  }
  return next;
}

/** Resolve required input tags from message parts. */
function resolveRequiredInputTags(messages: UIMessage[]): ModelTag[] {
  const required = new Set<ModelTag>();
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if ((part as any).type !== "file") continue;
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url) continue;
      // 按协议区分本地图片与图片链接能力。
      if (/^https?:\/\//i.test(url)) {
        required.add("image_url_input");
      } else if (url.startsWith("teatime-file://")) {
        required.add("image_input");
      }
    }
  }
  return Array.from(required);
}

/** Resolve last used chat model id from assistant metadata. */
function resolvePreviousChatModelId(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as any;
    if (!message || message.role !== "assistant") continue;
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== "object") continue;
    const agent = (metadata as any).agent;
    const chatModelId = typeof agent?.chatModelId === "string" ? agent.chatModelId : "";
    if (chatModelId) return chatModelId;
  }
  return null;
}
