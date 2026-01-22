"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

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
  showOutput = true,
  isApprovalRequested,
  isRejected,
  isStreaming,
  actions,
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
  const defaultOpen = isApprovalRequested || isRejected || outputTone === "error";
  const statusIcon = isApprovalRequested ? (
    <span className="text-[12px] font-semibold text-amber-500" aria-hidden>
      ?
    </span>
  ) : statusTone === "success" ? (
    <Check className="size-3 text-emerald-500" />
  ) : statusTone === "error" ? (
    <X className="size-3 text-destructive" />
  ) : (
    <Circle className="size-3 text-muted-foreground/70" />
  );
  const codeLanguage = "bash";

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <Accordion type="single" collapsible defaultValue={defaultOpen ? "tool" : undefined} className="w-full">
        <AccordionItem
          value="tool"
          className={cn(
            "w-full min-w-0 max-w-[90%] rounded-xl px-3 py-2 last:border-b",
            containerClassName,
            isStreaming && "tenas-tool-streaming",
          )}
          style={containerStyle}
        >
          <AccordionTrigger className="py-0.5 text-[11px] font-medium text-foreground/70 hover:no-underline">
            <div className="flex w-full items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{statusIcon}</span>
                <span className="break-words text-foreground/70">{title}</span>
              </div>
            </div>
          </AccordionTrigger>
          {actions ? (
            <div className="mt-0.5 flex w-full flex-wrap items-center justify-end gap-1.5 text-[10px] text-muted-foreground/80">
              {actions}
            </div>
          ) : null}
          <AccordionContent className="pt-1.5 text-[11px] text-muted-foreground/70">
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                <span>输入</span>
                {toolId ? (
                  <span className="truncate normal-case text-[10px] text-muted-foreground/70">
                    {toolId}
                  </span>
                ) : null}
              </div>
              <div className="show-scrollbar max-h-32 overflow-y-auto font-mono text-[10px]">
                <SyntaxHighlighter
                  style={oneDark as any}
                  language={codeLanguage}
                  PreTag="div"
                  showLineNumbers={false}
                  wrapLines
                  wrapLongLines
                  customStyle={{
                    margin: 0,
                    background: "transparent",
                    padding: "0.2rem 0.4rem",
                    fontSize: "10px",
                    lineHeight: "1.5",
                    fontFamily: "inherit",
                    textShadow: "none",
                    boxSizing: "border-box",
                    display: "block",
                    width: "100%",
                    maxWidth: "100%",
                    minWidth: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                  codeTagProps={{ style: { fontFamily: "inherit", textShadow: "none" } }}
                >
                  {inputText}
                </SyntaxHighlighter>
              </div>
              {showOutput && outputText ? (
                <>
                  <Separator className="my-0.5 bg-border/60" />
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">输出</div>
                  <div
                    className={cn(
                      "show-scrollbar max-h-32 overflow-y-auto font-mono text-[10px]",
                      outputTone === "error" && "text-destructive",
                      outputTone === "muted" && "text-muted-foreground",
                      outputTone === "default" && "text-foreground/70",
                    )}
                  >
                    <SyntaxHighlighter
                      style={oneDark as any}
                      language={codeLanguage}
                      PreTag="div"
                      showLineNumbers={false}
                      wrapLines
                      wrapLongLines
                      customStyle={{
                        margin: 0,
                        background: "transparent",
                        padding: "0.2rem 0.4rem",
                        fontSize: "10px",
                        lineHeight: "1.5",
                        fontFamily: "inherit",
                        textShadow: "none",
                        boxSizing: "border-box",
                        display: "block",
                        width: "100%",
                        maxWidth: "100%",
                        minWidth: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                      codeTagProps={{ style: { fontFamily: "inherit", textShadow: "none" } }}
                    >
                      {outputText}
                    </SyntaxHighlighter>
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
