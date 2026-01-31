type ToolPartLike = {
  toolCallId?: string;
  toolName?: string;
  type?: string;
};

type HandleSubAgentToolPartsInput = {
  parts: unknown[];
  tabId?: string;
  subAgentToolCallId: string;
  upsertToolPart: (tabId: string, toolCallId: string, next: any) => void;
  executeToolPart: (input: { part: any; tabId?: string }) => Promise<boolean> | boolean;
};

/** Handle sub-agent tool parts and forward frontend tool execution. */
export function handleSubAgentToolParts(input: HandleSubAgentToolPartsInput): void {
  if (!input.tabId || !input.subAgentToolCallId) return;
  if (!Array.isArray(input.parts) || input.parts.length === 0) return;

  for (const part of input.parts) {
    const candidate = part as ToolPartLike | null;
    const toolCallIdValue =
      candidate && typeof candidate.toolCallId === "string" ? String(candidate.toolCallId) : "";
    if (!toolCallIdValue) continue;
    const type = candidate && typeof candidate.type === "string" ? candidate.type : "";
    const toolName =
      candidate && typeof candidate.toolName === "string" ? candidate.toolName : undefined;
    const isTool =
      toolName != null || type === "dynamic-tool" || (type && type.startsWith("tool-"));
    if (!isTool) continue;

    if (toolName === "open-url") {
      // 逻辑：记录子代理 open-url 原始入参，便于排查 url 丢失问题。
      console.warn("[sub-agent] open-url tool part", {
        toolCallId: toolCallIdValue,
        part: part as any,
      });
    }

    input.upsertToolPart(input.tabId, toolCallIdValue, {
      ...(part as any),
      subAgentToolCallId: input.subAgentToolCallId,
    } as any);

    void input.executeToolPart({
      part: part as any,
      tabId: input.tabId,
    });
  }
}
