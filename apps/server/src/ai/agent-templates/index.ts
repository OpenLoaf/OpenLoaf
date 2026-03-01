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
 */

export type { AgentTemplate, AgentTemplateId } from './types'
export {
  ALL_TEMPLATES,
  getTemplate,
  isTemplateId,
  getPrimaryTemplate,
  getScaffoldableTemplates,
} from './registry'

// Export multilingual prompt getters for each agent template
export { getBrowserPrompt } from './templates/browser'
export { getCalendarPrompt } from './templates/calendar'
export { getCoderPrompt } from './templates/coder'
export { getDocumentPrompt } from './templates/document'
export { getEmailPrompt } from './templates/email'
export { getMasterPrompt } from './templates/master'
export { getProjectPrompt } from './templates/project'
export { getShellPrompt } from './templates/shell'
export { getVisionPrompt } from './templates/vision'
export { getWidgetPrompt } from './templates/widget'
