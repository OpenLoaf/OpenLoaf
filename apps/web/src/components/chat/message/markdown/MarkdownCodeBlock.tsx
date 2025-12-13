"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
          "my-2 flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 px-2 py-1",
          className
        )}
      >
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {normalizedLanguage}
        </span>

        <div className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-5">
          <code className="whitespace-pre">{code}</code>
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
    <div className={cn("my-3 overflow-hidden rounded-md border", className)}>
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
          <span className="truncate font-mono">
            {normalizedLanguage}
            {lineCount ? ` · ${lineCount} lines` : ""}
          </span>
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

      {collapsed ? null : (
        <div className="bg-muted/30 font-mono">
          <SyntaxHighlighter
            style={oneDark as any}
            language={normalizedLanguage}
            PreTag="div"
            showLineNumbers
            wrapLongLines
            customStyle={{
              margin: 0,
              background: "transparent",
              padding: "0.75rem",
              fontSize: "12px",
              lineHeight: "1.5",
              fontFamily: "inherit",
              textShadow: "none",
            }}
            lineNumberStyle={{
              minWidth: "2.25em",
              paddingRight: "1em",
              opacity: 0.6,
            }}
            codeTagProps={{
              style: { fontFamily: "inherit", textShadow: "none" },
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
}
