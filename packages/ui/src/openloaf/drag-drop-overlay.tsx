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
  description?: ReactNode;
  radiusClassName?: string;
  variant?: "default" | "warning";
};

/** Drag-and-drop overlay with unified style. */
export function DragDropOverlay({
  open,
  title,
  description,
  radiusClassName = "rounded-[inherit]",
  variant = "default",
}: DragDropOverlayProps) {
  if (!open) return null;
  const isWarning = variant === "warning";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-50 grid place-items-center overflow-hidden ${radiusClassName}`}
    >
      <div
        className={`absolute inset-0 bg-background/35 backdrop-blur-xl ${radiusClassName}`}
      />
      <div
        className={`relative mx-6 w-full max-w-md rounded-2xl border bg-background/70 px-5 py-4 shadow-lg backdrop-blur-xl ${
          isWarning ? "border-destructive/50 bg-destructive/5" : ""
        }`}
      >
        <div
          className={`text-sm font-medium ${
            isWarning ? "text-destructive" : "text-foreground"
          }`}
        >
          {title}
        </div>
        {description ? (
          <div
            className={`mt-1 text-xs ${
              isWarning ? "text-destructive/80" : "text-muted-foreground"
            }`}
          >
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}
