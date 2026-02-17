"use client";

import * as React from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useChatActions, useChatSession, useChatTools } from "@/components/ai/context";
import { queryClient, trpc } from "@/utils/trpc";
import OpenUrlTool from "./OpenUrlTool";
import SubAgentTool from "./SubAgentTool";
import MediaGenerateTool from "./MediaGenerateTool";
import ToolApprovalActions from "./shared/ToolApprovalActions";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
} from "@/components/ai-elements/confirmation";
import {
  asPlainObject,
  getApprovalId,
  getToolName,
  isToolStreaming,
  isApprovalPending,
} from "./shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "./shared/tool-utils";

/** Resolve tool key for routing. */
function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

function stripActionName(value: unknown): unknown {
  const inputObject = asPlainObject(value);
  if (!inputObject) return value;
  const { actionName: _actionName, ...rest } = inputObject;
  return rest;
}

/** Unified tool renderer for most tool types. */
export default function UnifiedTool({
  part,
  className,
  variant: _variant,
  messageId,
}: {
  part: AnyToolPart;
  className?: string;
  variant?: ToolVariant;
  messageId?: string;
}) {
  const { tabId: contextTabId, sessionId } = useChatSession();
  const { upsertToolPart } = useChatTools();
  const { updateMessage } = useChatActions();
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabId = contextTabId ?? activeTabId ?? undefined;

  const toolKind = getToolKind(part).toLowerCase();
  const title = getToolName(part);

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;
  const hasApproval = part.approval != null;
  const showOutput = !hasApproval || part.approval?.approved === true;
  const isStreaming = isToolStreaming(part);
  const actions =
    isApprovalRequested && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null;

  const hasOutputPayload =
    part.output != null ||
    (typeof part.errorText === "string" && part.errorText.trim().length > 0) ||
    isRejected;
  const shouldFetchOutput =
    Boolean(messageId && sessionId) && !hasOutputPayload && !isApprovalRequested;
  const hasFetchedOutputRef = React.useRef(false);
  const isFetchingOutputRef = React.useRef(false);
  const [isOutputLoading, setIsOutputLoading] = React.useState(false);

  const fetchToolOutput = React.useCallback(async () => {
    if (!shouldFetchOutput || hasFetchedOutputRef.current || isFetchingOutputRef.current) return;
    isFetchingOutputRef.current = true;
    setIsOutputLoading(true);
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
      const toolCallId =
        typeof part.toolCallId === "string" ? String(part.toolCallId) : "";
      if (tabId && toolCallId) {
        const toolPart = targetParts.find(
          (p: any) => String(p?.toolCallId ?? "") === toolCallId,
        );
        if (toolPart) {
          upsertToolPart(toolCallId, toolPart);
          const hasOutput =
            toolPart.output != null ||
            (typeof toolPart.errorText === "string" && toolPart.errorText.trim().length > 0);
          if (hasOutput) hasFetchedOutputRef.current = true;
        }
      }
    } catch {
      // no-op
    } finally {
      isFetchingOutputRef.current = false;
      setIsOutputLoading(false);
    }
  }, [
    shouldFetchOutput,
    sessionId,
    messageId,
    updateMessage,
    part.toolCallId,
    tabId,
    upsertToolPart,
  ]);

  if (toolKind === "sub-agent") {
    return <SubAgentTool part={part} messageId={messageId} />;
  }

  if (toolKind === "image-generate" || toolKind === "video-generate") {
    return <MediaGenerateTool part={part} messageId={messageId} />;
  }

  if (toolKind === "open-url") {
    return <OpenUrlTool part={part} className={className} />;
  }

  const inputPayload = part.input ?? part.rawInput;
  const toolType = part.type === "dynamic-tool" ? "dynamic-tool" : part.type;

  return (
    <Tool
      defaultOpen={isStreaming || isApprovalRequested}
      onOpenChange={(open) => {
        if (open) void fetchToolOutput();
      }}
      className={className}
    >
      {toolType === "dynamic-tool" ? (
        <ToolHeader
          title={title}
          type="dynamic-tool"
          toolName={toolKind}
          state={part.state as any}
        />
      ) : (
        <ToolHeader
          title={title}
          type={toolType as any}
          state={part.state as any}
        />
      )}
      <ToolContent>
        <ToolInput input={stripActionName(inputPayload) as any} />
        {isApprovalRequested && approvalId ? (
          <Confirmation approval={part.approval as any} state={part.state as any}>
            <ConfirmationRequest>
              工具调用请求审批，确认后将继续执行。
            </ConfirmationRequest>
            <ConfirmationActions>{actions}</ConfirmationActions>
          </Confirmation>
        ) : null}
        {showOutput ? (
          <ToolOutput
            output={isRejected ? "已拒绝" : part.output}
            errorText={typeof part.errorText === "string" ? part.errorText : undefined}
          />
        ) : null}
        {isOutputLoading && !hasOutputPayload ? (
          <div className="text-muted-foreground text-xs">输出加载中...</div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
