"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export default React.memo(function MarkdownCodeInline({
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
        "rounded-sm bg-muted px-2 py-1  font-mono text-[0.9em] font-normal text-foreground wrap-break-word",
        className
      )}
      {...(props as any)}
    >
      {children as any}
    </code>
  );
});
