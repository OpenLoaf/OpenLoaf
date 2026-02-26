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
 * 系统 Agent 定义 — 从 agent-templates 派生，保留所有导出签名。
 *
 * 所有系统 Agent 的元数据从此处派生，其他模块只需导入常量即可。
 */

import {
  getScaffoldableTemplates,
  isTemplateId,
  type AgentTemplate,
} from '@/ai/agent-templates'

/** 系统 Agent ID 联合类型。 */
export type SystemAgentId =
  | 'master'
  | 'document'
  | 'shell'
  | 'browser'
  | 'email'
  | 'calendar'
  | 'widget'
  | 'project'

/** 系统 Agent 定义。 */
export type SystemAgentDefinition = {
  /** Agent 文件夹名 / ID。 */
  id: SystemAgentId
  /** 显示名称。 */
  name: string
  /** 描述。 */
  description: string
  /** 图标名称。 */
  icon: string
  /** 工具 ID 列表。 */
  toolIds: readonly string[]
  /** 是否允许创建子 Agent。 */
  allowSubAgents: boolean
  /** 最大子 Agent 深度。 */
  maxDepth: number
  /** 是否为主 Agent（混合模式入口）。 */
  isPrimary: boolean
}

/** 从模版派生系统 Agent 定义。 */
function deriveFromTemplate(template: AgentTemplate): SystemAgentDefinition {
  return {
    id: template.id as SystemAgentId,
    name: template.name,
    description: template.description,
    icon: template.icon,
    toolIds: template.toolIds,
    allowSubAgents: template.allowSubAgents,
    maxDepth: template.maxDepth,
    isPrimary: template.isPrimary,
  }
}

/** 8 个系统 Agent 定义（从模版派生）。 */
export const SYSTEM_AGENT_DEFINITIONS: readonly SystemAgentDefinition[] =
  getScaffoldableTemplates().map(deriveFromTemplate)

/** 系统 Agent ID → 定义映射。 */
export const SYSTEM_AGENT_MAP = new Map<string, SystemAgentDefinition>(
  SYSTEM_AGENT_DEFINITIONS.map((def) => [def.id, def]),
)

/** 判断 folderName 是否为系统 Agent。 */
export function isSystemAgentId(folderName: string): boolean {
  return SYSTEM_AGENT_MAP.has(folderName)
}

/** 获取主 Agent 定义。 */
export function getPrimaryAgentDefinition(): SystemAgentDefinition {
  const primary = SYSTEM_AGENT_DEFINITIONS.find((d) => d.isPrimary)
  return primary!
}
