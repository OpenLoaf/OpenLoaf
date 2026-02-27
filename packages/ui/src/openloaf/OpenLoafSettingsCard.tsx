/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OpenLoafSettingsCardProps = {
  children: ReactNode;
  divided?: boolean;
  padding?: "none" | "x" | "xy";
  className?: string;
  contentClassName?: string;
};

/** Settings card container for grouped content. */
export function OpenLoafSettingsCard({
  children,
  divided = false,
  padding = "x",
  className,
  contentClassName,
}: OpenLoafSettingsCardProps) {
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
