"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

const SYNTAX_HIGHLIGHTER_CUSTOM_STYLE: React.CSSProperties = {
  margin: 0,
  background: "transparent",
  padding: "0.75rem",
  fontSize: "13px",
  lineHeight: "1.6",
  fontFamily: "inherit",
  textShadow: "none",
  overflow: "visible",
  width: "100%",
};

const SYNTAX_HIGHLIGHTER_LINE_NUMBER_STYLE: React.CSSProperties = {
  minWidth: "2.25em",
  paddingRight: "1em",
  opacity: 0.6,
};

const SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS = {
  style: { fontFamily: "inherit", textShadow: "none" } as React.CSSProperties,
};

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
      wrapLongLines
      customStyle={SYNTAX_HIGHLIGHTER_CUSTOM_STYLE}
      lineNumberStyle={SYNTAX_HIGHLIGHTER_LINE_NUMBER_STYLE}
      codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
    >
      {code}
    </SyntaxHighlighter>
  );
});

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
  const [collapsed, setCollapsed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const lineCount = React.useMemo(
    () => (code ? code.split("\n").length : 0),
    [code]
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

  if (isSingleLine) {
    return (
      <div
        className={cn(
          "my-2 mr-4 flex min-w-0 items-center gap-2 rounded-md border px-2 py-1",
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
          <SyntaxHighlighter
            style={oneDark as any}
            language={normalizedLanguage}
            PreTag="div"
            showLineNumbers={false}
            wrapLongLines
            customStyle={{
              ...SYNTAX_HIGHLIGHTER_CUSTOM_STYLE,
              padding: 0,
              margin: 0,
              minWidth: 0,
              overflow: "visible",
              backgroundColor: "transparent",
            }}
            codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
          >
            {code}
          </SyntaxHighlighter>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label="复制代码"
          title="复制"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn("my-3 mr-4 overflow-hidden rounded-md border", className)}
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

      <ScrollArea
        className={cn("bg-muted/30 font-mono", collapsed && "hidden")}
        viewportClassName="max-h-[450px]"
        aria-hidden={collapsed}
      >
        <MemoSyntaxHighlighter code={code} language={normalizedLanguage} />
      </ScrollArea>
    </div>
  );
}
