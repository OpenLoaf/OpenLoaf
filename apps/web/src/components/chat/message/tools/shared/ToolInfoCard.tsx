"use client";

import * as React from "react";
import { Check, Circle, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@tenas-ai/ui/accordion";
import { Separator } from "@tenas-ai/ui/separator";

export type ToolBadgeTone = "default" | "success" | "warning" | "error";

interface ToolInfoCardProps {
  /** Tool title. */
  title: string;
  /** Tool id for display. */
  toolId?: string;
  /** Status badge tone. */
  statusTone?: ToolBadgeTone;
  /** Raw input content. */
  inputText: string;
  /** Raw output content. */
  outputText?: string;
  /** Output tone. */
  outputTone?: "default" | "error" | "muted";
  /** Whether output is loading. */
  outputLoading?: boolean;
  /** Whether to show output block. */
  showOutput?: boolean;
  /** Whether approval is requested. */
  isApprovalRequested?: boolean;
  /** Whether the tool is rejected. */
  isRejected?: boolean;
  /** Whether the tool is streaming output. */
  isStreaming?: boolean;
  /** Header action nodes. */
  actions?: React.ReactNode;
  /** Accordion open change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Extra class names for wrapper. */
  className?: string;
}

/** Render a card-style tool container. */
export default function ToolInfoCard({
  title,
  toolId,
  statusTone = "default",
  inputText,
  outputText,
  outputTone = "default",
  outputLoading = false,
  showOutput = true,
  isApprovalRequested,
  isRejected,
  isStreaming,
  actions,
  onOpenChange,
  className,
}: ToolInfoCardProps) {
  const containerClassName = isApprovalRequested
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
      : "border border-border/40 bg-muted/20";
  const containerStyle = isApprovalRequested
    ? ({
        // 中文注释：保持彩虹外框内填充与卡片背景一致。
        ["--tenas-thinking-border-fill" as any]: "var(--color-muted)",
      } as React.CSSProperties)
    : undefined;
  const defaultOpen = false;
  const statusIcon = isApprovalRequested ? (
    <span className="text-[12px] font-semibold text-amber-500" aria-hidden>
      ?
    </span>
  ) : isRejected ? (
    <X className="size-3 text-destructive" />
  ) : statusTone === "success" ? (
    <Check className="size-3 text-emerald-500" />
  ) : statusTone === "error" ? (
    <X className="size-3 text-destructive" />
  ) : (
    <Circle className="size-3 text-muted-foreground/70" />
  );
  const headerActions = isApprovalRequested ? actions : null;
  const contentActions = isApprovalRequested ? null : actions;
  const outputTextRef = React.useRef(outputText);
  const [isOutputCopied, setIsOutputCopied] = React.useState(false);
  const copyResetTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    outputTextRef.current = outputText;
  }, [outputText]);

  React.useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  /** Copy output text to clipboard. */
  const handleCopyOutput = React.useCallback(async () => {
    const text = outputTextRef.current;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 中文注释：剪贴板不可用时，降级使用隐藏输入框拷贝。
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setIsOutputCopied(true);
    if (copyResetTimeoutRef.current != null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setIsOutputCopied(false);
    }, 1200);
  }, []);

  const triggerClassName = cn(
    "py-0.5 text-[10px] font-medium text-foreground/70 hover:no-underline [&>svg]:text-muted-foreground/30",
    headerActions ? "pr-2" : undefined,
  );

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultOpen ? "tool" : undefined}
        onValueChange={(value) => onOpenChange?.(value === "tool")}
        className="w-full"
      >
        <AccordionItem
          value="tool"
          className={cn(
            "relative w-full min-w-0 max-w-[90%] rounded-lg px-3 py-1 last:border-b",
            containerClassName,
            isStreaming && "tenas-tool-streaming",
          )}
          style={containerStyle}
        >
          <AccordionTrigger className={triggerClassName}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex w-full items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">{statusIcon}</span>
                  <span className="break-words text-foreground/70">{title}</span>
                </div>
                {isRejected ? (
                  <span className="shrink-0 text-[9px] font-medium text-destructive">已拒绝</span>
                ) : null}
              </div>
              {headerActions ? (
                <div className="flex w-full justify-end text-[9px] text-muted-foreground/80">
                  {headerActions}
                </div>
              ) : null}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-1.5 text-[10px] text-muted-foreground/70">
            <div className="mt-1.5 flex flex-col gap-1.5">
              {contentActions ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground/80">
                  {contentActions}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                <span>输入</span>
                {toolId ? (
                  <span className="truncate normal-case text-[9px] text-muted-foreground/70">
                    {toolId}
                  </span>
                ) : null}
              </div>
              <div className="show-scrollbar max-h-32 overflow-y-auto text-[9px] text-muted-foreground/80">
                <div className="px-2 py-1 whitespace-pre-wrap break-words">
                  {inputText}
                </div>
              </div>
              {showOutput && (outputText || outputLoading) ? (
                <>
                  <Separator className="my-0.5 bg-border/60" />
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-muted-foreground/80">
                    <span>输出</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[9px] normal-case text-muted-foreground/80 hover:text-foreground/80"
                      onClick={handleCopyOutput}
                      aria-label={isOutputCopied ? "已复制" : "复制输出内容"}
                    >
                      {isOutputCopied ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                  <div
                    className={cn(
                      "show-scrollbar max-h-32 overflow-y-auto text-[9px]",
                      outputTone === "error" && "text-destructive",
                      outputTone === "muted" && "text-muted-foreground",
                      outputTone === "default" && "text-foreground/70",
                    )}
                  >
                    {outputLoading && !outputText ? (
                      <div className="px-2 py-1 text-[9px] text-muted-foreground/80">加载中…</div>
                    ) : (
                      <div className="px-2 py-1 whitespace-pre-wrap break-words">{outputText}</div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
