"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { queryClient, trpc } from "@/utils/trpc";
import { useChatActions, useChatSession, useChatTools } from "../../context";
import MessageParts from "../MessageParts";
import MessageThinking from "../MessageThinking";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Agent, AgentHeader } from "@/components/ai-elements/agent";
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

/** Resolve model name from sub-agent input. */
function getSubAgentModel(part: AnyToolPart): string | undefined {
  const input = normalizeToolInput(part.input);
  const inputObject = asPlainObject(input);
  if (typeof inputObject?.model === "string" && inputObject.model.trim()) {
    return inputObject.model.trim();
  }
  return undefined;
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
  const subAgentModel = getSubAgentModel(resolvedPart);
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
        trpc.chat.getMessageParts.queryOptions({
          sessionId: sessionId ?? '',
          messageId: String(messageId),
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
  const contentTextClassName = "text-xs";

  return (
    <div className={cn("w-full min-w-0 max-w-full text-xs overflow-x-hidden")}>
      <Agent className="text-xs">
        <AgentHeader
          name={subAgentName || "SubAgent"}
          model={subAgentModel}
          className="p-2 [&_span]:text-xs [&_svg]:size-3.5"
        >
          {actionName && actionName !== subAgentName ? (
            <span className="truncate text-xs text-muted-foreground">{actionName}</span>
          ) : null}
          {isStreaming ? (
            <span className="text-[11px] text-muted-foreground/80">运行中</span>
          ) : null}
        </AgentHeader>
        <Task
          open={isOpen}
          onOpenChange={setIsOpen}
          className="w-full border-0"
        >
          <TaskTrigger title="对话历史" className="px-2 text-xs" />
          <TaskContent className="mt-2 space-y-2 border-l-0 p-0 pl-0">
            {shouldShowLoading ? <MessageThinking /> : null}
            <div className="show-scrollbar max-h-72 space-y-2 overflow-y-auto overflow-x-hidden rounded-md bg-muted/20 p-2">
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
          </TaskContent>
        </Task>
      </Agent>
    </div>
  );
}
