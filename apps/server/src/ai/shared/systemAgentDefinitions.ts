/**
 * 系统 Agent 定义 — 零依赖纯数据模块。
 *
 * 所有系统 Agent 的元数据从此处派生，其他模块只需导入常量即可。
 */

/** 系统 Agent ID 联合类型。 */
export type SystemAgentId =
  | 'main'
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
  /** 能力组 ID 列表。 */
  capabilities: readonly string[]
  /** 是否允许创建子 Agent。 */
  allowSubAgents: boolean
  /** 最大子 Agent 深度。 */
  maxDepth: number
  /** 是否为主 Agent（混合模式入口）。 */
  isPrimary: boolean
}

/** 8 个系统 Agent 定义。 */
export const SYSTEM_AGENT_DEFINITIONS: readonly SystemAgentDefinition[] = [
  {
    id: 'main',
    name: '主助手',
    description: '混合模式主助手，可直接执行简单任务，也可调度子 Agent',
    icon: 'sparkles',
    capabilities: [
      'system',
      'agent',
      'file-read',
      'web',
      'media',
      'code-interpreter',
    ],
    allowSubAgents: true,
    maxDepth: 2,
    isPrimary: true,
  },
  {
    id: 'document',
    name: '文档助手',
    description: '文件读写、文档分析与自动总结',
    icon: 'file-text',
    capabilities: ['file-read', 'file-write', 'project'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
  {
    id: 'shell',
    name: '终端助手',
    description: 'Shell 命令执行',
    icon: 'terminal',
    capabilities: ['shell'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
  {
    id: 'browser',
    name: '浏览器助手',
    description: '网页浏览和数据抓取',
    icon: 'globe',
    capabilities: ['browser', 'web'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
  {
    id: 'email',
    name: '邮件助手',
    description: '邮件查询和操作',
    icon: 'mail',
    capabilities: ['email'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
  {
    id: 'calendar',
    name: '日历助手',
    description: '日历事件管理',
    icon: 'calendar',
    capabilities: ['calendar'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
  {
    id: 'widget',
    name: '工作台组件助手',
    description: '动态 Widget 创建',
    icon: 'layout-grid',
    capabilities: ['widget'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
  {
    id: 'project',
    name: '项目助手',
    description: '项目数据查询操作',
    icon: 'folder-kanban',
    capabilities: ['project'],
    allowSubAgents: false,
    maxDepth: 1,
    isPrimary: false,
  },
] as const

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
