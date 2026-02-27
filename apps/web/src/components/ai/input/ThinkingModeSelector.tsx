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

import { Brain, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThinkingMode = "fast" | "deep";

interface ThinkingModeSelectorProps {
  value: ThinkingMode;
  onChange: (value: ThinkingMode) => void;
  disabled?: boolean;
  className?: string;
}

/** Toggle switch for reasoning mode (deep / fast). */
export default function ThinkingModeSelector({
  value,
  onChange,
  disabled,
  className,
}: ThinkingModeSelectorProps) {
  const isDeep = value === "deep";

  const toggle = () => {
    if (disabled) return;
    onChange(isDeep ? "fast" : "deep");
  };

  return (
    <div
      className={cn(
        "relative inline-flex h-8 cursor-pointer items-center rounded-full border border-border/60 bg-muted/60 p-0.5",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onClick={toggle}
      role="switch"
      aria-checked={isDeep}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      {/* 滑动指示块 */}
      <span
        className={cn(
          "absolute top-0.5 h-7 w-7 rounded-full transition-all duration-200",
          isDeep
            ? "left-0.5 bg-violet-500/15 dark:bg-violet-500/20"
            : "left-[calc(100%-1.875rem)] bg-emerald-500/15 dark:bg-emerald-500/20",
        )}
      />
      <span
        className={cn(
          "relative z-10 inline-flex h-7 w-7 items-center justify-center transition-colors",
          isDeep
            ? "text-violet-600 dark:text-violet-300"
            : "text-muted-foreground",
        )}
      >
        <Brain className="h-3.5 w-3.5" />
      </span>
      <span
        className={cn(
          "relative z-10 inline-flex h-7 w-7 items-center justify-center transition-colors",
          !isDeep
            ? "text-emerald-600 dark:text-emerald-300"
            : "text-muted-foreground",
        )}
      >
        <Zap className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}
