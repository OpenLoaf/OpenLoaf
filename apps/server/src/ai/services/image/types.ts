/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ChatModelSource } from "@openloaf/api/common";
import type { ClientPlatform } from "@openloaf/api/types/platform";
import type { ChatPageContext, OpenLoafUIMessage } from "@openloaf/api/types/message";

export type ChatImageMessageInput = {
  /** Message id. */
  id: string;
  /** Message role. */
  role: "system" | "user" | "assistant" | "subagent" | "task-report";
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
  /** Project id. */
  projectId?: string;
  /** Board id. */
  boardId?: string | null;
  /** Image save directory uri. */
  imageSaveDir?: string;
  /** Selected skill names for this request. */
  selectedSkills?: string[];
  /** Client platform for conditional tool registration. */
  clientPlatform?: ClientPlatform;
  /** Web app version for SaaS metadata. */
  webVersion?: string;
  /** Server version for SaaS metadata. */
  serverVersion?: string;
  /** Desktop (Electron) app version for SaaS metadata. */
  desktopVersion?: string;
  /** Page context for skill auto-loading. */
  pageContext?: ChatPageContext;
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
