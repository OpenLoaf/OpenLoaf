"use client";

import { useTabs } from "@/hooks/use-tabs";
import { OpenUrlTool } from "./OpenUrlTool";
import { TestApprovalTool } from "./TestApprovalTool";
import SubAgentTool from "./SubAgentTool";
import CliThinkingTool from "./CliThinkingTool";
import ShellTool from "./runtime/ShellTool";
import ShellCommandTool from "./runtime/ShellCommandTool";
import ExecCommandTool from "./runtime/ExecCommandTool";
import WriteStdinTool from "./runtime/WriteStdinTool";
import ReadFileTool from "./file/ReadFileTool";
import ListDirTool from "./file/ListDirTool";
import GrepFilesTool from "./file/GrepFilesTool";
import PlanTool from "./PlanTool";
import GenericTool from "./shared/GenericTool";
import { useChatContext } from "../../ChatProvider";
import type { AnyToolPart, ToolVariant } from "./shared/tool-utils";

/** Resolve tool key for routing. */
function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

/**
 * 工具调用消息组件（MVP）
 * - 用原生 <details> 简化折叠逻辑
 * - 保留“一键复制（标题 + input + output）”用于排查
 */
export default function MessageTool({
  part,
  className,
  variant = "default",
}: {
  part: AnyToolPart;
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}) {
  const chat = useChatContext();
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const cliToolSnapshot = useTabs((state) =>
    toolCallId && chat.tabId ? state.toolPartsByTabId[chat.tabId]?.[toolCallId] : undefined,
  );
  // 逻辑：CLI 输出走 data-stream 时，用 toolParts 合并覆盖 message part。
  const resolvedPart =
    cliToolSnapshot?.variant === "cli-thinking" ? { ...part, ...cliToolSnapshot } : part;

  // open-url 使用专用组件，支持“流结束后手动点击打开左侧网页”。
  if (resolvedPart.toolName === "open-url" || resolvedPart.type === "tool-open-url") {
    return <OpenUrlTool part={resolvedPart} />;
  }
  if (resolvedPart.toolName === "test-approval" || resolvedPart.type === "tool-test-approval") {
    return <TestApprovalTool part={resolvedPart} />;
  }
  if (resolvedPart.toolName === "sub-agent" || resolvedPart.type === "tool-sub-agent") {
    return <SubAgentTool part={resolvedPart} />;
  }
  if (resolvedPart.variant === "cli-thinking") {
    return <CliThinkingTool part={resolvedPart} />;
  }
  const toolKind = getToolKind(resolvedPart).toLowerCase();

  if (toolKind === "shell" || toolKind.startsWith("shell-")) {
    return <ShellTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "shell-command" || toolKind.startsWith("shell-command-")) {
    return <ShellCommandTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "exec-command" || toolKind.startsWith("exec-command-")) {
    return <ExecCommandTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "write-stdin" || toolKind.startsWith("write-stdin-")) {
    return <WriteStdinTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "read-file") {
    return <ReadFileTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "list-dir") {
    return <ListDirTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "grep-files") {
    return <GrepFilesTool part={resolvedPart} className={className} variant={variant} />;
  }
  if (toolKind === "update-plan") {
    return <PlanTool part={resolvedPart} className={className} />;
  }

  return <GenericTool part={resolvedPart} className={className} variant={variant} />;
}
