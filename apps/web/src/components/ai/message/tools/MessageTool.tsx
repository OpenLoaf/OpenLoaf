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

import CliThinkingTool from "./CliThinkingTool";
import RequestUserInputTool from "./RequestUserInputTool";
import UnifiedTool from "./UnifiedTool";
import PlanTool from "./PlanTool";
import ProjectTool from "./ProjectTool";
import WriteFileTool from "./WriteFileTool";
import ShellTool from "./ShellTool";
import WidgetTool from "./WidgetTool";
import WidgetInitTool from "./WidgetInitTool";
import WidgetCheckTool from "./WidgetCheckTool";
import JsxCreateTool from "./JsxCreateTool";
import SpawnAgentTool from "./SpawnAgentTool";
import WaitAgentTool from "./WaitAgentTool";
import ChartTool from "./ChartTool";
import ExcelTool from "./ExcelTool";
import WordTool from "./WordTool";
import PptxTool from "./PptxTool";
import PdfTool from "./PdfTool";
import ImageProcessTool from "./ImageProcessTool";
import BrowserSnapshotTool from "./BrowserSnapshotTool";
import BrowserScreenshotTool from "./BrowserScreenshotTool";
import TaskTool from "./TaskTool";
import ClaudeCodeBashTool from "./ClaudeCodeBashTool";
import ClaudeCodeReadTool from "./ClaudeCodeReadTool";
import ClaudeCodeWriteTool from "./ClaudeCodeWriteTool";
import ClaudeCodeEditTool from "./ClaudeCodeEditTool";
import ClaudeCodeSearchTool from "./ClaudeCodeSearchTool";
import ClaudeCodeWebTool from "./ClaudeCodeWebTool";
import ClaudeCodeTaskTool from "./ClaudeCodeTaskTool";
import { useChatState, useChatTools } from "../../context";
import { normalizeToolInput, type AnyToolPart, type ToolVariant } from "./shared/tool-utils";

/** Resolve tool key for routing. */
function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

const SHELL_TOOL_KINDS = new Set([
  "shell-command",
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
  const { status } = useChatState();
  const { toolParts } = useChatTools();
  if (!part) return null;
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

  // Claude Code CLI 直接执行的工具（providerExecuted: true）
  if (resolvedPart.providerExecuted) {
    if (toolKind === "bash") {
      return <ClaudeCodeBashTool part={resolvedPart} className={className} />;
    }
    if (toolKind === "read") {
      return <ClaudeCodeReadTool part={resolvedPart} className={className} />;
    }
    if (toolKind === "write") {
      return <ClaudeCodeWriteTool part={resolvedPart} className={className} />;
    }
    if (toolKind === "edit" || toolKind === "multiedit") {
      return <ClaudeCodeEditTool part={resolvedPart} className={className} />;
    }
    if (toolKind === "glob") {
      return <ClaudeCodeSearchTool part={resolvedPart} kind="glob" className={className} />;
    }
    if (toolKind === "grep") {
      return <ClaudeCodeSearchTool part={resolvedPart} kind="grep" className={className} />;
    }
    if (toolKind === "ls") {
      return <ClaudeCodeSearchTool part={resolvedPart} kind="ls" className={className} />;
    }
    if (toolKind === "webfetch") {
      return <ClaudeCodeWebTool part={resolvedPart} kind="webfetch" className={className} />;
    }
    if (toolKind === "websearch") {
      return <ClaudeCodeWebTool part={resolvedPart} kind="websearch" className={className} />;
    }
    if (toolKind === "task") {
      return <ClaudeCodeTaskTool part={resolvedPart} className={className} />;
    }
  }

  if (toolKind === "update-plan") {
    return <PlanTool part={resolvedPart} className={className} />;
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

  if (SHELL_TOOL_KINDS.has(toolKind)) {
    // ShellTool 内部已集成审批 UI（macOS 窗口内），无需外层包裹。
    return <ShellTool part={resolvedPart} className={className} />;
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

  if (toolKind === "excel-query" || toolKind === "excel-mutate") {
    return <ExcelTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "word-query" || toolKind === "word-mutate") {
    const inputMode = normalizeToolInput(resolvedPart.input);
    const inputObj = typeof inputMode === 'object' && inputMode != null ? inputMode as Record<string, unknown> : null;
    if (inputObj?.mode !== "read-xml") {
      return <WordTool part={resolvedPart} className={className} />;
    }
  }

  if (toolKind === "pptx-query" || toolKind === "pptx-mutate") {
    const inputMode = normalizeToolInput(resolvedPart.input);
    const inputObj = typeof inputMode === 'object' && inputMode != null ? inputMode as Record<string, unknown> : null;
    if (inputObj?.mode !== "read-xml") {
      return <PptxTool part={resolvedPart} className={className} />;
    }
  }

  if (toolKind === "pdf-query" || toolKind === "pdf-mutate") {
    return <PdfTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "image-process") {
    return <ImageProcessTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "browser-snapshot" || toolKind === "browser-observe") {
    return <BrowserSnapshotTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "browser-screenshot") {
    return <BrowserScreenshotTool part={resolvedPart} className={className} />;
  }

  if (toolKind === "task-manage" || toolKind === "create-task" || toolKind === "task-status") {
    return <TaskTool part={resolvedPart} className={className} />;
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

  // 没有专用 UI 的工具：成功后隐藏，出错/拒绝时保留显示
  const isCompleted = resolvedPart.state === 'output-available'
    || resolvedPart.state === 'output-error'
    || resolvedPart.state === 'output-denied'
  const hasError = resolvedPart.state === 'output-error' || resolvedPart.state === 'output-denied'
  if (isCompleted && !hasError) return null

  return (
    <UnifiedTool part={resolvedPart} className={className} variant={variant} messageId={messageId} />
  );
}
