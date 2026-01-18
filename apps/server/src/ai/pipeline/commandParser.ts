import type { AiCommandContext } from "./aiTypes";
import { COMMAND_REGISTRY_BY_TOKEN } from "./commandRegistry";

/** Parse a command only when it appears at the start of input text. */
export function parseCommandAtStart(text: string): AiCommandContext | null {
  const rawText = typeof text === "string" ? text : "";
  const trimmed = rawText.trimStart();
  if (!trimmed.startsWith("/")) return null;
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
