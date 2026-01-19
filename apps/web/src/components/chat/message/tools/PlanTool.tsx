"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { UpdatePlanArgs } from "@tenas-ai/api/types/tools/runtime";
import {
  getToolStatusText,
  getToolStatusTone,
  normalizeToolInput,
} from "./shared/tool-utils";
import type { AnyToolPart } from "./shared/tool-utils";

type PlanStatusMeta = {
  /** Plan status key. */
  key: "pending" | "in_progress" | "completed";
  /** Status label for display. */
  label: string;
  /** Status marker string. */
  marker: string;
  /** Extra class for the marker. */
  markerClassName: string;
  /** Extra class for the text. */
  textClassName: string;
};

/** Plan status UI metadata map. */
const PLAN_STATUS_META: Record<PlanStatusMeta["key"], PlanStatusMeta> = {
  pending: {
    key: "pending",
    label: "待办",
    marker: "[ ]",
    markerClassName: "text-muted-foreground",
    textClassName: "text-foreground/80",
  },
  in_progress: {
    key: "in_progress",
    label: "进行中",
    marker: "[~]",
    markerClassName: "text-primary",
    textClassName: "text-foreground",
  },
  completed: {
    key: "completed",
    label: "已完成",
    marker: "[x]",
    markerClassName: "text-emerald-600",
    textClassName: "text-muted-foreground line-through",
  },
};

/** Normalize tool input into a plan update payload. */
function extractPlanInput(input: unknown): UpdatePlanArgs | null {
  if (!input || typeof input !== "object") return null;
  const rawPlan = (input as Record<string, unknown>)?.plan;
  if (!Array.isArray(rawPlan)) return null;

  const normalizedPlan = rawPlan
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const step = typeof (item as any).step === "string" ? (item as any).step.trim() : "";
      const status = (item as any).status;
      if (!step) return null;
      if (status !== "pending" && status !== "in_progress" && status !== "completed") return null;
      return { step, status } as UpdatePlanArgs["plan"][number];
    })
    .filter(Boolean) as UpdatePlanArgs["plan"];

  if (normalizedPlan.length === 0) return null;
  const explanation =
    typeof (input as any).explanation === "string" ? (input as any).explanation.trim() : "";

  // 逻辑：只渲染结构化后的输入，避免无效输入污染展示。
  return { explanation: explanation || undefined, plan: normalizedPlan };
}

/** Render update-plan tool message. */
export default function PlanTool({ part, className }: { part: AnyToolPart; className?: string }) {
  const normalizedInput = normalizeToolInput(part.input);
  const planUpdate = extractPlanInput(normalizedInput);
  const statusText = getToolStatusText(part);
  const statusTone = getToolStatusTone(part);
  const hasError =
    typeof part.errorText === "string" && part.errorText.trim().length > 0;

  const completedCount = planUpdate
    ? planUpdate.plan.filter((item) => item.status === "completed").length
    : 0;

  const containerClassName = hasError
    ? "border border-destructive/50 bg-destructive/5"
    : "border border-border/60 bg-muted/30";
  const statusClassName =
    statusTone === "success"
      ? "text-emerald-600"
      : statusTone === "warning"
        ? "text-amber-600"
        : statusTone === "error"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <div
        className={cn(
          "w-full min-w-0 max-w-[80%] rounded-lg px-3 py-2 text-xs text-foreground",
          containerClassName,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs font-medium text-foreground">
            计划更新
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {planUpdate ? (
              <span>
                {completedCount}/{planUpdate.plan.length}
              </span>
            ) : null}
            <span className={cn(statusClassName)}>{statusText}</span>
          </div>
        </div>

        {planUpdate?.explanation ? (
          <div className="mt-1 text-[11px] text-muted-foreground/90">
            {planUpdate.explanation}
          </div>
        ) : null}

        {planUpdate ? (
          <div className="mt-2 max-h-64 space-y-1 overflow-auto show-scrollbar">
            {planUpdate.plan.map((item, index) => {
              const meta = PLAN_STATUS_META[item.status];
              return (
                <div key={`${item.status}-${index}`} className="flex items-start gap-2">
                  <span className={cn("font-mono text-xs", meta.markerClassName)}>
                    {meta.marker}
                  </span>
                  <div className="min-w-0">
                    <div className={cn("text-xs leading-snug", meta.textClassName)}>
                      {item.step}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{meta.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">计划输入无效</div>
        )}

        {hasError ? (
          <div className="mt-2 text-xs text-destructive">{part.errorText}</div>
        ) : null}
      </div>
    </div>
  );
}
