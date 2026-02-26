import type { ChatModelSource } from "@openloaf/api/common";
import type { OpenLoafUIMessage } from "@openloaf/api/types/message";

export type ChatImageMessageInput = {
  /** Message id. */
  id: string;
  /** Message role. */
  role: "system" | "user" | "assistant" | "subagent";
  /** Message parts. */
  parts: unknown[];
  /** Parent message id. */
  parentMessageId?: string | null;
  /** Message metadata. */
  metadata?: unknown;
  /** Agent metadata. */
  agent?: unknown;
  /** Additional fields for compatibility. */
  [key: string]: unknown;
};

export type ChatImageRequest = {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: ChatImageMessageInput[];
  /** Request id. */
  id?: string;
  /** Assistant message id. */
  messageId?: string;
  /** Web client id. */
  clientId?: string;
  /** Client timezone (IANA). */
  timezone?: string;
  /** Tab id. */
  tabId?: string;
  /** Extra params. */
  params?: Record<string, unknown>;
  /** Trigger source. */
  trigger?: string;
  /** Retry flag. */
  retry?: boolean;
  /** Image model id (optional, resolved from agent config). */
  chatModelId?: string;
  /** Model source (optional, resolved from agent config). */
  chatModelSource?: ChatModelSource;
  /** Workspace id. */
  workspaceId?: string;
  /** Project id. */
  projectId?: string;
  /** Board id. */
  boardId?: string | null;
  /** Image save directory uri. */
  imageSaveDir?: string;
  /** Selected skill names for this request. */
  selectedSkills?: string[];
};

type ChatImageResponse = {
  /** Session id. */
  sessionId: string;
  /** Assistant message payload. */
  message: OpenLoafUIMessage;
};

export type ChatImageRequestResult =
  | {
      /** Whether the request succeeded. */
      ok: true;
      /** Response payload. */
      response: ChatImageResponse;
    }
  | {
      /** Whether the request succeeded. */
      ok: false;
      /** HTTP status code. */
      status: number;
      /** Error message for client display. */
      error: string;
    };
