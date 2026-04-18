/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useChatActions, useChatSession, useChatStatus, useChatTools } from "@/components/ai/context";
import { queryClient, trpc } from "@/utils/trpc";
import {
  BotIcon,
  FileTextIcon,
  FolderOpenIcon,
  GlobeIcon,
  ImageIcon,
  LoaderCircleIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
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
  getToolKind,
  getToolName,
  isToolStreaming,
  isApprovalPending,
  normalizeToolInput,
} from "./shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "./shared/tool-utils";

const iconCls = "size-3.5 text-muted-foreground";

/** Resolve icon for tool kind. */
function getToolIcon(kind: string): React.ReactNode {
  switch (kind) {
    case "Agent":
    case "SendMessage":
    case "close-agent":
    case "resume-agent":
      return <BotIcon className={iconCls} />;
    case "Edit":
    case "apply-patch":
    case "Write":
      return <FileTextIcon className={iconCls} />;
    case "Read":
    case "read-file":
      return <FileTextIcon className={iconCls} />;
    case "Glob":
    case "list-dir":
      return <FolderOpenIcon className={iconCls} />;
    case "Grep":
    case "grep-files":
      return <SearchIcon className={iconCls} />;
    case "OpenUrl":
      return <GlobeIcon className={iconCls} />;
    case "image-generate":
    case "video-generate":
      return <ImageIcon className={iconCls} />;
    case "Bash":
    case "shell-command":
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
  const { t } = useTranslation('ai')
  const { tabId: contextTabId, sessionId } = useChatSession();
  const { upsertToolPart } = useChatTools();
  const { updateMessage } = useChatActions();
  const { status } = useChatStatus();
  const tabId = contextTabId;

  const toolKind = getToolKind(part).toLowerCase();
  const title = getToolName(part);
  const toolIcon = getToolIcon(toolKind);

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;
  const hasApproval = part.approval != null;
  // 中文注释：decided（approved=true/false）后也要渲染 Confirmation，
  // 让内部的 ConfirmationAccepted / ConfirmationRejected 分支能显示
  // "已批准执行 / 已拒绝执行" 文案；否则拒绝后整块视觉反馈消失。
  const showConfirmation = hasApproval && Boolean(approvalId);
  // 中文注释：拒绝态也要显示 ToolOutput（渲染 tool.rejected "已拒绝"），
  // 以前 showOutput 漏掉 isRejected 导致拒绝后 ToolContent 空白。
  const showOutput = !hasApproval || part.approval?.approved === true || isRejected;
  const isStreaming = isToolStreaming(part);
  const actions =
    isApprovalRequested && approvalId ? (
      <ToolApprovalActions approvalId={approvalId} size="default" />
    ) : null;

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

  if ((toolKind === "image-generate" || toolKind === "video-generate") && part.state !== "output-error" && part.state !== "output-denied") {
    return <MediaGenerateTool part={part} messageId={messageId} />;
  }

  // 逻辑：Read / read-file 读取 .env 文件时使用专用渲染器
  if ((toolKind === "read" || toolKind === "read-file") && part.output != null) {
    const inputObj = asPlainObject(normalizeToolInput(part.input))
    const filePath = typeof inputObj?.path === 'string' ? inputObj.path : ''
    if (filePath && isEnvFilePath(filePath)) {
      return <EnvFileTool part={part} className={className} />
    }
  }

  const inputPayload = part.input ?? part.rawInput;
  const toolType = part.type === "dynamic-tool" ? "dynamic-tool" : part.type;
  const derivedName = toolType === "dynamic-tool" ? toolKind : (toolType ?? "").split("-").slice(1).join("-");
  const toolId = title && derivedName && title !== derivedName ? derivedName : undefined;

  return (
    <Tool
      defaultOpen={isApprovalRequested && !!approvalId}
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
          icon={toolIcon}
        />
      ) : (
        <ToolHeader
          title={title}
          type={toolType as any}
          state={part.state as any}
          icon={toolIcon}
        />
      )}
      <ToolContent>
        <ToolInput input={stripActionName(inputPayload) as any} toolId={toolId} />
        {showConfirmation ? (
          <Confirmation approval={part.approval as any} state={part.state as any}>
            <ConfirmationTitle>{t('tool.approvalRequest')}</ConfirmationTitle>
            <ConfirmationRequest>
              {t('tool.approvalContinue')}
              <ConfirmationActions>{actions}</ConfirmationActions>
            </ConfirmationRequest>
            <ConfirmationAccepted>{t('tool.approvalAccepted')}</ConfirmationAccepted>
            <ConfirmationRejected>{t('tool.approvalRejected')}</ConfirmationRejected>
          </Confirmation>
        ) : null}
        {showOutput ? (
          <ToolOutput
            output={isRejected ? t('tool.rejected') : part.output}
            errorText={displayErrorText}
          />
        ) : null}
        {isStreaming && !hasOutputPayload ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs py-1">
            <LoaderCircleIcon className="size-3 animate-spin" />
            <span>{t('tool.executing')}</span>
          </div>
        ) : isOutputLoading && !hasOutputPayload ? (
          <div className="text-muted-foreground text-xs">{t('tool.outputLoading')}</div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
