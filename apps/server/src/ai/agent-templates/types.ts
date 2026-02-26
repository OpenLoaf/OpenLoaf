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
 * Agent 模版类型定义。
 *
 * AgentTemplate 是纯数据结构，描述一个 Agent 的元信息、能力和提示词。
 * 运行时逻辑（工厂、runner）不在此模块中。
 */

/** Agent 模版 ID 联合类型。 */
export type AgentTemplateId =
  | 'master'
  | 'document'
  | 'shell'
  | 'browser'
  | 'email'
  | 'calendar'
  | 'widget'
  | 'project'

/** Agent 模版定义。 */
export type AgentTemplate = {
  /** 模版 ID（同时作为文件夹名）。 */
  id: AgentTemplateId
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
  /** 系统提示词。 */
  systemPrompt: string
  /** true = 仅内置使用，不生成文件、不出现在 UI。 */
  isBuiltinOnly?: boolean
}
