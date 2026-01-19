"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ToolInfoRow = {
  /** Row label text. */
  label: string;
  /** Row value to display. */
  value?: React.ReactNode;
  /** Render value in mono font. */
  mono?: boolean;
  /** Value tone. */
  tone?: "default" | "muted" | "danger";
};

interface ToolInfoRowsProps {
  /** Rows to display. */
  rows: ToolInfoRow[];
  /** Placeholder for empty value. */
  emptyText?: string;
  /** Extra class names for the container. */
  className?: string;
}

/** Render labeled rows for tool info. */
export default function ToolInfoRows({ rows, emptyText = "—", className }: ToolInfoRowsProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {rows.map((row) => {
        const value = row.value ?? emptyText;
        return (
          <div key={row.label} className="flex flex-col gap-1 sm:flex-row sm:items-start">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground sm:w-28">
              {row.label}
            </div>
            <div
              className={cn(
                "min-w-0 flex-1 text-xs text-foreground break-words",
                row.mono && "font-mono",
                row.tone === "muted" && "text-muted-foreground",
                row.tone === "danger" && "text-destructive",
              )}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
