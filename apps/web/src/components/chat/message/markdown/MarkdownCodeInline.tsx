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
        "rounded-sm bg-muted/50 px-1.5 py-0.5 font-mono text-[0.9em] font-normal text-foreground break-words",
        className
      )}
      {...(props as any)}
    >
      {children as any}
    </code>
  );
}
