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
 * 工具目录 — ToolSearch 运行时引导。
 *
 * 不再暴露具体工具 ID 给模型 — 模型应先通过 skill 获取指引，
 * skill 自动激活其声明的工具。仅在无匹配 skill 时才按分类名称
 * 提示模型可用的工具方向。
 */

import type { ClientPlatform } from '@openloaf/api/types/platform'
import {
  TOOL_CATALOG_EXTENDED,
  getMcpCatalogEntries,
  type ToolCatalogExtendedItem,
} from '@openloaf/api/types/tools/toolCatalog'
import { isWebSearchConfigured } from '@/ai/tools/webSearchTool'

/** Platform-specific tool exclusions. */
const PLATFORM_EXCLUDED: Partial<Record<string, ClientPlatform[]>> = {
  'open-url': ['web'],
  'jsx-create': ['cli'],
  'chart-render': ['cli'],
}

/** Group → Chinese label (no tool IDs exposed to model). */
const GROUP_LABELS: Record<string, string> = {
  core: '系统/计划',
  agent: '代理调度',
  fileRead: '文件查看',
  fileWrite: '文件编辑',
  shell: '命令执行',
  web: '网页/浏览器',
  media: '媒体生成/处理',
  ui: '可视化/组件',
  code: '代码执行',
  task: '任务管理',
  db: '项目管理',
  board: '画布',
  calendar: '日历',
  email: '邮件',
  office: '文档（Excel/Word/PPTX/PDF）',
  convert: '格式转换',
  memory: '记忆',
}

/**
 * Build ToolSearch guidance text dynamically.
 *
 * @param platform  - Client platform for filtering platform-specific tools.
 * @param deferredToolIds - Agent's deferred tool IDs. Only these tools appear in the catalog.
 *                          If omitted, all tools in TOOL_CATALOG_EXTENDED are included.
 * @param mcpToolIds - MCP tool IDs that are pre-activated (no tool-search needed).
 */
export function buildToolSearchGuidance(
  platform?: ClientPlatform,
  deferredToolIds?: readonly string[],
  mcpToolIds?: readonly string[],
): string {
  const allowedIds = deferredToolIds ? new Set(deferredToolIds) : null

  const available = TOOL_CATALOG_EXTENDED.filter((tool) => {
    if (allowedIds && !allowedIds.has(tool.id)) return false
    const excluded = PLATFORM_EXCLUDED[tool.id]
    if (excluded && platform && excluded.includes(platform)) return false
    if (tool.id === 'web-search' && !isWebSearchConfigured()) return false
    return true
  })

  // 按 group 聚合（仅判断哪些 group 有工具）
  const activeGroups = new Set<string>()
  for (const tool of available) {
    activeGroups.add(tool.group)
  }

  // 仅显示分类名称，不暴露具体工具 ID
  const groupLines: string[] = []
  for (const [groupId, label] of Object.entries(GROUP_LABELS)) {
    if (activeGroups.has(groupId)) {
      groupLines.push(`- ${label}`)
    }
  }

  // Build MCP tools section — these are pre-activated, can be called directly
  let mcpSection = ''
  if (mcpToolIds && mcpToolIds.length > 0) {
    const mcpEntries = getMcpCatalogEntries()
    const mcpByServer = new Map<string, { id: string; name: string; description: string }[]>()
    for (const id of mcpToolIds) {
      // Extract server name from mcp__serverName__toolName
      const parts = id.split('__')
      const serverName = parts[1] ?? 'unknown'
      const entry = mcpEntries.find((e) => e.id === id)
      if (!mcpByServer.has(serverName)) mcpByServer.set(serverName, [])
      mcpByServer.get(serverName)!.push({
        id,
        name: entry?.label ?? id,
        description: entry?.description ?? '',
      })
    }

    const serverLines: string[] = []
    for (const [serverName, tools] of mcpByServer) {
      const toolList = tools.map((t) => `  - ${t.id}: ${t.description || t.name}`).join('\n')
      serverLines.push(`**${serverName}** MCP Server:\n${toolList}`)
    }
    mcpSection = `\n\n## MCP 外部工具（已激活，可直接调用）\n以下 MCP 工具已预加载，无需 tool-search，可直接调用：\n\n${serverLines.join('\n\n')}`
  }

  return `# 工具与技能
**你初始没有任何可用工具。必须先用 tool-search 加载后才能调用。**

调用方式：tool-search(names: "name1,name2") — 传入技能或工具名称，逗号分隔。

工作流程：
1. 先从 Skills 列表中找匹配的技能 → 加载技能（会自动激活相关工具）
2. 若无匹配技能 → 从下方分类中判断方向，加载对应工具

可用工具分类：
${groupLines.join('\n')}${mcpSection}`
}
