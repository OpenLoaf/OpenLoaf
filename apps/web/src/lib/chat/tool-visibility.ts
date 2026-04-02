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
 * 1. 黑名单工具（如 ToolSearch）且无错误 → 不显示
 * 2. showAllToolResults 为 true → 显示
 * 3. 未完成（streaming 中）→ 显示
 * 4. 有错误 → 显示
 * 5. 已成功完成 → 有专用 UI (registry entry) 则显示，否则不显示
 */
export function shouldShowToolPart(
  part: unknown,
  options?: { showAllToolResults?: boolean },
): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyPart;

  // 1. 黑名单工具（无错误时隐藏）
  if (isHiddenToolPart(p) && !isToolPartError(p)) return false;

  // 2. 用户开启"显示所有工具结果"
  if (options?.showAllToolResults) return true;

  // 3. 未完成的工具始终显示（streaming 中）
  const state = p.state;
  const isCompleted =
    state === "output-available" ||
    state === "output-error" ||
    state === "output-denied";
  if (!isCompleted) return true;

  // 4. 有错误的工具始终显示
  const hasError = state === "output-error" || state === "output-denied";
  if (hasError) return true;

  // 5. 已成功完成：检查是否有专用 UI
  const kind = getToolKind(p as any).toLowerCase();
  const providerExecuted = !!p.providerExecuted;
  const hasEntry =
    findToolEntry(kind, providerExecuted, p as any) ||
    (providerExecuted && findToolEntry(kind, false, p as any));
  return !!hasEntry;
}
