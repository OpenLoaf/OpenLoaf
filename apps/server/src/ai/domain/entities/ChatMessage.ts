import type { MessageKind } from "./MessageKind";

export type ChatMessage = {
  /** Message id. */
  id: string;
  /** Message kind. */
  kind: MessageKind;
  /** Message content. */
  content: string;
};
