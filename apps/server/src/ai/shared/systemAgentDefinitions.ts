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
 * 系统 Agent 定义 — 三个层级：
 *
 * 1. `SYSTEM_AGENT_IDS`：系统保留 ID（不可删改、前端显示"系统"标签）。包括 master /
 *    general-purpose / explore。
 * 2. `HIDDEN_AGENT_IDS`：从用户可见列表过滤的幕后 ID（master 聊天主控不在"专家中心"展示）。
 * 3. `BUILTIN_AGENT_DEFINITIONS`：完全内嵌在代码中的 Agent（general-purpose / explore）。
 *    这类 Agent 不落盘、不创建用户文件。列表来自代码常量，详情直接从定义返回。
 *    虚拟路径用 `builtin://agent/<folderName>` 协议标识，前后端据此识别。
 *
 * master 不在 BUILTIN_AGENT_DEFINITIONS 中 — 它是每个用户的聊天主控，实际落盘在
 * `<tempStorage>/agents/master/`，由 `agent-templates` 流程维护。
 */
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { masterTemplate } from '@/ai/agent-templates/templates/master'

/** Builtin agent 的虚拟路径前缀。 */
export const BUILTIN_AGENT_PATH_PREFIX = 'builtin://agent/'

/** 判断给定 path 是否为 builtin agent 的虚拟路径。 */
export function isBuiltinAgentPath(agentPath: string): boolean {
  return (
    typeof agentPath === 'string' && agentPath.startsWith(BUILTIN_AGENT_PATH_PREFIX)
  )
}

/** 从 builtin 虚拟路径提取 folderName。 */
export function builtinFolderNameFromPath(agentPath: string): string | null {
  if (!isBuiltinAgentPath(agentPath)) return null
  return agentPath.slice(BUILTIN_AGENT_PATH_PREFIX.length) || null
}

/** 构造 builtin 虚拟路径。 */
export function buildBuiltinAgentPath(folderName: string): string {
  return `${BUILTIN_AGENT_PATH_PREFIX}${folderName}`
}

/** Builtin agent 完整定义 — 对应历史种子化 AGENT.md 的 frontmatter + 正文。 */
export type BuiltinAgentDefinition = {
  folderName: string
  name: string
  description: string
  icon: string
  toolIds: string[]
  skills: string[]
  allowSubAgents: boolean
  maxDepth: number
  systemPrompt: string
}

const GENERAL_PURPOSE_SYSTEM_PROMPT = `你是通用任务助手子代理。

> 本 Agent 由系统自动管理，实际运行时会注入 Master 完整工具集与提示词。
> 此 Markdown 主要用于在「专家中心」展示 Agent 概览——编辑正文**不会**覆盖运行时行为。
> 若要定制子 Agent，建议新建自定义 Agent 而不是修改此文件。

## 何时使用

- 任务涉及多个步骤、跨领域综合
- 任务边界不明，需要子 Agent 自主判断路径
- 研究 / 调查 / 综合问答类场景

## 输出要求

- 简洁直接，结论先行
- 引用工具结果时标注来源
- 任务完成后给一份精简报告
`

const EXPLORE_SYSTEM_PROMPT = `你是文档研究员子代理。专注于**从文档中查找与整理信息**，不做代码修改、不执行命令。

## 能力边界

- **本地文件**：\`Read\` / \`Glob\` / \`Grep\` — 文本、代码、Markdown
- **Office 文档**：\`WordQuery\` / \`ExcelQuery\` / \`PdfQuery\` / \`PptxQuery\` — Word / Excel / PDF / PPT
- **网络资料**：\`WebSearch\`（找线索）/ \`WebFetch\`（读具体页）/ \`BrowserSnapshot\`（浏览器抓取动态页面）

## 工作流

1. **定位**：用 Glob / WebSearch 找到可能含答案的文档，**并行发起多条查询**，不串行
2. **精读**：对候选文档用 Read / WordQuery / PdfQuery / WebFetch 取出具体内容
3. **交叉验证**：重要结论需要至少 2 个来源支撑；来源冲突时要显式标注
4. **整理输出**：
   - **结论放最前**（1-2 句直接回答）
   - **证据列表**：每条都带来源引用（文件 path:line 或 URL）
   - 找不到就直说"未找到"，**不猜测、不编造**

## 硬性约束

- **只读**：不要 Write、不要改文件、不要跑脚本
- **并行优先**：多源调研同时发起调用，不要一个一个查
- **来源必须有**：每条结论都要能追溯到具体文件或 URL
- **不重复父 Agent 的推理**：你的输出应当是可直接采信的"证据包"，而非再次分析

## 输出模板

\`\`\`
## 结论
<1-2 句直接回答用户问题>

## 证据
- <file:line 或 URL>：<引用要点>
- <file:line 或 URL>：<引用要点>

## 需要注意
<可选：冲突、边界条件、未查到的部分>
\`\`\`
`

/**
 * general-purpose 的完整技能列表（与 Master 对齐，全量 16 个 builtin skills）。
 * cloud-skills 是运行时动态注入的，不在这里声明。
 */
const GENERAL_PURPOSE_SKILLS: readonly string[] = [
  'agent-orchestration',
  'browser-ops',
  'calendar-ops',
  'canvas-ops',
  'docx',
  'email-ops',
  'media-ops',
  'pdf',
  'pptx',
  'project-ops',
  'schedule-ops',
  'settings-guide',
  'skill-creator',
  'visualization-ops',
  'workbench-ops',
  'xlsx',
] as const

/** explore 的技能白名单（文档类 4 个 + 浏览器抓取 1 个）。 */
const EXPLORE_SKILLS: readonly string[] = [
  'docx',
  'xlsx',
  'pptx',
  'pdf',
  'browser-ops',
] as const

/** explore 的只读工具集（本地文件 / Office 文档 / 网络资料 / 浏览器抓取）。 */
const EXPLORE_TOOL_IDS: readonly string[] = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'WordQuery',
  'ExcelQuery',
  'PdfQuery',
  'PptxQuery',
  'BrowserSnapshot',
] as const

/**
 * 完全内嵌、不落盘的 Agent 定义（按展示顺序）。
 *
 * 这里的 toolIds / skills 是 **UI 展示 + 运行时对齐** 的单一真相源：
 * - 「专家中心」详情页按这里渲染（只读、已勾选）
 * - `agentFactory.ts` 的 createGeneralPurposeSubAgent / createExploreSubAgent
 *   应当消费这里的数据，保证展示和实际行为一致
 */
export const BUILTIN_AGENT_DEFINITIONS: readonly BuiltinAgentDefinition[] = [
  {
    folderName: 'general-purpose',
    name: 'general-purpose',
    description:
      '通用任务助手——多步研究、搜索、综合推理。最强的通用 Agent，适合边界不明的复杂任务。',
    icon: 'bot',
    // 与 Master 完全对齐的延迟加载工具清单（引用 masterTemplate 保证永不漂移）
    toolIds: [...(masterTemplate.deferredToolIds ?? [])],
    skills: [...GENERAL_PURPOSE_SKILLS],
    allowSubAgents: false,
    maxDepth: 1,
    systemPrompt: GENERAL_PURPOSE_SYSTEM_PROMPT,
  },
  {
    folderName: 'explore',
    name: 'explore',
    description:
      '文档研究员——从本地文件、Office 文档、PDF 和网页中查找整理信息。只读不改，适合调研、资料整理、多源对比。',
    icon: 'search',
    toolIds: [...EXPLORE_TOOL_IDS],
    skills: [...EXPLORE_SKILLS],
    allowSubAgents: false,
    maxDepth: 1,
    systemPrompt: EXPLORE_SYSTEM_PROMPT,
  },
] as const

/** Builtin agent folderName → 定义 的映射。 */
const BUILTIN_AGENT_MAP: ReadonlyMap<string, BuiltinAgentDefinition> = new Map(
  BUILTIN_AGENT_DEFINITIONS.map((def) => [def.folderName, def]),
)

/** 查询内嵌 agent 定义。 */
export function getBuiltinAgentDefinition(
  folderName: string,
): BuiltinAgentDefinition | undefined {
  return BUILTIN_AGENT_MAP.get(folderName)
}

/** 判断 folderName 是否为完全内嵌（不落盘）的系统 Agent。 */
export function isBuiltinAgentId(folderName: string): boolean {
  return BUILTIN_AGENT_MAP.has(folderName)
}

/**
 * 系统 Agent ID 列表（顺序决定前端展示顺序）。
 * general-purpose / explore 完全内嵌；master 有磁盘文件。
 */
export const SYSTEM_AGENT_ORDER: readonly string[] = [
  'general-purpose',
  'explore',
  'master',
] as const

/** 系统 Agent ID 联合类型。 */
export type SystemAgentId = (typeof SYSTEM_AGENT_ORDER)[number]

const SYSTEM_AGENT_IDS: ReadonlySet<string> = new Set<string>(SYSTEM_AGENT_ORDER)

/** 应当从用户可见列表隐藏的系统 Agent（master 聊天主控不暴露）。 */
const HIDDEN_AGENT_IDS: ReadonlySet<string> = new Set<string>(['master'])

/** 判断 folderName 是否为系统 Agent（不可删改 + 显示"系统"标签）。 */
export function isSystemAgentId(folderName: string): boolean {
  return SYSTEM_AGENT_IDS.has(folderName)
}

/** 判断 folderName 是否应当从用户列表中隐藏（当前仅 master）。 */
export function isHiddenAgentId(folderName: string): boolean {
  return HIDDEN_AGENT_IDS.has(folderName)
}

/**
 * 返回系统 Agent 的排序序号，非系统 Agent 返回 Number.MAX_SAFE_INTEGER。
 * 用于前端列表排序：general-purpose → explore → master → 其他用户 Agent。
 */
export function getSystemAgentOrder(folderName: string): number {
  const idx = SYSTEM_AGENT_ORDER.indexOf(folderName)
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

/**
 * 启动时清理历史种子化生成的 builtin agent 磁盘目录。
 * 之前由 `seedDefaultAgents` 在 `<globalAgentsPath>/<folderName>/` 创建了 AGENT.md，
 * 现在 builtin Agent 完全由代码常量驱动，磁盘副本多余且可能与代码版本产生分歧。
 *
 * 仅清理全局 agents 目录下的 builtin folderName — 项目级同名目录不受影响（正常情况下
 * saveAgent 层应阻止用户创建同名项目 Agent）。
 */
export function cleanupBuiltinAgentFiles(globalAgentsRootPath: string): void {
  for (const def of BUILTIN_AGENT_DEFINITIONS) {
    const targetDir = path.join(globalAgentsRootPath, def.folderName)
    if (!existsSync(targetDir)) continue
    try {
      rmSync(targetDir, { recursive: true, force: true })
    } catch {
      // 启动时静默忽略，下次再试。
    }
  }
}
