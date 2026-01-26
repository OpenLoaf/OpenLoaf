"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TenasSettingsCardProps = {
  children: ReactNode;
  divided?: boolean;
  padding?: "none" | "x" | "xy";
  className?: string;
  contentClassName?: string;
};

/** Settings card container for grouped content. */
export function TenasSettingsCard({
  children,
  divided = false,
  padding = "x",
  className,
  contentClassName,
}: TenasSettingsCardProps) {
  const paddingClass =
    padding === "xy" ? "p-3" : padding === "x" ? "px-3" : "";

  return (
    <div className={cn("rounded-lg border border-border/60 bg-secondary/30", className)}>
      <div
        className={cn(
          paddingClass,
          divided && "divide-y divide-border",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
