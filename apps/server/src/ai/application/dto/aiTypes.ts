import type { ChatModelSource } from "@tenas-ai/api/common/modelTypes";
import type { ChatCommandId } from "@tenas-ai/api/common/chatCommands";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { SkillMatch } from "@/ai/domain/services/SkillSelector";

export type AiIntent = "chat" | "image" | "command" | "utility";

export type AiResponseMode = "stream" | "json";

export type AiExecuteRequest = {
  /** Session id for history access. */
  sessionId?: string;
  /** Request id from client transport. */
  id?: string;
  /** Incoming UI messages. */
  messages?: TenasUIMessage[];
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
  /** Selected chat model id. */
  chatModelId?: string;
  /** Selected chat model source. */
  chatModelSource?: ChatModelSource;
  /** Stable client id for session. */
  clientId?: string;
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

export type AiSkillContext = {
  /** Skill names requested by user. */
  names: string[];
  /** Resolved skills injected into prompt. */
  matches: SkillMatch[];
};
