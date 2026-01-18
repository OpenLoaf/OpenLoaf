"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ToolApprovalActions from "./ToolApprovalActions";
import ToolCard from "./ToolCard";
import ToolJsonBlock from "./ToolJsonBlock";
import ToolTextBlock from "./ToolTextBlock";
import {
  getJsonDisplay,
  getToolName,
  getToolOutputState,
  getToolStatusText,
  isEmptyInput,
  safeStringify,
} from "./tool-utils";
import type { AnyToolPart, ToolVariant } from "./tool-utils";

interface GenericToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
  /** Optional title override. */
  title?: string;
}

/** Render a generic tool card with input/output sections. */
export default function GenericTool({ part, className, variant = "default", title }: GenericToolProps) {
  const toolName = title ?? getToolName(part);
  const statusText = getToolStatusText(part);
  const showInput = !isEmptyInput(part.input);
  const inputText = safeStringify(part.input);
  const { outputText, hasErrorText, displayText } = getToolOutputState(part);
  const outputLabel = hasErrorText ? "错误信息" : "输出结果";

  const [copied, setCopied] = React.useState(false);

  const inputJsonDisplay = React.useMemo(() => getJsonDisplay(part.input), [part.input]);
  const outputJsonDisplay = React.useMemo(() => getJsonDisplay(part.output), [part.output]);

  const approvalId = typeof part.approval?.id === "string" ? part.approval?.id : undefined;
  const showApprovalActions = part.state === "approval-requested" && Boolean(approvalId);
  const isRejected = part.approval?.approved === false;
  // 中文注释：审批中展示彩虹外框，审批完成后自动移除。
  const thinkingBorderClassName = showApprovalActions
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
      : undefined;
  const thinkingBorderStyle = showApprovalActions
    ? ({ ["--tenas-thinking-border-fill" as any]: "var(--color-muted)" } as React.CSSProperties)
    : undefined;

  /** Handle copy action for tool content. */
  const handleCopyAll = React.useCallback(
    async (event: React.MouseEvent) => {
      // 中文注释：summary 内点击按钮不应触发折叠开关。
      event.preventDefault();
      event.stopPropagation();

      const copyText = [
        `工具：${toolName}`,
        `输入参数\n${showInput ? inputText : "（无）"}`,
        `输出结果\n${displayText}`,
      ].join("\n\n");

      try {
        await navigator.clipboard.writeText(copyText);
        setCopied(true);
        toast.success("已复制");
        window.setTimeout(() => setCopied(false), 1200);
      } catch (error) {
        toast.error("复制失败");
        console.error(error);
      }
    },
    [toolName, showInput, inputText, displayText],
  );

  return (
    <ToolCard
      title={toolName}
      status={statusText}
      className={className}
      defaultOpen={Boolean(hasErrorText)}
      detailsClassName={thinkingBorderClassName}
      detailsStyle={thinkingBorderStyle}
      actions={
        showApprovalActions && approvalId ? (
          <ToolApprovalActions approvalId={approvalId} />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "h-7 w-7 shrink-0 bg-transparent text-muted-foreground shadow-none",
              "hover:bg-transparent hover:text-foreground",
            )}
            onClick={handleCopyAll}
            aria-label="复制工具信息"
            title="复制：标题 + 输入 + 输出"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        )
      }
    >
      {showInput ? (
        inputJsonDisplay ? (
          <ToolJsonBlock
            label="输入参数"
            json={inputJsonDisplay}
            variant={variant}
            collapsedClassName="max-h-28"
            expandedClassName="max-h-96"
          />
        ) : (
          <ToolTextBlock
            label="输入参数"
            text={inputText}
            variant={variant}
            maxHeightClassName="max-h-40 overflow-auto"
          />
        )
      ) : null}

      {!showApprovalActions ? (
        hasErrorText ? (
          <ToolTextBlock
            label={outputLabel}
            text={part.errorText ?? ""}
            variant={variant}
            tone="error"
            maxHeightClassName="max-h-64 overflow-auto"
          />
        ) : outputJsonDisplay ? (
          <ToolJsonBlock
            label={outputLabel}
            json={outputJsonDisplay}
            variant={variant}
            collapsedClassName="max-h-32"
            expandedClassName="max-h-[36rem]"
          />
        ) : (
          <ToolTextBlock
            label={outputLabel}
            text={displayText}
            variant={variant}
            maxHeightClassName="max-h-64 overflow-auto"
          />
        )
      ) : null}
    </ToolCard>
  );
}
