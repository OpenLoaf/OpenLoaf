"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import * as React from "react";
import { useTheme } from "next-themes";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { toast } from "sonner";
import OpenUrlTool from "./OpenUrlTool";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";

// MVP：这里只关心工具名称和返回结果，不做复杂的状态/交互
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

/**
 * 从 streaming part 中提取工具 ID（用于匹配 ToolDef.id）。
 * - 兼容：`tool-xxx`、`toolName`、以及直接用 id 作为 type 的情况。
 */
function getToolId(part: AnyToolPart) {
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

function isEmptyInput(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object")
    return Object.keys(value as object).length === 0;
  return false;
}

const CODE_CUSTOM_STYLE: CSSProperties = {
  margin: 0,
  background: "hsl(var(--background))",
  padding: 0,
  fontSize: "0.75rem",
  lineHeight: "1.1rem",
};

const CODE_TAG_PROPS = {
  style: { background: "hsl(var(--background))" } as CSSProperties,
};

const LINE_NUMBER_STYLE: CSSProperties = {
  minWidth: "2.25em",
  paddingRight: "1em",
  opacity: 0.6,
};

function CodeBlockWithCopy({
  code,
  codeStyle,
  maxHeightClassName,
}: {
  code: string;
  codeStyle: any;
  maxHeightClassName: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [isFormatted, setIsFormatted] = React.useState(true);

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("已复制");
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      toast.error("复制失败");
      console.error(error);
    }
  };

  const handleToggleFormat = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsFormatted((v) => !v);
  };

  const displayCode = React.useMemo(() => {
    if (isFormatted) {
      return code;
    }
    try {
      const parsed = JSON.parse(code);
      return JSON.stringify(parsed);
    } catch {
      return code;
    }
  }, [code, isFormatted]);

  return (
    <div
      className={cn(
        "relative mt-1 max-w-full overflow-auto rounded bg-background p-2",
        maxHeightClassName
      )}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background hover:text-foreground"
          onClick={handleToggleFormat}
          aria-label={isFormatted ? "压缩为单行" : "格式化"}
          title={isFormatted ? "压缩为单行" : "格式化"}
        >
          {isFormatted ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronUp className="size-3" />
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background hover:text-foreground"
          onClick={handleCopy}
          aria-label="复制"
          title="复制"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
      </div>

      <SyntaxHighlighter
        language="json"
        style={codeStyle}
        codeTagProps={CODE_TAG_PROPS}
        customStyle={CODE_CUSTOM_STYLE}
        showLineNumbers={isFormatted}
        lineNumberStyle={LINE_NUMBER_STYLE}
        wrapLines={isFormatted}
        lineProps={() => ({
          style: { backgroundColor: "hsl(var(--background))" } as CSSProperties,
        })}
        wrapLongLines={isFormatted}
      >
        {displayCode}
      </SyntaxHighlighter>
    </div>
  );
}

/**
 * 工具调用消息组件（MVP）
 * - 默认折叠
 * - 展开后显示：输入参数 + 返回结果（output）
 */
export default function MessageTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
}) {
  // 优先渲染“可重放”的工具组件（用于历史消息/刷新后再次执行 UI 行为）。
  if (getToolId(part) === openUrlToolDef.id) {
    return (
      <div className={cn("flex w-full min-w-0 max-w-full justify-start", className)}>
        <OpenUrlTool part={part} />
      </div>
    );
  }

  const { resolvedTheme } = useTheme();
  const codeStyle = (resolvedTheme === "dark" ? oneDark : oneLight) as any;
  const toolName = getToolName(part);
  const inputText = safeStringify(part.input);
  const outputText = safeStringify(part.output);
  const showInput = !isEmptyInput(part.input);
  const outputDisplayText =
    outputText ||
    (part.state && part.state !== "output-available"
      ? `（${part.state}）`
      : part.errorText
        ? `（错误：${part.errorText}）`
        : "（暂无返回结果）");

  return (
    <div className={cn("flex w-full min-w-0 max-w-full justify-start", className)}>
      <details className="w-full min-w-0 max-w-full rounded-lg bg-muted/40 px-3 py-2 text-foreground">
        {/* summary 默认折叠展示：工具名称（MVP） */}
        <summary className="cursor-pointer select-none text-xs text-muted-foreground">
          工具：{toolName}
        </summary>

        {/* 展开后显示输入/输出 */}
        <div className="mt-2">
          {showInput ? (
            <>
              <div className="text-[11px] text-muted-foreground">输入参数</div>
              <CodeBlockWithCopy
                code={inputText}
                codeStyle={codeStyle}
                maxHeightClassName="max-h-40"
              />
            </>
          ) : null}

          <div
            className={cn(
              "text-[11px] text-muted-foreground",
              showInput ? "mt-2" : undefined
            )}
          >
            输出结果
          </div>
          <CodeBlockWithCopy
            code={outputDisplayText}
            codeStyle={codeStyle}
            maxHeightClassName="max-h-64"
          />
        </div>
      </details>
    </div>
  );
}
