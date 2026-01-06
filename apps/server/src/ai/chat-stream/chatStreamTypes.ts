import type { ChatModelSource } from "@teatime-ai/api/common";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";

/** Chat stream request payload. */
export type ChatStreamRequest = {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: TeatimeUIMessage[];
  /** Assistant message id for streaming. */
  messageId?: string;
  /** Client id for request context. */
  clientId?: string;
  /** Target tab id for runtime actions. */
  tabId?: string;
  /** Selected chat model id. */
  chatModelId?: string;
  /** Selected chat model source. */
  chatModelSource?: ChatModelSource;
};
