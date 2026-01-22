"use client";

import { useTabs } from "@/hooks/use-tabs";
import CliThinkingTool from "./CliThinkingTool";
import UnifiedTool from "./UnifiedTool";
import PlanTool from "./PlanTool";
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

  return <UnifiedTool part={resolvedPart} className={className} variant={variant} />;
}
