/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/**
 * 工具能力检测器 — 根据工具 ID 判断需要哪些 preface 章节。
 */

import type { PrefaceCapabilities } from '@/ai/shared/types'

/** Shell 类工具 ID。 */
const SHELL_TOOL_IDS = ['shell', 'shell-command', 'exec-command'] as const

/** 文件类工具 ID。 */
const FILE_TOOL_IDS = [
  'read-file',
  'list-dir',
  'grep-files',
  'apply-patch',
  'edit-document',
] as const

/** 检查工具集合中是否包含指定工具之一。 */
function hasAnyTool(toolSet: Set<string>, ids: readonly string[]): boolean {
  for (const id of ids) {
    if (toolSet.has(id)) return true
  }
  return false
}

/** 根据工具 ID 列表检测需要的 preface 章节。 */
export function detectPrefaceCapabilities(
  toolIds: readonly string[],
): PrefaceCapabilities {
  const toolSet = new Set(toolIds)
  return {
    needsPythonRuntime: hasAnyTool(toolSet, SHELL_TOOL_IDS),
    needsProjectRules: hasAnyTool(toolSet, FILE_TOOL_IDS),
    needsFileReferenceRules: hasAnyTool(toolSet, FILE_TOOL_IDS),
    needsSubAgentList: toolSet.has('spawn-agent'),
    needsTaskDelegationRules: toolSet.has('spawn-agent'),
    needsShellContext: hasAnyTool(toolSet, SHELL_TOOL_IDS),
  }
}
