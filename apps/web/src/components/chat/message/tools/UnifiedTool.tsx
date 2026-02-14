"use client";

import * as React from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useChatActions, useChatSession, useChatTools } from "@/components/chat/context";
import { queryClient, trpc } from "@/utils/trpc";
import OpenUrlTool from "./OpenUrlTool";
import SubAgentTool from "./SubAgentTool";
import MediaGenerateTool from "./MediaGenerateTool";
import ToolApprovalActions from "./shared/ToolApprovalActions";
import ToolInfoCard from "./shared/ToolInfoCard";
import {
  asPlainObject,
  getApprovalId,
  getToolId,
  getToolName,
  getToolOutputState,
  getToolStatusTone,
  isToolStreaming,
  isApprovalPending,
  safeStringify,
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

function stringifyRaw(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getRawInputText(value: unknown): string {
  const cleaned = stripActionName(value);
  return stringifyRaw(cleaned);
}

function getRawOutputText(output: unknown, errorText?: string): string {
  const raw = stringifyRaw(output);
  if (raw) return raw;
  if (typeof errorText === "string" && errorText.trim()) return errorText;
  return "";
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
    (typeof part.errorText === "string" && part.errorText.trim().length > 0);
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

  const statusTone = getToolStatusTone(part);
  const { hasErrorText } = getToolOutputState(part);
  const outputText = getRawOutputText(part.output, part.errorText || safeStringify(part.output));
  const resolvedOutput = isRejected ? "已拒绝" : outputText;

  const inputPayload = part.input ?? part.rawInput;

  return (
    <ToolInfoCard
      title={title}
      toolId={getToolId(part)}
      statusTone={statusTone}
      inputText={getRawInputText(inputPayload)}
      className={className}
      isApprovalRequested={isApprovalRequested}
      isRejected={isRejected}
      actions={actions}
      outputText={isApprovalRequested ? "" : resolvedOutput}
      outputTone={hasErrorText || isRejected ? "error" : "default"}
      showOutput={showOutput}
      isStreaming={isStreaming}
      outputLoading={isOutputLoading}
      onOpenChange={(open) => {
        if (open) void fetchToolOutput();
      }}
    />
  );
}
