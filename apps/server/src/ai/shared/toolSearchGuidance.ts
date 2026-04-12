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
} from '@openloaf/api/types/tools/toolCatalog'
import { isWebSearchConfigured } from '@/ai/tools/webSearchTool'

/** Platform-specific tool exclusions. */
const PLATFORM_EXCLUDED: Partial<Record<string, ClientPlatform[]>> = {
  'OpenUrl': ['web'],
  'JsxCreate': ['cli'],
  'ChartRender': ['cli'],
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
 */
export function buildToolSearchGuidance(
  platform?: ClientPlatform,
  deferredToolIds?: readonly string[],
): string {
  const allowedIds = deferredToolIds ? new Set(deferredToolIds) : null

  const available = TOOL_CATALOG_EXTENDED.filter((tool) => {
    if (allowedIds && !allowedIds.has(tool.id)) return false
    const excluded = PLATFORM_EXCLUDED[tool.id]
    if (excluded && platform && excluded.includes(platform)) return false
    if (tool.id === 'WebSearch' && !isWebSearchConfigured()) return false
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

  return `# 工具与技能（两条独立通道）

核心工具（Bash、Read、Glob、Grep、Edit、Write、AskUserQuestion、Agent、ToolSearch、LoadSkill 等）始终可用，直接调用。

**Skill 加载（工作流指令）**：\`LoadSkill(skillName: "<name>")\`——唯一途径。可用 skill 列表见 system 中的 \`<system-skills>\` 块。不要用 ToolSearch 加载 skill。

**Tool schema 加载（参数签名）**：其他 deferred 工具在调用前只有名字没有 schema，必须先用 \`ToolSearch(names: "ToolA,ToolB")\` 加载，支持批量；可用 \`ToolSearch(names: "select:ToolA")\` 明确按名加载。

工作流程：
1. 核心工具 → 直接使用
2. 领域任务 → 先 \`LoadSkill\` 读取对应 skill 正文，按正文指引一次性批量 \`ToolSearch\` 加载需要的工具，再按 skill 执行
3. 若无匹配 skill → 直接从下方分类判断需要什么工具，\`ToolSearch\` 加载其 schema

可按需加载的工具分类：
${groupLines.join('\n')}`
}
