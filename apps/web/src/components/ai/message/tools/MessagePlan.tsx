"use client";

import * as React from "react";
import type { PlanItem, PlanPatchItem } from "@tenas-ai/api/types/tools/runtime";
import { useChatTools } from "../../context";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import PlanStepList from "./shared/PlanStepList";

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
  const { toolParts } = useChatTools();
  const planToolParts = React.useMemo(() => {
    const items = findPlanToolParts(parts) ?? [];
    return items.map((part) => {
      const toolCallId = typeof part?.toolCallId === "string" ? part.toolCallId : "";
      if (!toolCallId || !toolParts?.[toolCallId]) return part;
      return { ...part, ...toolParts[toolCallId] };
    });
  }, [parts, toolParts]);
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
  return (
    <Plan defaultOpen className="w-full" isStreaming={plan.some((item) => item.status === "in_progress")}>
      <PlanHeader>
        <div>
          <PlanTitle>计划</PlanTitle>
          <PlanDescription>
            {explanation || "执行计划"}
          </PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent>
        <PlanStepList plan={plan} />
      </PlanContent>
    </Plan>
  );
}
