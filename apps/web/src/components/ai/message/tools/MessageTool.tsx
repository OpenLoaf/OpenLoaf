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
import CliThinkingTool from "./CliThinkingTool";
import RequestUserInputTool from "./RequestUserInputTool";
import UnifiedTool from "./UnifiedTool";
import PlanTool from "./PlanTool";
import ProjectTool from "./ProjectTool";
import WriteFileTool from "./WriteFileTool";
import ShellTool from "./ShellTool";
import ExecCommandTool from "./ExecCommandTool";
import WidgetTool from "./WidgetTool";
import WidgetInitTool from "./WidgetInitTool";
import WidgetCheckTool from "./WidgetCheckTool";
import JsxCreateTool from "./JsxCreateTool";
import SpawnAgentTool from "./SpawnAgentTool";
import WaitAgentTool from "./WaitAgentTool";
import ChartTool from "./ChartTool";
import { useChatState, useChatTools } from "../../context";
import { getApprovalId, isApprovalPending, type AnyToolPart, type ToolVariant } from "./shared/tool-utils";
import ToolApprovalActions from "./shared/ToolApprovalActions";

/** Resolve tool key for routing. */
function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

const SHELL_TOOL_KINDS = new Set([
  "shell",
  "shell-command",
]);

const EXEC_TOOL_KINDS = new Set([
  "exec-command",
  "write-stdin",
]);

/**
 * 工具调用消息组件（MVP）
 * - 用原生 <details> 简化折叠逻辑
 * - 保留“一键复制（标题 + input + output）”用于排查
 */
export default function MessageTool({
  part,
  className,
  variant = "default",
  messageId,
}: {
  part: AnyToolPart;
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
  /** Message id for fetching tool output. */
  messageId?: string;
}) {
  if (!part) return null;
  const { status } = useChatState();
  const { toolParts } = useChatTools();
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const toolSnapshot = toolCallId ? toolParts[toolCallId] : undefined;
  const safeSnapshot = toolSnapshot
    ? ({
        ...toolSnapshot,
        errorText: toolSnapshot.errorText ?? undefined,
      } as Partial<AnyToolPart>)
    : undefined;
  // 逻辑：tool streaming 状态以 toolParts 为准，覆盖 message part。
  let resolvedPart: AnyToolPart = safeSnapshot ? { ...part, ...safeSnapshot } : part;
  if (
    status === "ready" &&
    (resolvedPart.state === "input-streaming" || resolvedPart.state === "output-streaming")
  ) {
    // 逻辑：会话已结束但数据库残留 streaming 状态时，强制终止流式显示。
    resolvedPart = {
      ...resolvedPart,
      state: resolvedPart.state === "input-streaming" ? "input-available" : "output-available",
    };
  }

  if (resolvedPart.variant === "cli-thinking") {
    return <CliThinkingTool part={resolvedPart} />;
  }
  const toolKind = getToolKind(resolvedPart).toLowerCase();

  if (toolKind === "update-plan") {
    return <PlanTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "cli-thinking") {
    return <CliThinkingTool part={resolvedPart} />;
  }

  if (toolKind === "request-user-input") {
    return <RequestUserInputTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "jsx-create" || toolKind === "jsx-preview") {
    return (
      <JsxCreateTool part={resolvedPart} className={className} messageId={messageId} />
    );
  }

  if (toolKind === "apply-patch") {
    return <WriteFileTool part={resolvedPart} className={className} />;
  }

  // 逻辑：审批状态检测，专用渲染器外层包裹审批按钮。
  const approvalId = getApprovalId(resolvedPart);
  const needsApprovalUI = isApprovalPending(resolvedPart);

  if (SHELL_TOOL_KINDS.has(toolKind)) {
    // ShellTool 内部已集成审批 UI（macOS 窗口内），无需外层包裹。
    return <ShellTool part={resolvedPart} className={className} />;
  }

  if (EXEC_TOOL_KINDS.has(toolKind)) {
    // ExecCommandTool 内部已集成审批 UI，无需外层包裹。
    return <ExecCommandTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "generate-widget") {
    // WidgetTool 内部已集成审批 UI，无需外层包裹。
    return <WidgetTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "widget-init") {
    // WidgetInitTool 内部已集成审批 UI，无需外层包裹。
    return <WidgetInitTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "widget-check") {
    return <WidgetCheckTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "spawn-agent") {
    return <SpawnAgentTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "wait-agent") {
    return <WaitAgentTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "chart-render") {
    return <ChartTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "project-mutate") {
    return (
      <ProjectTool
        part={resolvedPart}
        className={className}
        variant={variant}
        messageId={messageId}
      />
    );
  }

  return (
    <UnifiedTool part={resolvedPart} className={className} variant={variant} messageId={messageId} />
  );
}

/** 包裹专用渲染器，在下方显示审批按钮。 */
function ToolWithApproval({
  children,
  approvalId,
  showApproval,
}: {
  children: React.ReactNode;
  approvalId: string | undefined;
  showApproval: boolean;
}) {
  if (!showApproval || !approvalId) return <>{children}</>;
  return (
    <div className="space-y-2">
      {children}
      <div className="ml-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">需要审批：</span>
        <ToolApprovalActions approvalId={approvalId} />
      </div>
    </div>
  );
}
