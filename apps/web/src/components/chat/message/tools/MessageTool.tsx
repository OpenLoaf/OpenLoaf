"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";

// MVP：只展示工具名称 + 输入 + 输出（去掉语法高亮/格式化/多层折叠）
type AnyToolPart = {
  type: string; // `tool-xxx` / `dynamic-tool`
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function getToolName(part: AnyToolPart) {
  if (part.title) return part.title;
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

function safeStringify(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * 尝试把值识别为 JSON，并同时给出“默认折叠/展开后格式化”的两种展示文本。
 * - 默认折叠：紧凑单行（便于快速扫一眼）
 * - 展开后：2 空格缩进格式化
 */
function getJsonDisplay(value: unknown): null | { collapsedText: string; expandedText: string } {
  if (value == null) return null;

  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      // 关键：先做轻量前置判断，避免对普通文本频繁 JSON.parse
      const maybeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
      if (!maybeJson) return null;

      const parsed = JSON.parse(trimmed) as unknown;
      return {
        collapsedText: JSON.stringify(parsed),
        expandedText: JSON.stringify(parsed, null, 2),
      };
    }

    if (typeof value === "object") {
      return {
        collapsedText: JSON.stringify(value),
        expandedText: JSON.stringify(value, null, 2),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function isEmptyInput(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function getToolStatusText(part: AnyToolPart): string {
  if (typeof part.errorText === "string" && part.errorText.trim()) return "失败";
  if (part.state && part.state !== "output-available") return String(part.state);
  if (part.output != null) return "完成";
  return "运行中";
}

/**
 * 工具调用消息组件（MVP）
 * - 用原生 <details> 简化折叠逻辑
 * - 保留“一键复制（标题 + input + output）”用于排查
 */
export default function MessageTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
}) {
  const toolName = getToolName(part);
  const statusText = getToolStatusText(part);
  const showInput = !isEmptyInput(part.input);
  const inputText = safeStringify(part.input);
  const outputText = safeStringify(part.output);
  const hasErrorText = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const outputDisplayText =
    outputText ||
    (hasErrorText
      ? `（错误：${part.errorText}）`
      : part.state && part.state !== "output-available"
        ? `（${part.state}）`
        : "（暂无返回结果）");

  const [copied, setCopied] = React.useState(false);
  const [inputJsonExpanded, setInputJsonExpanded] = React.useState(false);
  const [outputJsonExpanded, setOutputJsonExpanded] = React.useState(false);

  const inputJsonDisplay = React.useMemo(() => getJsonDisplay(part.input), [part.input]);
  const outputJsonDisplay = React.useMemo(() => getJsonDisplay(part.output), [part.output]);

  const handleCopyAll = async (event: React.MouseEvent) => {
    // 关键：summary 内点击按钮不应触发折叠开关
    event.preventDefault();
    event.stopPropagation();

    const copyText = [
      `工具：${toolName}`,
      `输入参数\n${showInput ? inputText : "（无）"}`,
      `输出结果\n${outputDisplayText}`,
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
  };

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <details className="w-full min-w-0 max-w-[80%] rounded-lg bg-muted/40 px-3 py-2 text-foreground" open={hasErrorText}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="min-w-0 flex-1 truncate">
            <span className="shrink-0">工具：</span>
            <span className="text-foreground/80">{toolName}</span>
            <span className="ml-2 text-[11px] text-muted-foreground/80">{statusText}</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 shrink-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
            onClick={handleCopyAll}
            aria-label="复制工具信息"
            title="复制：标题 + 输入 + 输出"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        </summary>

        <div className="mt-2 space-y-2">
          {showInput ? (
            <div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <div>输入参数</div>
                {inputJsonDisplay ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6 shrink-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                    onClick={() => setInputJsonExpanded((value) => !value)}
                    aria-label={inputJsonExpanded ? "收起 JSON" : "展开 JSON"}
                    title={inputJsonExpanded ? "收起（紧凑）" : "展开（格式化）"}
                  >
                    <ChevronDown className={cn("size-3 transition-transform", inputJsonExpanded ? "rotate-180" : "rotate-0")} />
                  </Button>
                ) : null}
              </div>
              <pre
                className={cn(
                  "mt-1 overflow-auto whitespace-pre bg-background p-2 text-xs",
                  inputJsonDisplay ? (inputJsonExpanded ? "max-h-96" : "max-h-28") : "max-h-40 whitespace-pre-wrap break-words",
                )}
              >
                {inputJsonDisplay ? (inputJsonExpanded ? inputJsonDisplay.expandedText : inputJsonDisplay.collapsedText) : inputText}
              </pre>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div>{hasErrorText ? "错误信息" : "输出结果"}</div>
              {!hasErrorText && outputJsonDisplay ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 shrink-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                  onClick={() => setOutputJsonExpanded((value) => !value)}
                  aria-label={outputJsonExpanded ? "收起 JSON" : "展开 JSON"}
                  title={outputJsonExpanded ? "收起（紧凑）" : "展开（格式化）"}
                >
                  <ChevronDown className={cn("size-3 transition-transform", outputJsonExpanded ? "rotate-180" : "rotate-0")} />
                </Button>
              ) : null}
            </div>
            <pre
              className={cn(
                "mt-1 overflow-auto bg-background p-2 text-xs",
                hasErrorText
                  ? "max-h-64 whitespace-pre-wrap break-words"
                  : outputJsonDisplay
                    ? outputJsonExpanded
                      ? "max-h-[36rem] whitespace-pre"
                      : "max-h-32 whitespace-pre"
                    : "max-h-64 whitespace-pre-wrap break-words",
                hasErrorText && "text-destructive/80",
              )}
            >
              {hasErrorText
                ? part.errorText
                : outputJsonDisplay
                  ? outputJsonExpanded
                    ? outputJsonDisplay.expandedText
                    : outputJsonDisplay.collapsedText
                  : outputDisplayText}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}
