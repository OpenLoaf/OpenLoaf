"use client";

export const SUB_AGENT_TOOL_ID = "sub-agent" as const;

type AnyToolPart = {
  type?: unknown;
  toolName?: unknown;
};

type AnyMessage = {
  agent?: unknown;
  metadata?: unknown;
};

/** 从 message 中提取 agent.kind（兼容 agent 顶层与 metadata.agent）。 */
export function getMessageAgentKind(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const m = message as AnyMessage;
  const agent = (m as any)?.agent ?? (m as any)?.metadata?.agent;
  const kind = (agent as any)?.kind;
  return typeof kind === "string" ? kind : undefined;
}

/** 判断一条消息是否为 subAgent 输出消息。 */
export function isSubAgentMessage(message: unknown): boolean {
  return getMessageAgentKind(message) === "sub";
}

/** 判断一个 part 是否是 tool part（用于 UI 渲染工具卡片）。 */
export function isToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyToolPart;
  if (typeof p.toolName === "string" && p.toolName.trim()) return true;
  if (typeof p.type !== "string") return false;
  const type = p.type.trim();
  return type === "dynamic-tool" || type.startsWith("tool-");
}

/** 判断一个 part 是否是 sub-agent tool。 */
export function isSubAgentToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyToolPart;
  if (typeof p.toolName === "string" && p.toolName.trim()) {
    return p.toolName.trim() === SUB_AGENT_TOOL_ID;
  }
  if (typeof p.type !== "string") return false;
  const type = p.type.trim();
  if (type === SUB_AGENT_TOOL_ID) return true;
  if (type.startsWith("tool-")) return type.slice("tool-".length) === SUB_AGENT_TOOL_ID;
  return false;
}
