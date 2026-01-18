"use client";

import { cn } from "@/lib/utils";
import type { ToolVariant } from "./tool-utils";

interface ToolTextBlockProps {
  /** Section label. */
  label: string;
  /** Text to render. */
  text: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
  /** Whether to render as error text. */
  tone?: "default" | "error";
  /** Max height class for non-nested layout. */
  maxHeightClassName?: string;
}

/** Render a plain text block for tool output. */
export default function ToolTextBlock({
  label,
  text,
  variant = "default",
  tone = "default",
  maxHeightClassName,
}: ToolTextBlockProps) {
  const isNested = variant === "nested";
  const heightClassName = isNested
    ? "max-h-none overflow-visible"
    : maxHeightClassName ?? "max-h-64 overflow-auto";

  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <pre
        className={cn(
          "mt-1 whitespace-pre-wrap break-words bg-background p-2 text-xs",
          tone === "error" && "text-destructive/80",
          heightClassName,
        )}
      >
        {text}
      </pre>
    </div>
  );
}
