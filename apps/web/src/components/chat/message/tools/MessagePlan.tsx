"use client";

import * as React from "react";
import type { UpdatePlanArgs } from "@tenas-ai/api/types/tools/runtime";
import { cn } from "@/lib/utils";

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

type MessagePlanProps = {
  /** Message metadata payload. */
  metadata?: unknown;
};

/** Normalize plan update payload from message metadata. */
function extractPlanUpdate(metadata: unknown): UpdatePlanArgs | null {
  if (!metadata || typeof metadata !== "object") return null;
  const planUpdate = (metadata as Record<string, unknown>)?.plan;
  if (!planUpdate || typeof planUpdate !== "object") return null;
  const rawPlan = (planUpdate as Record<string, unknown>)?.plan;
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
    typeof (planUpdate as any).explanation === "string"
      ? (planUpdate as any).explanation.trim()
      : undefined;

  // 逻辑：只输出结构化后的 plan，避免 UI 处理异常输入。
  return { explanation: explanation || undefined, plan: normalizedPlan };
}

/**
 * Render plan summary stored in message metadata.
 */
export default function MessagePlan({ metadata }: MessagePlanProps) {
  const planUpdate = React.useMemo(() => extractPlanUpdate(metadata), [metadata]);
  if (!planUpdate) return null;

  const { explanation, plan } = planUpdate;
  const completedCount = plan.filter((item) => item.status === "completed").length;

  return (
    <div className="flex min-w-0 w-full">
      <div className="min-w-0 w-full rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>计划</span>
          <span>
            {completedCount}/{plan.length}
          </span>
        </div>
        {explanation ? (
          <div className="mt-1 text-xs text-muted-foreground/90">{explanation}</div>
        ) : null}
        <div className="mt-2 space-y-1">
          {plan.map((item, index) => {
            const meta = PLAN_STATUS_META[item.status];
            return (
              <div key={`${item.status}-${index}`} className="flex items-start gap-2">
                <span className={cn("font-mono text-xs", meta.markerClassName)}>
                  {meta.marker}
                </span>
                <div className="min-w-0">
                  <div className={cn("text-sm leading-snug", meta.textClassName)}>
                    {item.step}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{meta.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
