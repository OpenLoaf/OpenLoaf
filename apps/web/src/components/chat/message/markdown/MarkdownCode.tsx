"use client";

import { cn } from "@/lib/utils";

export default function MarkdownCode({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: unknown;
} & Record<string, unknown>) {
  return (
    <code
      className={cn(
        "inline-flex max-w-full items-baseline overflow-x-auto whitespace-nowrap align-baseline rounded-sm bg-muted px-1 py-[1px] font-mono text-[0.9em] leading-none text-foreground",
        className
      )}
      {...(props as any)}
    >
      {children as any}
    </code>
  );
}
