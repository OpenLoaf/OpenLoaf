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
