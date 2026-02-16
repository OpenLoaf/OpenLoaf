"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { cn } from "@/lib/utils";
import { Button } from "@tenas-ai/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import {
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
} from "@tenas-ai/api/common";
import { createTerminalTabId } from "@/hooks/tab-id";
import { Check, Copy, ChevronDown, ChevronRight, Play } from "lucide-react";
import { toast } from "sonner";

const SYNTAX_HIGHLIGHTER_CUSTOM_STYLE: React.CSSProperties = {
  margin: 0,
  background: "transparent",
  padding: "0.75rem",
  fontSize: "13px",
  lineHeight: "1.6",
  fontFamily: "inherit",
  textShadow: "none",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
  whiteSpace: "pre",
  wordBreak: "normal",
  overflowWrap: "normal",
};

const SYNTAX_HIGHLIGHTER_LINE_NUMBER_STYLE: React.CSSProperties = {
  minWidth: "2.25em",
  paddingRight: "1em",
  opacity: 0.6,
};

const SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS = {
  style: { fontFamily: "inherit", textShadow: "none" } as React.CSSProperties,
};

const SINGLE_LINE_CUSTOM_STYLE: React.CSSProperties = {
  ...SYNTAX_HIGHLIGHTER_CUSTOM_STYLE,
  padding: 0,
  margin: 0,
  minWidth: 0,
  width: "auto",
  maxWidth: "100%",
  overflowY: "hidden",
  backgroundColor: "transparent",
};

const MemoSingleLineSyntaxHighlighter = React.memo(function MemoSingleLineSyntaxHighlighter({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  return (
    <SyntaxHighlighter
      style={oneDark as any}
      language={language}
      PreTag="div"
      showLineNumbers={false}
      customStyle={SINGLE_LINE_CUSTOM_STYLE}
      codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
    >
      {code}
    </SyntaxHighlighter>
  );
});

const MemoSyntaxHighlighter = React.memo(function MemoSyntaxHighlighter({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  return (
    <SyntaxHighlighter
      style={oneDark as any}
      language={language}
      PreTag="div"
      showLineNumbers
      customStyle={SYNTAX_HIGHLIGHTER_CUSTOM_STYLE}
      lineNumberStyle={SYNTAX_HIGHLIGHTER_LINE_NUMBER_STYLE}
      codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
    >
      {code}
    </SyntaxHighlighter>
  );
});

type ShellTokenType = "space" | "command" | "option" | "variable" | "string" | "plain";

type ShellToken = {
  text: string;
  type: ShellTokenType;
};

/** Tokenize a single-line shell command for lightweight colorization. */
function tokenizeShellCommand(input: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  const length = input.length;
  let index = 0;

  while (index < length) {
    const current = input[index] ?? "";
    if (/\s/.test(current)) {
      let end = index + 1;
      while (end < length && /\s/.test(input[end] ?? "")) {
        end += 1;
      }
      tokens.push({ text: input.slice(index, end), type: "space" });
      index = end;
      continue;
    }

    if (current === '"' || current === "'") {
      const quote = current;
      let end = index + 1;
      while (end < length) {
        const char = input[end] ?? "";
        if (char === "\\") {
          end += 2;
          continue;
        }
        if (char === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      tokens.push({ text: input.slice(index, end), type: "string" });
      index = end;
      continue;
    }

    if (current === "$") {
      let end = index + 1;
      if ((input[end] ?? "") === "{") {
        end += 1;
        while (end < length && (input[end] ?? "") !== "}") {
          end += 1;
        }
        if ((input[end] ?? "") === "}") {
          end += 1;
        }
      } else {
        while (end < length && /[a-zA-Z0-9_]/.test(input[end] ?? "")) {
          end += 1;
        }
      }
      tokens.push({ text: input.slice(index, end), type: "variable" });
      index = end;
      continue;
    }

    let end = index + 1;
    while (end < length && !/\s/.test(input[end] ?? "")) {
      end += 1;
    }
    const text = input.slice(index, end);
    const hasCommand = tokens.some((token) => token.type === "command");
    const type: ShellTokenType = !hasCommand
      ? "command"
      : text.startsWith("-")
        ? "option"
        : "plain";
    tokens.push({ text, type });
    index = end;
  }

  return tokens;
}

export default function MarkdownCodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const normalizedLanguage = (language || "text").toLowerCase();
  const isBash = normalizedLanguage === "bash";
  const terminalStatus = useTerminalStatus();
  const { workspace } = useWorkspace();
  const activeTabId = useTabs((state) => state.activeTabId);
  const tabs = useTabs((state) => state.tabs);
  const [collapsed, setCollapsed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const lineCount = React.useMemo(
    () => (code ? code.split("\n").length : 0),
    [code]
  );
  const shellTokens = React.useMemo(
    () => (isBash && lineCount <= 1 ? tokenizeShellCommand(code) : []),
    [code, isBash, lineCount]
  );
  const isSingleLine = lineCount <= 1;
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

  /** Open terminal stack and run the bash snippet directly. */
  const handleRun = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const snippet = code.trim();
      if (!snippet) {
        toast.error("没有可运行的命令");
        return;
      }
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      if (terminalStatus.isLoading) {
        toast.message("正在获取终端状态");
        return;
      }
      if (!terminalStatus.enabled) {
        toast.error("终端功能未开启");
        return;
      }
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      const runtime = activeTab ? useTabRuntime.getState().runtimeByTabId[activeTab.id] : null;
      const baseParams = (runtime?.base?.params ?? {}) as Record<string, unknown>;
      const rootUri =
        (typeof baseParams.rootUri === "string" ? baseParams.rootUri : undefined) ??
        workspace?.rootUri ??
        "";
      const pwdUri = rootUri ? resolveFileUriFromRoot(rootUri, rootUri) : "";
      if (!pwdUri) {
        toast.error("未找到工作区目录");
        return;
      }
      // 逻辑：每次运行创建一个新的终端子标签，避免覆盖已有会话上下文。
      useTabRuntime.getState().pushStackItem(activeTabId, {
        id: TERMINAL_WINDOW_PANEL_ID,
        sourceKey: TERMINAL_WINDOW_PANEL_ID,
        component: TERMINAL_WINDOW_COMPONENT,
        title: "Terminal",
        params: {
          __customHeader: true,
          __open: {
            pwdUri,
            tabId: createTerminalTabId(),
            params: {
              autoRunCommand: snippet,
              autoRunNonce: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
            },
          },
        },
      });
    },
    [activeTabId, code, tabs, terminalStatus.enabled, terminalStatus.isLoading, workspace?.rootUri]
  );

  if (isSingleLine) {
    return (
      <div
        className={cn(
          "not-prose my-3 flex w-full min-w-0 max-w-full items-center gap-2 rounded-md border px-2 py-1",
          normalizedLanguage === "text" || normalizedLanguage === "bash"
            ? "bg-muted/10"
            : "bg-muted/30",
          className
        )}
      >
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]",
            normalizedLanguage === "text"
              ? "bg-muted/50 text-muted-foreground"
              : normalizedLanguage === "bash"
                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                : "bg-muted text-muted-foreground"
          )}
        >
          {normalizedLanguage}
        </span>

        <div className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-5">
          {isBash ? (
            <code className="block whitespace-pre font-mono text-[11px] leading-5 text-foreground">
              {shellTokens.map((token, tokenIndex) => {
                const tokenClassName =
                  token.type === "command"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : token.type === "option"
                      ? "text-sky-700 dark:text-sky-400"
                      : token.type === "variable"
                        ? "text-violet-700 dark:text-violet-400"
                        : token.type === "string"
                          ? "text-amber-700 dark:text-amber-400"
                          : "";
                return (
                  <span key={`${tokenIndex}:${token.type}`} className={tokenClassName}>
                    {token.text}
                  </span>
                );
              })}
            </code>
          ) : (
            <MemoSingleLineSyntaxHighlighter code={code} language={normalizedLanguage} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isBash ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
              onClick={handleRun}
              aria-label="运行代码"
              title="运行"
            >
              <Play className="size-3" />
              运行
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            aria-label="复制代码"
            title="复制"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "not-prose my-3 w-full min-w-0 max-w-full overflow-hidden rounded-md border",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 bg-muted/70 px-2 py-1">
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "展开代码块" : "折叠代码块"}
          title={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
          <span className="truncate font-mono">{normalizedLanguage}</span>
        </button>

        <div className="flex items-center gap-1">
          {isBash ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
              onClick={handleRun}
              aria-label="运行代码"
              title="运行"
            >
              <Play className="size-3" />
              运行
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            aria-label="复制代码"
            title="复制"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "max-h-[450px] overflow-auto show-scrollbar bg-muted/30 font-mono",
          collapsed && "hidden"
        )}
        aria-hidden={collapsed}
      >
        <MemoSyntaxHighlighter code={code} language={normalizedLanguage} />
      </div>
    </div>
  );
}
