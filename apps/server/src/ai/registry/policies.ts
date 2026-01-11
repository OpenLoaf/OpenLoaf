import type { RiskType } from "@tenas-ai/api/types/toolResult";

export type ToolPolicyMeta = {
  riskType?: RiskType;
  needsApproval?: boolean;
};

/**
 * Resolves approval requirement for a tool (MVP).
 */
export function resolveNeedsApproval(meta: ToolPolicyMeta | undefined): boolean {
  // MVP 直接用 registry 里的布尔值；后续可扩展为按 mode/workspace/路径等策略计算。
  return Boolean(meta?.needsApproval);
}

