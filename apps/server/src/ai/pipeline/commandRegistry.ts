import { CHAT_COMMANDS } from "@tenas-ai/api/common/chatCommands";
import type { ChatCommandId } from "@tenas-ai/api/common/chatCommands";

export type CommandKind = "transform" | "session" | "direct";

export type CommandDef = {
  id: ChatCommandId;
  token: string;
  kind: CommandKind;
};

const COMMAND_KIND_BY_ID: Record<ChatCommandId, CommandKind> = {
  "summary-history": "transform",
  "summary-title": "session",
};

export const COMMAND_REGISTRY: CommandDef[] = CHAT_COMMANDS.map((command) => ({
  id: command.id,
  token: command.command,
  kind: COMMAND_KIND_BY_ID[command.id],
}));

export const COMMAND_REGISTRY_BY_TOKEN = new Map(
  COMMAND_REGISTRY.map((command) => [command.token, command]),
);
