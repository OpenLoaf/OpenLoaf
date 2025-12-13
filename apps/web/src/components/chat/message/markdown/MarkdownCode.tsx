"use client";

import { cn } from "@/lib/utils";
import MarkdownCodeBlock from "./MarkdownCodeBlock";

export default function MarkdownCode({
  className,
  inline,
  children,
  ...props
}: {
  className?: string;
  inline?: boolean;
  children?: unknown;
} & Record<string, unknown>) {
  const match = /language-(\w+)/.exec(className || "");
  const code = String(children ?? "").replace(/\n$/, "");

  if (!inline) {
    return (
      <MarkdownCodeBlock {...props} code={code} language={match?.[1]} />
    );
  }

  return (
    <code
      className={cn(
        "inline-block max-w-full overflow-x-auto whitespace-nowrap [overflow-wrap:normal] rounded bg-muted px-1 py-0.5 font-mono text-[11px] leading-5 text-foreground",
        className
      )}
      {...(props as any)}
    >
      {children as any}
    </code>
  );
}
