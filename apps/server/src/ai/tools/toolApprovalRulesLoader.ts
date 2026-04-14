/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ToolApprovalRules } from '@openloaf/api/types/toolApproval'
import { getProjectRootPath } from '@openloaf/api'
import { readProjectConfig } from '@openloaf/api/services/projectTreeService'
import { readToolApprovalRules } from '@/modules/settings/openloafConfStore'
import { logger } from '@/common/logger'

/**
 * Resolve tool approval rules for a chat request.
 *
 * - Project chat (projectId present): read project.json aiSettings.toolApprovalRules.
 * - Temporary chat (no projectId): read the global ~/.openloaf/tool-approval.json.
 *
 * The two sources are kept strictly disjoint — project chats never see global
 * rules, and the global file only ever governs temporary chats.
 */
export async function loadToolApprovalRulesForRequest(
  projectId: string | undefined,
): Promise<ToolApprovalRules | undefined> {
  if (projectId) {
    return readProjectScopedRules(projectId)
  }
  try {
    const rules = readToolApprovalRules()
    return hasAnyRule(rules) ? rules : undefined
  } catch (err) {
    logger.warn({ err }, '[toolApproval] failed to read global temp-chat rules')
    return undefined
  }
}

async function readProjectScopedRules(
  projectId: string,
): Promise<ToolApprovalRules | undefined> {
  const rootPath = getProjectRootPath(projectId)
  if (!rootPath) return undefined
  try {
    const config = await readProjectConfig(rootPath, projectId)
    const rules = config.aiSettings?.toolApprovalRules
    return hasAnyRule(rules) ? rules : undefined
  } catch (err) {
    logger.warn({ err, projectId }, '[toolApproval] failed to read project rules')
    return undefined
  }
}

function hasAnyRule(rules?: ToolApprovalRules): boolean {
  if (!rules) return false
  return (rules.allow?.length ?? 0) > 0 || (rules.deny?.length ?? 0) > 0
}
