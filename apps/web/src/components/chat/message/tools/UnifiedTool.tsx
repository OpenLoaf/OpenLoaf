"use client";

import * as React from "react";
import { Button } from "@tenas-ai/ui/button";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { createBrowserTabId } from "@/hooks/tab-id";
import { useChatContext } from "@/components/chat/ChatProvider";
import { queryClient, trpc } from "@/utils/trpc";
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
  normalizeToolInput,
  safeStringify,
} from "./shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "./shared/tool-utils";

type OpenUrlParams = {
  url?: string;
  title?: string;
};

type SubAgentInput = {
  name?: string;
  task?: string;
};

/** Resolve tool key for routing. */
function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

function getInputObject(part: AnyToolPart): Record<string, unknown> {
  return asPlainObject(normalizeToolInput(part.input)) ?? {};
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
  const { tabId: contextTabId, subAgentStreams, sessionId, updateMessage } = useChatContext();
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabId = contextTabId ?? activeTabId ?? undefined;

  const toolKind = getToolKind(part).toLowerCase();
  const input = getInputObject(part);
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
        trpc.chatmessage.findUniqueChatMessage.queryOptions({
          where: { id: String(messageId) },
          select: { id: true, parts: true },
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
          useTabs.getState().upsertToolPart(tabId, toolCallId, toolPart);
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
  }, [shouldFetchOutput, sessionId, messageId, updateMessage, part.toolCallId, tabId]);

  if (toolKind === "sub-agent") {
    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
    const stream = toolCallId ? subAgentStreams[toolCallId] : undefined;
    const effectiveInput = (stream?.name || stream?.task)
      ? { name: stream?.name, task: stream?.task }
      : (part.input as SubAgentInput | undefined);
    const effectiveOutput =
      stream ? stream.output : typeof part.output === "string" ? part.output : "";
    const effectiveErrorText = stream?.errorText || part.errorText;
    const effectiveState = stream?.state || part.state;

    const name = typeof effectiveInput?.name === "string" ? effectiveInput.name : "SubAgent";
    const task = typeof effectiveInput?.task === "string" ? effectiveInput.task : "";
    const statusTone = getToolStatusTone({
      type: part.type,
      state: effectiveState,
      output: effectiveOutput,
      errorText: effectiveErrorText,
    });

    const outputText = getRawOutputText(effectiveOutput, effectiveErrorText);
    const inputText = getRawInputText(effectiveInput);

    const isStreaming = stream?.streaming === true || isToolStreaming(part);

    return (
      <ToolInfoCard
        title={title}
        toolId={getToolId(part)}
        statusTone={statusTone}
        inputText={inputText || JSON.stringify({ name, task })}
        className={className}
        outputText={outputText}
        outputTone={typeof effectiveErrorText === "string" && effectiveErrorText.trim() ? "error" : "default"}
        showOutput={showOutput}
        isStreaming={isStreaming}
        outputLoading={isOutputLoading}
        onOpenChange={(open) => {
          if (open) void fetchToolOutput();
        }}
      />
    );
  }

  const statusTone = getToolStatusTone(part);

  if (toolKind === "open-url") {
    const url = typeof (input as OpenUrlParams).url === "string" ? (input as OpenUrlParams).url : "";
    const titleText =
      typeof (input as OpenUrlParams).title === "string" ? (input as OpenUrlParams).title : undefined;

    const finished = part.output != null || part.state === "output-available";
    const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;
    const onOpen = () => {
      if (!tabId || !url || !finished || hasError) return;
      const state = useTabs.getState();
      const tab = state.getTabById(tabId);
      if (!tab) return;
      const baseKey = `browser:${tab.workspaceId}:${tabId}:${tab.chatSessionId}`;
      const viewKey = `${baseKey}:${createBrowserTabId()}`;
      state.pushStackItem(
        tabId,
        {
          id: BROWSER_WINDOW_PANEL_ID,
          sourceKey: BROWSER_WINDOW_PANEL_ID,
          component: BROWSER_WINDOW_COMPONENT,
          params: { __customHeader: true, __open: { url, title: titleText, viewKey } },
        } as any,
        100,
      );
    };

    return (
      <ToolInfoCard
        title={title}
        toolId={getToolId(part)}
        statusTone={statusTone}
        inputText={getRawInputText(part.input)}
        className={className}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!finished || hasError || !url || !tabId}
            onClick={onOpen}
          >
            打开
          </Button>
        }
        outputText={getRawOutputText(part.output, part.errorText)}
        outputTone={hasError ? "error" : "default"}
        showOutput={showOutput}
        isStreaming={isStreaming}
        outputLoading={isOutputLoading}
        onOpenChange={(open) => {
          if (open) void fetchToolOutput();
        }}
      />
    );
  }

  const { hasErrorText } = getToolOutputState(part);
  const outputText = getRawOutputText(part.output, part.errorText || safeStringify(part.output));
  const resolvedOutput = isRejected ? "已拒绝" : outputText;

  return (
    <ToolInfoCard
      title={title}
      toolId={getToolId(part)}
      statusTone={statusTone}
      inputText={getRawInputText(part.input)}
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
