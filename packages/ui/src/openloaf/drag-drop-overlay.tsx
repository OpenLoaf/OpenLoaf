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

type DragDropOverlayProps = {
  open: boolean;
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  radiusClassName?: string;
  variant?: "default" | "warning";
};

/** Drag-and-drop overlay with unified style. */
export function DragDropOverlay({
  open,
  title,
  icon,
  description,
  radiusClassName = "rounded-[inherit]",
  variant = "default",
}: DragDropOverlayProps) {
  if (!open) return null;
  const isWarning = variant === "warning";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-50 flex items-center justify-center overflow-hidden border-2 border-dashed backdrop-blur-sm ${radiusClassName} ${
        isWarning
          ? "border-destructive/60 bg-destructive/5"
          : "border-foreground/25 bg-secondary/50"
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        {icon ? (
          <div className={isWarning ? "text-destructive" : "text-foreground"}>
            {icon}
          </div>
        ) : null}
        <p
          className={`text-sm font-medium ${
            isWarning ? "text-destructive" : "text-foreground"
          }`}
        >
          {title}
        </p>
        {description ? (
          <p
            className={`text-xs ${
              isWarning ? "text-destructive/80" : "text-muted-foreground"
            }`}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
