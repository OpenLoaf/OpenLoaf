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
 * Agent 模版注册表 — 仅保留 master 模版。
 * 子 agent 已改为行为驱动类型（general-purpose / explore / plan），不再使用模版。
 */

import type { AgentTemplate, AgentTemplateId } from './types'
import { masterTemplate } from './templates/master'

/** 所有 Agent 模版（仅 master）。 */
const ALL_TEMPLATES: readonly AgentTemplate[] = [
  masterTemplate,
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
  return masterTemplate
}
