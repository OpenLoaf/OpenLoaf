"use client";

import * as React from "react";
import type { PlanItem, PlanPatchItem } from "@tenas-ai/api/types/tools/runtime";
import { useTabs } from "@/hooks/use-tabs";
import { cn } from "@/lib/utils";
import { useChatContext } from "../../ChatProvider";

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
  /** Message parts payload. */
  parts?: unknown[];
};

type NormalizedPlanUpdate = {
  /** Action name for the plan update. */
  actionName: string;
  /** Optional explanation for the plan. */
  explanation?: string;
  /** Normalized plan list. */
  plan: PlanItem[];
};

function normalizePlanItems(rawPlan: unknown[]): PlanItem[] {
  return rawPlan
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const step = typeof (item as any).step === "string" ? (item as any).step.trim() : "";
      const status = (item as any).status;
      if (!step) return null;
      if (status !== "pending" && status !== "in_progress" && status !== "completed") return null;
      return { step, status } as PlanItem;
    })
    .filter(Boolean) as PlanItem[];
}

function normalizePlanPatchItems(rawPlan: unknown[]): PlanPatchItem[] {
  return rawPlan
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const index = (item as any).index;
      const status = (item as any).status;
      if (!Number.isInteger(index) || index <= 0) return null;
      if (status !== "pending" && status !== "in_progress" && status !== "completed") return null;
      return { index, status } as PlanPatchItem;
    })
    .filter(Boolean) as PlanPatchItem[];
}

/** Apply patch updates to a base plan. */
function applyPlanPatch(basePlan: PlanItem[], patches: PlanPatchItem[]): PlanItem[] {
  const nextPlan = basePlan.map((item) => ({ ...item }));
  for (const patch of patches) {
    const targetIndex = patch.index - 1;
    if (!nextPlan[targetIndex]) continue;
    // 中文注释：仅覆盖状态字段，避免意外篡改 step。
    nextPlan[targetIndex] = { ...nextPlan[targetIndex], status: patch.status };
  }
  return nextPlan;
}

/** Normalize plan update payload from message metadata. */
function extractPlanUpdateFromMetadata(metadata: unknown): NormalizedPlanUpdate | null {
  if (!metadata || typeof metadata !== "object") return null;
  const planUpdate = (metadata as Record<string, unknown>)?.plan;
  if (!planUpdate || typeof planUpdate !== "object") return null;
  const rawPlan = (planUpdate as Record<string, unknown>)?.plan;
  if (!Array.isArray(rawPlan)) return null;
  const normalizedPlan = normalizePlanItems(rawPlan);

  if (normalizedPlan.length === 0) return null;
  const explanation =
    typeof (planUpdate as any).explanation === "string"
      ? (planUpdate as any).explanation.trim()
      : undefined;
  const actionNameRaw =
    typeof (planUpdate as any).actionName === "string"
      ? (planUpdate as any).actionName.trim()
      : "";
  // 逻辑：缺失 actionName 时回退为默认值，保证结构完整。
  const actionName = actionNameRaw || "同步计划";

  // 逻辑：只输出结构化后的 plan，避免 UI 处理异常输入。
  return { actionName, explanation: explanation || undefined, plan: normalizedPlan };
}

/** Normalize update-plan tool input payload. */
function extractPlanUpdateFromToolInput(
  input: unknown,
  basePlan?: PlanItem[] | null,
): NormalizedPlanUpdate | null {
  if (!input || typeof input !== "object") return null;
  const rawPlan = (input as Record<string, unknown>)?.plan;
  if (!Array.isArray(rawPlan)) return null;
  const mode =
    typeof (input as any).mode === "string" ? String((input as any).mode) : "full";
  const explanation =
    typeof (input as any).explanation === "string" ? (input as any).explanation.trim() : undefined;
  const actionNameRaw =
    typeof (input as any).actionName === "string" ? (input as any).actionName.trim() : "";
  // 逻辑：缺失 actionName 时回退为默认值，保证结构完整。
  const actionName = actionNameRaw || "同步计划";

  if (mode === "patch") {
    if (!basePlan || basePlan.length === 0) return null;
    const patches = normalizePlanPatchItems(rawPlan);
    if (patches.length === 0) return null;
    const nextPlan = applyPlanPatch(basePlan, patches);
    return { actionName, explanation: explanation || undefined, plan: nextPlan };
  }

  const normalizedPlan = normalizePlanItems(rawPlan);
  if (normalizedPlan.length === 0) return null;
  // 逻辑：只输出结构化后的 plan，避免 UI 处理异常输入。
  return { actionName, explanation: explanation || undefined, plan: normalizedPlan };
}

/** Find update-plan tool part from message parts. */
function findPlanToolParts(parts?: unknown[]) {
  const collected: any[] = [];
  if (!Array.isArray(parts)) return null;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] as any;
    const toolName = typeof part?.toolName === "string" ? part.toolName : "";
    const type = typeof part?.type === "string" ? part.type : "";
    if (toolName === "update-plan" || type === "tool-update-plan") {
      collected.push(part);
    }
  }
  return collected;
}

/**
 * Render plan summary stored in message metadata.
 */
export default function MessagePlan({ metadata, parts }: MessagePlanProps) {
  const chat = useChatContext();
  const toolPartsByTab = useTabs((state) =>
    chat.tabId ? state.toolPartsByTabId[chat.tabId] : undefined,
  );
  const planToolParts = React.useMemo(() => {
    const items = findPlanToolParts(parts) ?? [];
    return items.map((part) => {
      const toolCallId = typeof part?.toolCallId === "string" ? part.toolCallId : "";
      if (!toolCallId || !toolPartsByTab?.[toolCallId]) return part;
      return { ...part, ...toolPartsByTab[toolCallId] };
    });
  }, [parts, toolPartsByTab]);
  const planUpdate = React.useMemo(() => {
    const metadataPlan = extractPlanUpdateFromMetadata(metadata);
    let currentPlan = metadataPlan?.plan ?? null;
    let actionName = metadataPlan?.actionName ?? "";
    let explanation = metadataPlan?.explanation;

    for (const part of planToolParts) {
      // 中文注释：按消息顺序合并 update-plan，确保 patch 可以覆盖最新状态。
      const nextPlanUpdate = extractPlanUpdateFromToolInput(
        (part as any)?.input,
        currentPlan ?? undefined,
      );
      if (!nextPlanUpdate) continue;
      currentPlan = nextPlanUpdate.plan;
      actionName = nextPlanUpdate.actionName;
      explanation = nextPlanUpdate.explanation;
    }

    if (!currentPlan) return null;
    return {
      actionName: actionName || "同步计划",
      explanation: explanation || undefined,
      plan: currentPlan,
    } as NormalizedPlanUpdate;
  }, [metadata, planToolParts]);
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
