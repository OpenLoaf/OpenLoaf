/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import * as React from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useChatActions, useChatSession, useChatState, useChatTools } from "@/components/ai/context";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  FileTextIcon,
  FolderOpenIcon,
  GlobeIcon,
  ImageIcon,
  ListChecksIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import OpenUrlTool from "./OpenUrlTool";
import MediaGenerateTool from "./MediaGenerateTool";
import EnvFileTool, { isEnvFilePath } from "./EnvFileTool";
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
  ConfirmationAccepted,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  asPlainObject,
  getApprovalId,
  getToolName,
  isToolStreaming,
  isApprovalPending,
  normalizeToolInput,
} from "./shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "./shared/tool-utils";

/** Resolve tool key for routing. */
function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

const iconCls = "size-3.5 text-muted-foreground";

/** Resolve icon for tool kind. */
function getToolIcon(kind: string): React.ReactNode {
  switch (kind) {
    case "spawn-agent":
    case "send-input":
    case "wait-agent":
    case "close-agent":
    case "abort-agent":
    case "resume-agent":
      return <BotIcon className={iconCls} />;
    case "apply-patch":
      return <FileTextIcon className={iconCls} />;
    case "read-file":
      return <FileTextIcon className={iconCls} />;
    case "list-dir":
      return <FolderOpenIcon className={iconCls} />;
    case "open-url":
      return <GlobeIcon className={iconCls} />;
    case "image-generate":
    case "video-generate":
      return <ImageIcon className={iconCls} />;
    case "update-plan":
      return <ListChecksIcon className={iconCls} />;
    case "shell":
    case "shell-command":
    case "exec-command":
    case "write-stdin":
      return <TerminalIcon className={iconCls} />;
    default:
      return <WrenchIcon className={iconCls} />;
  }
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
  const { status } = useChatState();
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabId = contextTabId ?? activeTabId ?? undefined;

  const toolKind = getToolKind(part).toLowerCase();
  const title = getToolName(part);
  const toolIcon = getToolIcon(toolKind);

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;
  const hasApproval = part.approval != null;
  const showOutput = !hasApproval || part.approval?.approved === true;
  const isStreaming = isToolStreaming(part);
  const actions =
    isApprovalRequested && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null;

  // 逻辑：流式输出期间工具数据可能不完整，抑制错误显示避免闪烁。
  const isChatStreaming = status === "streaming" || status === "submitted";
  const isToolTerminal =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const displayErrorText =
    (!isChatStreaming || isToolTerminal) &&
    typeof part.errorText === "string" &&
    part.errorText.trim()
      ? part.errorText
      : undefined;

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

  if (toolKind === "image-generate" || toolKind === "video-generate") {
    return <MediaGenerateTool part={part} messageId={messageId} />;
  }

  if (toolKind === "open-url") {
    return <OpenUrlTool part={part} className={className} />;
  }

  // 逻辑：read-file 读取 .env 文件时使用专用渲染器
  if (toolKind === "read-file" && part.output != null) {
    const inputObj = asPlainObject(normalizeToolInput(part.input))
    const filePath = typeof inputObj?.path === 'string' ? inputObj.path : ''
    if (filePath && isEnvFilePath(filePath)) {
      return <EnvFileTool part={part} className={className} />
    }
  }

  const inputPayload = part.input ?? part.rawInput;
  const toolType = part.type === "dynamic-tool" ? "dynamic-tool" : part.type;

  return (
    <Tool
      defaultOpen={isApprovalRequested}
      onOpenChange={(open) => {
        if (open) void fetchToolOutput();
      }}
      className={cn("mb-2 min-w-0 text-xs", className)}
    >
      {toolType === "dynamic-tool" ? (
        <ToolHeader
          title={title}
          type="dynamic-tool"
          toolName={toolKind}
          state={part.state as any}
          icon={toolIcon}
          className="p-2 gap-2 [&_span]:text-xs [&_svg]:size-3.5"
        />
      ) : (
        <ToolHeader
          title={title}
          type={toolType as any}
          state={part.state as any}
          icon={toolIcon}
          className="p-2 gap-2 [&_span]:text-xs [&_svg]:size-3.5"
        />
      )}
      <ToolContent className="space-y-2 p-2 text-xs">
        <ToolInput input={stripActionName(inputPayload) as any} />
        {isApprovalRequested && approvalId ? (
          <Confirmation approval={part.approval as any} state={part.state as any}>
            <ConfirmationTitle>工具调用请求审批</ConfirmationTitle>
            <ConfirmationRequest>
              确认后将继续执行。
              <ConfirmationActions>{actions}</ConfirmationActions>
            </ConfirmationRequest>
            <ConfirmationAccepted>已批准执行</ConfirmationAccepted>
            <ConfirmationRejected>已拒绝执行</ConfirmationRejected>
          </Confirmation>
        ) : null}
        {showOutput ? (
          <ToolOutput
            output={isRejected ? "已拒绝" : part.output}
            errorText={displayErrorText}
          />
        ) : null}
        {isOutputLoading && !hasOutputPayload ? (
          <div className="text-muted-foreground text-xs">输出加载中...</div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
