"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { queryClient, trpc } from "@/utils/trpc";
import { useChatActions, useChatSession, useChatTools } from "../../context";
import MessageParts from "../MessageParts";
import MessageThinking from "../MessageThinking";
import {
  asPlainObject,
  getToolName,
  isToolStreaming,
  normalizeToolInput,
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

/** Resolve sub-agent name from input or tool name. */
function getSubAgentName(part: AnyToolPart): string {
  const input = normalizeToolInput(part.input);
  const inputObject = asPlainObject(input);
  if (typeof inputObject?.subAgentName === "string" && inputObject.subAgentName.trim()) {
    return inputObject.subAgentName.trim();
  }
  return getToolName(part);
}

/** Build minimal fallback parts when only error text exists. */
function buildFallbackParts(input: { errorText?: string }): unknown[] {
  const errorText =
    typeof input.errorText === "string" && input.errorText.trim()
      ? input.errorText.trim()
      : "";
  if (errorText) {
    return [{ type: "text", text: errorText, state: "done" }];
  }
  return [];
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
  const safeSnapshot = toolSnapshot
    ? ({
        ...toolSnapshot,
        errorText: toolSnapshot.errorText ?? undefined,
      } as Partial<AnyToolPart>)
    : undefined;
  const resolvedPart: AnyToolPart = safeSnapshot ? { ...part, ...safeSnapshot } : part;
  const [isOpen, setIsOpen] = React.useState(true);

  const actionName = getActionName(resolvedPart);
  const subAgentName = getSubAgentName(resolvedPart);
  const errorText = stream?.errorText || resolvedPart.errorText;
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
  const streamParts = Array.isArray(stream?.parts) ? stream?.parts : undefined;
  const historyParts =
    isOpen && Array.isArray(historyMessage?.parts) ? historyMessage?.parts : undefined;
  const fallbackParts = buildFallbackParts({ errorText: errorText ?? undefined });
  const renderParts = streamParts ?? historyParts ?? fallbackParts;
  const streamingParts = renderParts;
  const renderMessageId = historyMessage?.id;
  const shouldShowLoading =
    (historyQuery.isLoading && (!streamParts || streamParts.length === 0)) ||
    (isStreaming && renderParts.length === 0);
  const resolvedTitle =
    actionName === subAgentName || !subAgentName
      ? actionName || "SubAgent"
      : `${actionName || "SubAgent"} ｜ ${subAgentName}`;
  const ToggleIcon = isOpen ? ChevronDown : ChevronRight;
  const contentTextClassName = "text-xs";

  return (
    <div className={cn("ml-2 w-full min-w-0 max-w-full text-xs overflow-x-hidden")}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full flex-col items-start gap-1 text-left"
      >
        <div className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground">
          <ToggleIcon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{resolvedTitle}</span>
        </div>
      </button>

      {isOpen ? (
        <div className="mt-2 space-y-2 rounded-md bg-muted/20 p-2">
          {shouldShowLoading ? <MessageThinking /> : null}
          <div className="show-scrollbar max-h-64 space-y-2 overflow-y-auto overflow-x-hidden">
            <MessageParts
              parts={streamingParts as any[]}
              options={{
                toolVariant: "nested",
                textClassName: contentTextClassName,
                toolClassName: contentTextClassName,
                ...(renderMessageId ? { messageId: renderMessageId } : {}),
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
