import type { TenasUIMessage } from "@tenas-ai/api/types/message";

export type EnsurePrefaceInput = {
  /** Session id. */
  sessionId: string;
  /** Preface text content. */
  text: string;
};

export type SaveMessageInput = {
  /** Session id. */
  sessionId: string;
  /** Message payload. */
  message: TenasUIMessage;
  /** Parent message id. */
  parentMessageId: string | null;
};

export interface MessageRepository {
  /** Ensure session preface text exists. */
  ensurePreface(input: EnsurePrefaceInput): Promise<void>;
  /** Save a chat message node. */
  saveMessage(input: SaveMessageInput): Promise<void>;
}
