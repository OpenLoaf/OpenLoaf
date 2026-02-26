import type { UIMessage } from "ai";
import type { ChatMessageKind } from "@openloaf/api";

/** Build persisted branch log messages by appending the finalized assistant response. */
export function buildBranchLogMessages(input: {
  /** Model-ready messages before assistant generation. */
  modelMessages: UIMessage[];
  /** Assistant response from stream finish callback. */
  assistantResponseMessage: UIMessage;
  /** Final assistant message id persisted to db. */
  assistantMessageId: string;
  /** Final parent message id for assistant. */
  parentMessageId: string;
  /** Final merged metadata persisted to db. */
  metadata: Record<string, unknown>;
  /** Optional assistant message kind override. */
  assistantMessageKind?: ChatMessageKind;
}): UIMessage[] {
  const baseMessages = Array.isArray(input.modelMessages) ? [...input.modelMessages] : [];
  const responseWithKind = input.assistantMessageKind
    ? { ...(input.assistantResponseMessage as any), messageKind: input.assistantMessageKind }
    : (input.assistantResponseMessage as any);

  const assistantMessage = {
    ...responseWithKind,
    id: input.assistantMessageId,
    parentMessageId: input.parentMessageId,
    metadata: input.metadata,
  } as UIMessage;

  // 逻辑：若最后一条已经是同一 assistant id，则原位替换；否则追加新消息。
  const lastMessage = baseMessages.at(-1) as any;
  if (lastMessage?.id === input.assistantMessageId) {
    baseMessages[baseMessages.length - 1] = assistantMessage;
    return baseMessages;
  }
  return [...baseMessages, assistantMessage];
}
