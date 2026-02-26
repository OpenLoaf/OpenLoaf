import { tool, zodSchema } from "ai";
import {
  updatePlanToolDef,
  type UpdatePlanArgs,
  type PlanItem,
  type PlanPatchItem,
} from "@openloaf/api/types/tools/runtime";
import { getPlanUpdate, setPlanUpdate } from "@/ai/shared/context/requestContext";

type UpdatePlanToolOutput = {
  /** Whether the tool execution succeeded. */
  ok: true;
  data: {
    /** Whether the plan payload was accepted. */
    updated: true;
  };
};

type PlanUpdateItem = UpdatePlanArgs["plan"][number];

/** Narrow full plan items to required shape. */
function isPlanItem(item: PlanUpdateItem): item is PlanItem {
  return typeof item.step === "string" && item.step.length > 0;
}

/** Narrow patch items to required shape. */
function isPlanPatchItem(item: PlanUpdateItem): item is PlanPatchItem {
  return Number.isInteger(item.index) && (item.index ?? 0) > 0;
}

/** Merge patch updates into a full plan snapshot. */
function mergePlanWithPatch(basePlan: PlanItem[], patches: PlanPatchItem[]): PlanItem[] {
  const nextPlan = basePlan.map((item) => ({ ...item }));
  for (const patch of patches) {
    const index = Number(patch.index);
    if (!Number.isInteger(index) || index <= 0) continue;
    const targetIndex = index - 1;
    if (!nextPlan[targetIndex]) continue;
    // 中文注释：仅更新状态，不改动 step 文本。
    nextPlan[targetIndex] = { ...nextPlan[targetIndex], status: patch.status };
  }
  return nextPlan;
}

/**
 * Update the assistant plan for the current turn.
 */
export const updatePlanTool = tool({
  description: updatePlanToolDef.description,
  inputSchema: zodSchema(updatePlanToolDef.parameters),
  execute: async (input: UpdatePlanArgs): Promise<UpdatePlanToolOutput> => {
    if (input.mode === "patch") {
      const currentPlanUpdate = getPlanUpdate();
      const basePlan =
        currentPlanUpdate && currentPlanUpdate.mode !== "patch"
          ? currentPlanUpdate.plan.filter(isPlanItem)
          : [];
      // 中文注释：仅在已有完整 plan 时应用 patch，避免写入无效空计划。
      if (basePlan.length > 0) {
        const patches = input.plan.filter(isPlanPatchItem);
        const nextPlan = mergePlanWithPatch(basePlan, patches);
        setPlanUpdate({
          mode: "full",
          actionName: input.actionName,
          explanation: input.explanation,
          plan: nextPlan,
        });
      }
      return { ok: true, data: { updated: true } };
    }

    // 逻辑：将最新 plan 缓存到请求上下文，等待 onFinish 时落库。
    setPlanUpdate({
      mode: "full",
      actionName: input.actionName,
      explanation: input.explanation,
      plan: input.plan.filter(isPlanItem),
    });
    return { ok: true, data: { updated: true } };
  },
});
