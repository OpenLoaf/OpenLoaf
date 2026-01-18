"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  /** Tool title shown in header. */
  title: string;
  /** Tool status text shown beside title. */
  status?: string;
  /** Action elements rendered on the right side. */
  actions?: React.ReactNode;
  /** Whether the card is open by default. */
  defaultOpen?: boolean;
  /** Extra class names for the outer wrapper. */
  className?: string;
  /** Extra class names for the details container. */
  detailsClassName?: string;
  /** Inline styles for the details container. */
  detailsStyle?: React.CSSProperties;
  /** Tool card content. */
  children?: React.ReactNode;
}

/** Render a collapsible tool card shell. */
export default function ToolCard({
  title,
  status,
  actions,
  defaultOpen = false,
  className,
  detailsClassName,
  detailsStyle,
  children,
}: ToolCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultOpen);

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <details
        className={cn(
          "w-full min-w-0 max-w-[80%] rounded-lg bg-muted/40 px-3 py-2 text-foreground",
          detailsClassName,
        )}
        style={detailsStyle}
        open={isExpanded}
        onToggle={(event) => setIsExpanded(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  isExpanded ? "rotate-0" : "-rotate-90",
                )}
              />
            </span>
            <span className="shrink-0">工具：</span>
            <span className="text-foreground/80">{title}</span>
            {status ? (
              <span className="ml-2 text-[11px] text-muted-foreground/80">{status}</span>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </summary>
        <div className="mt-2 space-y-2">{children}</div>
      </details>
    </div>
  );
}
