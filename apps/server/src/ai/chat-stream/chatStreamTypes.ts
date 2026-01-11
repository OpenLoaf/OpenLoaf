import type { ChatRequestBody, TenasUIMessage } from "@tenas-ai/api/types/message";

/** Chat stream request payload, based on ChatRequestBody with server-only fields. */
export type ChatStreamRequest = ChatRequestBody & {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: TenasUIMessage[];
  /** Workspace id for this request. */
  workspaceId?: string;
  /** Project id for this request. */
  projectId?: string;
};
