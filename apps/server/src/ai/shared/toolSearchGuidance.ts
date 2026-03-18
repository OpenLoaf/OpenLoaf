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
 * 从 TOOL_CATALOG_EXTENDED + agent deferredToolIds 动态生成。
 * 不再硬编码工具列表 — 修改 agent template 的 toolIds/deferredToolIds
 * 后工具目录自动更新。
 */

import type { ClientPlatform } from '@openloaf/api/types/platform'
import {
  TOOL_CATALOG_EXTENDED,
  type ToolCatalogExtendedItem,
} from '@openloaf/api/types/tools/toolCatalog'
import { isWebSearchConfigured } from '@/ai/tools/webSearchTool'

/** Platform-specific tool exclusions. */
const PLATFORM_EXCLUDED: Partial<Record<string, ClientPlatform[]>> = {
  'open-url': ['web'],
  'jsx-create': ['cli'],
  'chart-render': ['cli'],
}

/** Group → Chinese label + search hint (presentation layer, rarely changes). */
const GROUP_META: Record<string, { label: string; hint: string }> = {
  core: { label: '系统/计划', hint: 'time / plan / input' },
  agent: { label: '代理调度', hint: 'agent / spawn' },
  fileRead: { label: '文件查看', hint: 'file / read / grep' },
  fileWrite: { label: '文件编辑', hint: 'patch / edit' },
  shell: { label: '命令执行', hint: 'shell' },
  web: { label: '网页/浏览器', hint: 'browser / open-url / web search' },
  media: { label: '媒体', hint: 'image / video / download / generate' },
  ui: { label: '可视化/组件', hint: 'jsx / chart / widget' },
  code: { label: '代码执行', hint: 'js repl' },
  task: { label: '任务管理', hint: 'task' },
  db: { label: '项目管理', hint: 'project' },
  board: { label: '画布', hint: 'board' },
  calendar: { label: '日历', hint: 'calendar' },
  email: { label: '邮件', hint: 'email' },
  office: { label: '文档', hint: 'excel / word / pptx / pdf' },
  convert: { label: '格式转换', hint: 'convert' },
  memory: { label: '记忆', hint: 'memory' },
}

/**
 * Build ToolSearch guidance text dynamically.
 *
 * @param platform  - Client platform for filtering platform-specific tools.
 * @param deferredToolIds - Agent's deferred tool IDs. Only these tools appear in the catalog.
 *                          If omitted, all tools in TOOL_CATALOG_EXTENDED are included.
 */
export function buildToolSearchGuidance(
  platform?: ClientPlatform,
  deferredToolIds?: readonly string[],
): string {
  const allowedIds = deferredToolIds ? new Set(deferredToolIds) : null

  // 逻辑：从 TOOL_CATALOG_EXTENDED 动态过滤，确保与 agent template 的 deferredToolIds 一致。
  const available = TOOL_CATALOG_EXTENDED.filter((tool) => {
    if (allowedIds && !allowedIds.has(tool.id)) return false
    const excluded = PLATFORM_EXCLUDED[tool.id]
    if (excluded && platform && excluded.includes(platform)) return false
    if (tool.id === 'web-search' && !isWebSearchConfigured()) return false
    return true
  })

  // 按 group 聚合
  const grouped = new Map<string, ToolCatalogExtendedItem[]>()
  for (const tool of available) {
    const list = grouped.get(tool.group) ?? []
    list.push(tool)
    grouped.set(tool.group, list)
  }

  // 意图速查 — 仅包含有工具的 group
  const intents: string[] = []
  for (const [groupId] of grouped) {
    const meta = GROUP_META[groupId]
    if (meta) intents.push(`${meta.label} → \`${meta.hint}\``)
  }

  return `# 工具目录
**重要：你初始没有任何可用工具。必须先调用 tool-search 加载工具后才能使用。直接调用未加载的工具会报错。**

使用方式：
- 直接选择（推荐）：tool-search(query: "select:open-url,browser-act") — 按 ID 精确加载，一次可加载多个
- 关键词搜索：tool-search(query: "file read") — 返回最匹配的工具并立即加载

工作流程：根据意图速查确定关键词 → 调用 tool-search 搜索并加载 → 然后才能调用已加载的工具。

意图速查：${intents.join(' | ')}`
}
