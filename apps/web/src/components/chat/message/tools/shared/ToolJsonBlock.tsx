"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Button } from "@tenas-ai/ui/button";
import { cn } from "@/lib/utils";
import type { ToolJsonDisplay, ToolVariant } from "./tool-utils";

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

interface ToolJsonBlockProps {
  /** Section label. */
  label: string;
  /** JSON display payload. */
  json: ToolJsonDisplay;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
  /** Whether the JSON is expanded by default. */
  defaultExpanded?: boolean;
  /** Class name used when collapsed. */
  collapsedClassName?: string;
  /** Class name used when expanded. */
  expandedClassName?: string;
}

/** Render a JSON code block with expand/collapse. */
export default function ToolJsonBlock({
  label,
  json,
  variant = "default",
  defaultExpanded = false,
  collapsedClassName,
  expandedClassName,
}: ToolJsonBlockProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const sizeClassName =
    variant === "nested"
      ? "max-h-none"
      : isExpanded
        ? expandedClassName ?? "max-h-96"
        : collapsedClassName ?? "max-h-28";

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div>{label}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6 shrink-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
          onClick={() => setIsExpanded((value) => !value)}
          aria-label={isExpanded ? "收起 JSON" : "展开 JSON"}
          title={isExpanded ? "收起（紧凑）" : "展开（格式化）"}
        >
          <ChevronDown
            className={cn("size-3 transition-transform", isExpanded ? "rotate-180" : "rotate-0")}
          />
        </Button>
      </div>
      <div className={cn("mt-1 bg-background", variant === "nested" ? "overflow-visible" : "overflow-auto", sizeClassName)}>
        <SyntaxHighlighter
          style={oneDark as any}
          language="json"
          PreTag="div"
          showLineNumbers={false}
          customStyle={JSON_SYNTAX_HIGHLIGHTER_STYLE}
          codeTagProps={JSON_SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
        >
          {isExpanded ? json.expandedText : json.collapsedText}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
