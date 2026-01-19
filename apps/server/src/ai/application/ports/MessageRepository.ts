import type { TenasUIMessage } from "@tenas-ai/api/types/message";

export type EnsurePrefaceInput = {
  /** Session id. */
  sessionId: string;
  /** Preface message payload. */
  message: TenasUIMessage;
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
  /** Ensure session preface exists and return its id. */
  ensurePreface(input: EnsurePrefaceInput): Promise<string | null>;
  /** Save a chat message node. */
  saveMessage(input: SaveMessageInput): Promise<void>;
}
