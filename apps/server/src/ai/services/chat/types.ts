/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ChatCommandId } from "@openloaf/api/common/chatCommands";
import type { ChatModelSource } from "@openloaf/api/common";
import type { ChatRequestBody, OpenLoafUIMessage } from "@openloaf/api/types/message";

/** Chat stream request payload, based on ChatRequestBody with server-only fields. */
export type ChatStreamRequest = ChatRequestBody & {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: OpenLoafUIMessage[];
  /** Workspace id for this request. */
  workspaceId?: string;
  /** Project id for this request. */
  projectId?: string;
  /** Board id for this request. */
  boardId?: string;
  /** Selected skill names for this request. */
  selectedSkills?: string[];
  /** Explicit chat model id from frontend (e.g. board nodes). */
  chatModelId?: string;
  /** Explicit chat model source from frontend (e.g. board nodes). */
  chatModelSource?: ChatModelSource;
};

export type AiIntent = "chat" | "image" | "command" | "utility";

export type AiResponseMode = "stream" | "json";

export type AiExecuteRequest = {
  /** Session id for history access. */
  sessionId?: string;
  /** Request id from client transport. */
  id?: string;
  /** Incoming UI messages. */
  messages?: OpenLoafUIMessage[];
  /** Extra parameters from UI. */
  params?: Record<string, unknown>;
  /** Current tab id for UI actions. */
  tabId?: string;
  /** AI SDK transport trigger. */
  trigger?: string;
  /** Message id for regenerate. */
  messageId?: string;
  /** Retry flag for regenerate. */
  retry?: boolean;
  /** Stable client id for session. */
  clientId?: string;
  /** Client timezone (IANA). */
  timezone?: string;
  /** Board id for chat context. */
  boardId?: string;
  /** Workspace id for context lookup. */
  workspaceId?: string;
  /** Project id for context lookup. */
  projectId?: string;
  /** Image save directory for image requests. */
  imageSaveDir?: string;
  /** Execution intent. */
  intent?: AiIntent;
  /** Response format. */
  responseMode?: AiResponseMode;
  /** Tool approval payloads keyed by toolCallId. */
  toolApprovalPayloads?: Record<string, Record<string, unknown>>;
  /** Explicit chat model id from frontend (e.g. board nodes). */
  chatModelId?: string;
  /** Explicit chat model source from frontend (e.g. board nodes). */
  chatModelSource?: ChatModelSource;
};

export type AiCommandContext = {
  /** Stable command id. */
  id: ChatCommandId;
  /** Raw command token. */
  token: string;
  /** Raw user input. */
  rawText: string;
  /** Argument text after token. */
  argsText?: string;
};
