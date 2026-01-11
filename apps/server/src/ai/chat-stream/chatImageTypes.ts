import { z } from "zod";
import type { ChatModelSource } from "@tenas-ai/api/common";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";

export type ChatImageMessageInput = {
  /** Message id. */
  id: string;
  /** Message role. */
  role: "system" | "user" | "assistant";
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
  /** Tab id. */
  tabId?: string;
  /** Extra params. */
  params?: Record<string, unknown>;
  /** Trigger source. */
  trigger?: string;
  /** Retry flag. */
  retry?: boolean;
  /** Image model id. */
  chatModelId: string;
  /** Model source. */
  chatModelSource?: ChatModelSource;
  /** Workspace id. */
  workspaceId?: string;
  /** Project id. */
  projectId?: string;
  /** Board id. */
  boardId?: string | null;
};

export type ChatImageResponse = {
  /** Session id. */
  sessionId: string;
  /** Assistant message payload. */
  message: TenasUIMessage;
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

const chatImageMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.unknown()),
    parentMessageId: z.string().nullable().optional(),
    metadata: z.unknown().optional(),
    agent: z.unknown().optional(),
  })
  .passthrough();

export const chatImageRequestSchema: z.ZodType<ChatImageRequest> = z
  .object({
    sessionId: z.string().min(1),
    messages: z.array(chatImageMessageSchema).min(1),
    id: z.string().min(1).optional(),
    messageId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    tabId: z.string().min(1).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    trigger: z.string().min(1).optional(),
    retry: z.boolean().optional(),
    chatModelId: z.string().min(1),
    chatModelSource: z.enum(["local", "cloud"]).optional(),
    workspaceId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    boardId: z.string().min(1).nullable().optional(),
  })
  .strict();
