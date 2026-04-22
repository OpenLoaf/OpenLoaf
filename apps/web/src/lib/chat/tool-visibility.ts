/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * 统一的工具可见性判断。
 * 所有"是否显示某个 tool part"的决策都在这里完成，
 * 上游（renderMessageParts）直接用本函数过滤，
 * 下游（MessageTool）不再做可见性判断，只做渲染。
 */

import { isHiddenToolPart, isToolPartError } from "./message-parts";
import { findToolEntry } from "@/components/ai/message/tools/tool-registry";
import { getToolKind } from "@/components/ai/message/tools/shared/tool-utils";

type AnyPart = {
  type?: string;
  toolName?: string;
  state?: string;
  providerExecuted?: boolean;
  [key: string]: unknown;
};

/**
 * 判断一个 tool part 是否应该显示。
 *
 * 判断优先级：
 * 1. showAllToolResults 为 true → 显示（覆盖黑名单，方便调试）
 * 2. 黑名单工具（如 LoadSkill / ToolSearch）且无错误 → 不显示
 * 3. 审批挂起/已决定 → 显示（让用户操作审批 / 看到决定结果）
 * 4. 未完成（streaming 中）→ 显示
 * 5. 完成态（成功 or 错误）：有专用 UI (registry entry) 则显示，否则不显示
 *    —— 错误态原先也强制显示，但没有专用 UI 时默认 UnifiedTool 卡片会把原始
 *    errorText 粗暴展开，对用户来说是噪声。由 renderMessageParts 在整条消息
 *    被过滤空时补一行 compact 占位（包含错误状态图标），避免"消息凭空消失"。
 */
export function shouldShowToolPart(
  part: unknown,
  options?: { showAllToolResults?: boolean },
): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyPart;

  // 1. 用户开启"显示所有工具结果" → 一律显示（优先于黑名单，方便排查）
  if (options?.showAllToolResults) return true;

  // 2. 黑名单工具（无错误且非审批相关状态时隐藏）
  const hasApprovalDecision = (p as any).approval?.approved === true || (p as any).approval?.approved === false;
  if (isHiddenToolPart(p) && !isToolPartError(p) && p.state !== "approval-requested" && !hasApprovalDecision) return false;

  // 3. 审批相关 state：始终显示（审批按钮 / 决定结果不能被隐藏）
  if (p.state === "approval-requested" || hasApprovalDecision) return true;

  // 4. 未完成的工具始终显示（streaming 中）
  const state = p.state;
  const isCompleted =
    state === "output-available" ||
    state === "output-error" ||
    state === "output-denied";
  if (!isCompleted) return true;

  // 5. 已完成：取决于是否有专用 UI
  const kind = getToolKind(p as any).toLowerCase();
  const providerExecuted = !!p.providerExecuted;
  const hasEntry =
    findToolEntry(kind, providerExecuted, p as any) ||
    (providerExecuted && findToolEntry(kind, false, p as any));
  return !!hasEntry;
}
