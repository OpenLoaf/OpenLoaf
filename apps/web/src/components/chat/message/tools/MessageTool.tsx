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
import {
  Braces,
  Brackets,
  Check,
  ChevronRight,
  Copy,
  LoaderCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

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

/**
 * 从工具 output 中提取 `ok` 字段（用于标题栏状态图标）。
 * - 约定：`{ ok: true }` 表示成功；`{ ok: false }` 表示失败；未定义表示仍在等待/加载。
 */
function extractOkFlag(output: unknown): boolean | undefined {
  if (output == null) return undefined;

  if (typeof output === "object") {
    const ok = (output as any)?.ok;
    return typeof ok === "boolean" ? ok : undefined;
  }

  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output);
      const ok = (parsed as any)?.ok;
      return typeof ok === "boolean" ? ok : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
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
  isFormatted,
}: {
  code: string;
  codeStyle: any;
  maxHeightClassName: string;
  isFormatted: boolean;
}) {
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
        "mt-1 max-w-full overflow-auto rounded bg-background p-2",
        maxHeightClassName
      )}
    >
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
  const { resolvedTheme } = useTheme();
  const codeStyle = (resolvedTheme === "dark" ? oneDark : oneLight) as any;
  const toolName = getToolName(part);
  const inputText = safeStringify(part.input);
  const outputText = safeStringify(part.output);
  const showInput = !isEmptyInput(part.input);
  const hasErrorText = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const [headerCopied, setHeaderCopied] = React.useState(false);
  // 默认“压缩为单行”，避免工具消息占用太多高度
  const [isInputFormatted, setIsInputFormatted] = React.useState(false);
  const [isOutputFormatted, setIsOutputFormatted] = React.useState(false);
  const okFlag = extractOkFlag(part.output);
  const outputDisplayText =
    outputText ||
    (part.errorText
      ? `（错误：${part.errorText}）`
      : part.state && part.state !== "output-available"
        ? `（${part.state}）`
        : "（暂无返回结果）");

  // 复制：标题栏内容 + input + output，一次性方便粘贴排查
  const handleCopyAll = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const titleText = `工具：${toolName}`;
    const copyText = [
      titleText,
      `输入参数\n${showInput ? inputText : "（无）"}`,
      `输出结果\n${outputDisplayText}`,
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(copyText);
      setHeaderCopied(true);
      toast.success("已复制");
      window.setTimeout(() => setHeaderCopied(false), 1200);
    } catch (error) {
      toast.error("复制失败");
      console.error(error);
    }
  };

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <CollapsiblePrimitive.Root className="w-full min-w-0 max-w-[80%] rounded-lg bg-muted/40 px-3 py-2 text-foreground">
        <div className="group/message-tool-header flex items-center justify-between gap-2">
          {/* 默认折叠展示：工具名称（MVP） */}
          <CollapsiblePrimitive.Trigger asChild>
            <button
              type="button"
              className="group/message-tool-trigger min-w-0 flex flex-1 items-center gap-1 cursor-pointer select-none text-left text-xs text-muted-foreground"
            >
              <ChevronRight className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/message-tool-trigger:rotate-90" />
              <span className="shrink-0">工具：</span>
              <span
                className="cursor-text select-text"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {toolName}
              </span>
              {okFlag === true ? (
                <Check className="ml-1 h-3 w-3 shrink-0 text-emerald-500" />
              ) : okFlag === false || part.errorText ? (
                <X className="ml-1 h-3 w-3 shrink-0 text-destructive" />
              ) : (
                <LoaderCircle className="ml-1 h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
              )}
            </button>
          </CollapsiblePrimitive.Trigger>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 shrink-0 bg-transparent text-muted-foreground shadow-none opacity-0 transition-opacity duration-150 group-hover/message-tool-header:opacity-100 group-focus-within/message-tool-header:opacity-100 hover:bg-transparent hover:text-foreground"
            onClick={handleCopyAll}
            aria-label="复制工具信息"
            title="复制：标题 + 输入 + 输出"
          >
            {headerCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        </div>

        {/* 展开/收起动画：由 Radix data-state + tw-animate-css 驱动 */}
        <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="mt-2">
            {showInput ? (
              <CollapsiblePrimitive.Root defaultOpen>
                <div className="flex items-center gap-1">
                  <CollapsiblePrimitive.Trigger asChild>
                    <button
                      type="button"
                      className="min-w-0 flex-1 select-none text-left text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      输入参数
                    </button>
                  </CollapsiblePrimitive.Trigger>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={isInputFormatted ? "压缩为单行" : "格式化"}
                    title={isInputFormatted ? "压缩为单行" : "格式化"}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsInputFormatted((v) => !v);
                    }}
                  >
                    {isInputFormatted ? (
                      <Braces className="h-3 w-3" />
                    ) : (
                      <Brackets className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                  <CodeBlockWithCopy
                    code={inputText}
                    codeStyle={codeStyle}
                    maxHeightClassName="max-h-40"
                    isFormatted={isInputFormatted}
                  />
                </CollapsiblePrimitive.Content>
              </CollapsiblePrimitive.Root>
            ) : null}

            <div className={showInput ? "mt-2" : undefined}>
              {/* 关键：tool-output-error 时，输出结果就是 errorText，因此隐藏“输出结果”，单独展示错误信息块 */}
              {!hasErrorText ? (
                <CollapsiblePrimitive.Root defaultOpen>
                  <div className="flex items-center gap-1">
                    <CollapsiblePrimitive.Trigger asChild>
                      <button
                        type="button"
                        className="min-w-0 flex-1 select-none text-left text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        输出结果
                      </button>
                    </CollapsiblePrimitive.Trigger>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={isOutputFormatted ? "压缩为单行" : "格式化"}
                      title={isOutputFormatted ? "压缩为单行" : "格式化"}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsOutputFormatted((v) => !v);
                      }}
                    >
                      {isOutputFormatted ? (
                        <Braces className="h-3 w-3" />
                      ) : (
                        <Brackets className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <CodeBlockWithCopy
                      code={outputDisplayText}
                      codeStyle={codeStyle}
                      maxHeightClassName="max-h-64"
                      isFormatted={isOutputFormatted}
                    />
                  </CollapsiblePrimitive.Content>
                </CollapsiblePrimitive.Root>
              ) : null}

              {hasErrorText ? (
                <CollapsiblePrimitive.Root defaultOpen>
                  <div className="flex items-center gap-1">
                    <CollapsiblePrimitive.Trigger asChild>
                      <button
                        type="button"
                        className="min-w-0 flex-1 select-none text-left text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        错误信息
                      </button>
                    </CollapsiblePrimitive.Trigger>
                  </div>
                  <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className={cn("mt-1 max-w-full overflow-auto bg-background p-2", "max-h-64")}>
                      <div className="whitespace-pre-wrap break-words text-xs text-destructive/80">
                        {part.errorText}
                      </div>
                    </div>
                  </CollapsiblePrimitive.Content>
                </CollapsiblePrimitive.Root>
              ) : null}
            </div>
          </div>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    </div>
  );
}
