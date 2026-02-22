/**
 * Agent 模版注册表 — 统一管理所有模版的查询与过滤。
 */

import type { AgentTemplate, AgentTemplateId } from './types'
import { masterTemplate } from './templates/master'
import { documentTemplate } from './templates/document'
import { browserTemplate } from './templates/browser'
import { shellTemplate } from './templates/shell'
import { emailTemplate } from './templates/email'
import { calendarTemplate } from './templates/calendar'
import { widgetTemplate } from './templates/widget'
import { projectTemplate } from './templates/project'

/** 所有 Agent 模版。 */
export const ALL_TEMPLATES: readonly AgentTemplate[] = [
  masterTemplate,
  documentTemplate,
  shellTemplate,
  browserTemplate,
  emailTemplate,
  calendarTemplate,
  widgetTemplate,
  projectTemplate,
] as const

/** 模版 ID → AgentTemplate 映射。 */
const TEMPLATE_MAP = new Map<string, AgentTemplate>(
  ALL_TEMPLATES.map((t) => [t.id, t]),
)

/** 根据 ID 获取模版。 */
export function getTemplate(id: string): AgentTemplate | undefined {
  return TEMPLATE_MAP.get(id)
}

/** 判断 ID 是否为已知模版。 */
export function isTemplateId(id: string): id is AgentTemplateId {
  return TEMPLATE_MAP.has(id)
}

/** 获取主 Agent 模版。 */
export function getPrimaryTemplate(): AgentTemplate {
  const primary = ALL_TEMPLATES.find((t) => t.isPrimary)
  return primary!
}

/** 获取可脚手架化的模版（排除 builtinOnly）。 */
export function getScaffoldableTemplates(): readonly AgentTemplate[] {
  return ALL_TEMPLATES.filter((t) => !t.isBuiltinOnly)
}
