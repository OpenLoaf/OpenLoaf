import { CHAT_COMMANDS } from "@openloaf/api/common/chatCommands";
import type { ChatCommandId } from "@openloaf/api/common/chatCommands";
import type { AiCommandContext } from "@/ai/services/chat/types";

type CommandDef = {
  /** Stable command id. */
  id: ChatCommandId;
  /** Slash command token. */
  token: string;
};

const COMMAND_REGISTRY: CommandDef[] = CHAT_COMMANDS.map((command) => ({
  id: command.id,
  token: command.command,
}));

const COMMAND_REGISTRY_BY_TOKEN = new Map(
  COMMAND_REGISTRY.map((command) => [command.token, command]),
);

export class CommandParser {
  /** Parse a command only when it appears at the start of input text. */
  static parseCommandAtStart(text: string): AiCommandContext | null {
    const rawText = typeof text === "string" ? text : "";
    const trimmed = rawText.trimStart();
    if (!trimmed.startsWith("/")) return null;
    // 逻辑：仅匹配输入首部的指令 token。
    const firstSpaceIndex = trimmed.search(/\s/u);
    const token = firstSpaceIndex === -1 ? trimmed : trimmed.slice(0, firstSpaceIndex);
    const command = COMMAND_REGISTRY_BY_TOKEN.get(token);
    if (!command) return null;
    const argsText = trimmed.slice(token.length).trim();
    return {
      id: command.id,
      token: command.token,
      rawText,
      argsText: argsText || undefined,
    };
  }
}

/** Parse a command only when it appears at the start of input text. */
export function parseCommandAtStart(text: string): AiCommandContext | null {
  return CommandParser.parseCommandAtStart(text);
}
