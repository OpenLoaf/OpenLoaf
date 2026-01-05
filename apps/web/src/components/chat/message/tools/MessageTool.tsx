"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { toast } from "sonner";
import { OpenUrlTool } from "./OpenUrlTool";
import { TestApprovalTool } from "./TestApprovalTool";
import SubAgentTool from "./SubAgentTool";
import { useChatContext } from "../../ChatProvider";

// MVP：只展示工具名称 + 输入 + 输出（去掉语法高亮/格式化/多层折叠）
type AnyToolPart = {
  type: string; // `tool-xxx` / `dynamic-tool`
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id?: string; approved?: boolean; reason?: string };
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

const JSON_SYNTAX_HIGHLIGHTER_STYLE: React.CSSProperties = {
  margin: 0,
  background: "transparent",
  padding: "0.5rem",
  fontSize: "12px",
  lineHeight: "1.6",
  fontFamily: "inherit",
  textShadow: "none",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  overflow: "visible",
  whiteSpace: "pre",
  wordBreak: "normal",
  overflowWrap: "normal",
};

const JSON_SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS = {
  style: { fontFamily: "inherit", textShadow: "none" } as React.CSSProperties,
};

/**
 * 工具输入/输出中的 JSON 代码块展示（语法高亮 + 容器滚动）。
 */
function JsonSyntaxBlock({
  code,
  className,
  variant,
}: {
  code: string;
  className?: string;
  variant?: "default" | "nested";
}) {
  return (
    <div
      className={cn(
        "mt-1 bg-background",
        variant === "nested" ? "overflow-visible" : "overflow-auto",
        className,
      )}
    >
      <SyntaxHighlighter
        style={oneDark as any}
        language="json"
        PreTag="div"
        showLineNumbers={false}
        customStyle={JSON_SYNTAX_HIGHLIGHTER_STYLE}
        codeTagProps={JSON_SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
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
  variant = "default",
}: {
  part: AnyToolPart;
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: "default" | "nested";
}) {
  const chat = useChatContext();

  // open-url 使用专用组件，支持“流结束后手动点击打开左侧网页”。
  if (part.toolName === "open-url" || part.type === "tool-open-url") {
    return <OpenUrlTool part={part} />;
  }
  if (part.toolName === "test-approval" || part.type === "tool-test-approval") {
    return <TestApprovalTool part={part} />;
  }
  if (part.toolName === "sub-agent" || part.type === "tool-sub-agent") {
    return <SubAgentTool part={part} />;
  }

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
  const [isExpanded, setIsExpanded] = React.useState(Boolean(hasErrorText));
  const [inputJsonExpanded, setInputJsonExpanded] = React.useState(false);
  const [outputJsonExpanded, setOutputJsonExpanded] = React.useState(false);

  const inputJsonDisplay = React.useMemo(() => getJsonDisplay(part.input), [part.input]);
  const outputJsonDisplay = React.useMemo(() => getJsonDisplay(part.output), [part.output]);

  const approvalId = typeof part.approval?.id === "string" ? part.approval?.id : undefined;
  const showApprovalActions = part.state === "approval-requested" && Boolean(approvalId);

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
      <details
        className="w-full min-w-0 max-w-[80%] rounded-lg bg-muted/40 px-3 py-2 text-foreground"
        open={isExpanded}
        onToggle={(event) => setIsExpanded(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  isExpanded ? "rotate-0" : "-rotate-90",
                )}
              />
            </span>
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
          {showApprovalActions ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] text-muted-foreground">需要审批</div>
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={chat.status === "streaming" || chat.status === "submitted"}
                onClick={async () => {
                  await chat.addToolApprovalResponse({ id: approvalId!, approved: true });
                  // 按 AI SDK 官方流程，审批回应写入 messages 后需要再触发一次 sendMessage 才会执行工具并继续生成。
                  await chat.sendMessage();
                }}
              >
                允许
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={chat.status === "streaming" || chat.status === "submitted"}
                onClick={async () => {
                  await chat.addToolApprovalResponse({ id: approvalId!, approved: false });
                  await chat.sendMessage();
                }}
              >
                拒绝
              </Button>
            </div>
          ) : null}

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
              {inputJsonDisplay ? (
                <JsonSyntaxBlock
                  code={inputJsonExpanded ? inputJsonDisplay.expandedText : inputJsonDisplay.collapsedText}
                  className={
                    variant === "nested"
                      ? "max-h-none"
                      : inputJsonExpanded
                        ? "max-h-96"
                        : "max-h-28"
                  }
                  variant={variant}
                />
              ) : (
                <pre
                  className={cn(
                    "mt-1 whitespace-pre-wrap break-words bg-background p-2 text-xs",
                    variant === "nested" ? "max-h-none overflow-visible" : "max-h-40 overflow-auto",
                  )}
                >
                  {inputText}
                </pre>
              )}
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
            {hasErrorText ? (
              <pre
                className={cn(
                  "mt-1 whitespace-pre-wrap break-words bg-background p-2 text-xs text-destructive/80",
                  variant === "nested" ? "max-h-none overflow-visible" : "max-h-64 overflow-auto",
                )}
              >
                {part.errorText}
              </pre>
            ) : outputJsonDisplay ? (
              <JsonSyntaxBlock
                code={outputJsonExpanded ? outputJsonDisplay.expandedText : outputJsonDisplay.collapsedText}
                className={
                  variant === "nested"
                    ? "max-h-none"
                    : outputJsonExpanded
                      ? "max-h-[36rem]"
                      : "max-h-32"
                }
                variant={variant}
              />
            ) : (
              <pre
                className={cn(
                  "mt-1 whitespace-pre-wrap break-words bg-background p-2 text-xs",
                  variant === "nested" ? "max-h-none overflow-visible" : "max-h-64 overflow-auto",
                )}
              >
                {outputDisplayText}
              </pre>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
