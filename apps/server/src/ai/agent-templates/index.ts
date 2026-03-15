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
 * Agent 模版模块统一导出。
 * 子 agent 已改为行为驱动类型，仅保留 master 模版。
 */

export type { AgentTemplate, AgentTemplateId } from './types'
export {
  ALL_TEMPLATES,
  getTemplate,
  isTemplateId,
  getPrimaryTemplate,
} from './registry'

// Export master prompt getter
export { getMasterPrompt } from './templates/master'

// Export PM agent prompt and tool IDs
export { getPMPrompt, PM_AGENT_TOOL_IDS } from './templates/pm'
