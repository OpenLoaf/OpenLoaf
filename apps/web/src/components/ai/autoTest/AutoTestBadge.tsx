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

import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutoTestVerdict } from "@openloaf/api";

interface AutoTestBadgeProps {
  /** Badge size variant. */
  size?: "xs" | "sm";
  /** Whether to show the full text label. */
  showLabel?: boolean;
  /** Extra tailwind classes. */
  className?: string;
}

/** ai-browser-test 自动测试会话标识小徽章。 */
export function AutoTestBadge({ size = "xs", showLabel = false, className }: AutoTestBadgeProps) {
  const sizeClass =
    size === "sm" ? "h-5 px-2 text-[11px] gap-1" : "h-4 px-1.5 text-[10px] gap-0.5";
  return (
    <span
      aria-label="自动测试"
      title="ai-browser-test 自动测试"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium transition-colors duration-150",
        // 蓝色扁平底 + light/dark 双色
        "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
        sizeClass,
        className,
      )}
    >
      <Bot className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {showLabel ? <span>自动测试</span> : null}
    </span>
  );
}

interface AutoTestScorePillProps {
  /** 0-100 evaluation score. */
  score: number;
  /** Aggregate verdict controls color. */
  verdict?: AutoTestVerdict;
  className?: string;
}

/** 评分胶囊：按 verdict 着色。 */
export function AutoTestScorePill({ score, verdict, className }: AutoTestScorePillProps) {
  const color =
    verdict === "PASS"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : verdict === "FAIL"
        ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium tabular-nums transition-colors duration-150",
        color,
        className,
      )}
    >
      <span>评分</span>
      <span>{Math.round(score)}</span>
    </span>
  );
}

/** Map verdict to localized Chinese text. */
export function verdictLabel(verdict: AutoTestVerdict): string {
  if (verdict === "PASS") return "通过";
  if (verdict === "FAIL") return "未通过";
  return "部分通过";
}

/** Tailwind classes for verdict chip backgrounds. */
export function verdictChipClass(verdict: AutoTestVerdict): string {
  if (verdict === "PASS") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  }
  if (verdict === "FAIL") {
    return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
}
