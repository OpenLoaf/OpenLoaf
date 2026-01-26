"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "bg-muted text-muted-foreground pointer-events-none inline-flex h-6 select-none items-center justify-center rounded-md px-2 font-mono text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}
