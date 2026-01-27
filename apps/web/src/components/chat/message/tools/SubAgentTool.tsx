"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { queryClient, trpc } from "@/utils/trpc";
import { useChatActions, useChatSession, useChatTools } from "../../context";
import { renderMessageParts } from "../renderMessageParts";
import {
  asPlainObject,
  getToolName,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
} from "./shared/tool-utils";

type SubAgentHistoryMessage = {
  id: string;
  parts: unknown[];
};

/** Resolve display name from actionName or tool title. */
function getActionName(part: AnyToolPart): string {
  const input = normalizeToolInput(part.input);
  const inputObject = asPlainObject(input);
  if (typeof inputObject?.actionName === "string" && inputObject.actionName.trim()) {
    return inputObject.actionName.trim();
  }
  return getToolName(part);
}

/** Format output payload for preview display. */
function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const text = (output as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text;
  }
  const raw = safeStringify(output);
  return raw ? raw : "";
}

/**
 * Sub-agent tool renderer (no background).
 */
export default function SubAgentTool({
  part,
  messageId,
}: {
  part: AnyToolPart;
  messageId?: string;
}) {
  const { sessionId } = useChatSession();
  const { updateMessage } = useChatActions();
  const { subAgentStreams, toolParts, upsertToolPart } = useChatTools();
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const stream = toolCallId ? subAgentStreams[toolCallId] : undefined;
  const toolSnapshot = toolCallId ? toolParts?.[toolCallId] : undefined;
  const resolvedPart = toolSnapshot ? { ...part, ...toolSnapshot } : part;
  const [isOpen, setIsOpen] = React.useState(false);

  const actionName = getActionName(resolvedPart);
  const errorText = stream?.errorText || resolvedPart.errorText;
  const outputRaw = stream ? stream.output : resolvedPart.output;
  const outputText = stringifyOutput(outputRaw);
  const displayText =
    typeof errorText === "string" && errorText.trim()
      ? errorText.trim()
      : outputText;
  const isStreaming = stream?.streaming === true || isToolStreaming(resolvedPart);

  const hasOutputPayload =
    resolvedPart.output != null ||
    (typeof resolvedPart.errorText === "string" && resolvedPart.errorText.trim().length > 0);
  const shouldFetchOutput = Boolean(messageId && sessionId && toolCallId) && !hasOutputPayload;
  const hasFetchedOutputRef = React.useRef(false);
  const isFetchingOutputRef = React.useRef(false);

  const fetchToolOutput = React.useCallback(async () => {
    if (!shouldFetchOutput || hasFetchedOutputRef.current || isFetchingOutputRef.current) return;
    isFetchingOutputRef.current = true;
    try {
      const data = await queryClient.fetchQuery(
        trpc.chatmessage.findUniqueChatMessage.queryOptions({
          where: { id: String(messageId) },
          select: { id: true, parts: true },
        }),
      );
      const targetParts = Array.isArray((data as any)?.parts) ? (data as any).parts : [];
      if (!targetParts.length) return;
      updateMessage(String(messageId), { parts: targetParts });
      if (toolCallId) {
        const toolPart = targetParts.find(
          (item: any) => String(item?.toolCallId ?? "") === toolCallId,
        );
        if (toolPart) {
          upsertToolPart(toolCallId, toolPart);
          const hasOutput =
            toolPart.output != null ||
            (typeof toolPart.errorText === "string" && toolPart.errorText.trim().length > 0);
          if (hasOutput) hasFetchedOutputRef.current = true;
        }
      }
    } finally {
      isFetchingOutputRef.current = false;
    }
  }, [shouldFetchOutput, messageId, toolCallId, updateMessage, upsertToolPart]);

  React.useEffect(() => {
    if (!shouldFetchOutput) return;
    void fetchToolOutput();
  }, [shouldFetchOutput, fetchToolOutput]);

  const historyQuery = useQuery({
    ...trpc.chat.getSubAgentHistory.queryOptions({
      sessionId: sessionId ?? "",
      toolCallId,
    }),
    enabled: Boolean(isOpen && sessionId && toolCallId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const historyMessage = (historyQuery.data?.message ?? null) as SubAgentHistoryMessage | null;

  return (
    <div className={cn("ml-2 w-full min-w-0 max-w-full")}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full flex-col items-start gap-1 text-left"
      >
        <div className="text-[10px] font-medium text-foreground/70">
          {actionName || "SubAgent"}
        </div>
        {!isOpen ? (
          <div className="whitespace-pre-wrap break-words text-[12px] text-foreground/80">
            {displayText || (isStreaming ? "生成中…" : "")}
          </div>
        ) : null}
      </button>

      {isOpen ? (
        <div className="mt-2 space-y-2">
          {historyQuery.isLoading ? (
            <div className="text-[11px] text-muted-foreground">加载中…</div>
          ) : historyMessage ? (
            <div className="space-y-2">
              {renderMessageParts(historyMessage.parts as any[], {
                messageId: historyMessage.id,
              })}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">暂无子代理记录</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
