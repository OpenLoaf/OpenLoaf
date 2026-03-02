/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

const projectTypeEnum = z.enum([
  'code',
  'document',
  'data',
  'design',
  'research',
  'general',
])

const suggestionTypeEnum = z.enum(['completion', 'question', 'action'])

// ---------------------------------------------------------------------------
// Per-capability Zod schemas (used by auxiliaryInfer + generateObject)
// ---------------------------------------------------------------------------

export const CAPABILITY_SCHEMAS = {
  'project.classify': z.object({
    type: projectTypeEnum,
    icon: z.string().describe('一个最能代表项目类型的 emoji'),
    confidence: z.number().min(0).max(1),
  }),

  'chat.suggestions': z.object({
    suggestions: z.array(
      z.object({
        label: z.string().describe('显示文本，不超过 30 字'),
        value: z.string().describe('用户选择后实际填入的完整文本'),
        type: suggestionTypeEnum,
      }),
    ),
  }),

  'chat.title': z.object({
    title: z.string().describe('对话标题，不超过 20 字'),
  }),

  'project.ephemeralName': z.object({
    title: z.string().describe('项目名称，不超过 15 字'),
    icon: z.string().describe('最能代表项目的 emoji'),
    type: projectTypeEnum,
  }),

  'git.commitMessage': z.object({
    subject: z.string().describe('简短的 commit 标题，不超过 72 字符'),
    body: z.string().optional().describe('可选的详细说明'),
  }),

} as const

/** Inferred TypeScript types for each capability output. */
export type CapabilityOutput = {
  [K in keyof typeof CAPABILITY_SCHEMAS]: z.infer<(typeof CAPABILITY_SCHEMAS)[K]>
}

// ---------------------------------------------------------------------------
// Capability definition
// ---------------------------------------------------------------------------

/** Output mode of an auxiliary capability. */
export type AuxiliaryOutputMode = 'structured' | 'text' | 'tool-call' | 'skill'

/** Auxiliary model capability definition. */
export type AuxiliaryCapability = {
  key: string
  label: string
  description: string
  triggers: string[]
  defaultPrompt: string
  /** How the capability returns its result. */
  outputMode: AuxiliaryOutputMode
  /** Auto-generated from Zod schema — for UI display only. */
  outputSchema: Record<string, unknown>
}

/** All built-in auxiliary capabilities. */
export const AUXILIARY_CAPABILITIES: Record<string, AuxiliaryCapability> = {
  'project.classify': {
    key: 'project.classify',
    label: '项目分类',
    description: '当用户创建/导入项目时，扫描文件结构，自动判断项目类型并推荐图标。',
    outputMode: 'structured',
    triggers: [
      'Git 克隆完成后',
      '导入已有文件夹时',
      '老项目首次打开时（后台静默）',
    ],
    defaultPrompt: `你是一个项目分类专家。根据提供的文件列表，判断该项目的类型。

分析文件结构、扩展名和目录命名。

规则：
- code：包含源代码文件（.ts, .py, .java, .go 等）或 package.json / Cargo.toml 等构建配置
- document：以 .md, .docx, .pdf, .txt 等文档为主
- data：以 .csv, .json, .xlsx, .sql 等数据文件为主
- design：包含 .fig, .sketch, .psd, .ai 等设计文件
- research：包含 .ipynb, .R, .bib 等学术/研究文件
- general：无法明确归类时使用
- confidence 低于 0.5 时 type 应为 "general"`,
    outputSchema: CAPABILITY_SCHEMAS['project.classify'].toJSONSchema(),
  },

  'chat.suggestions': {
    key: 'chat.suggestions',
    label: '输入推荐',
    description: '当用户在输入框停顿时，根据上下文生成智能输入建议。',
    outputMode: 'structured',
    triggers: ['打开聊天窗口时', '输入框停顿 500ms'],
    defaultPrompt: `你是一个智能输入建议助手。根据用户当前的输入文本和对话上下文，生成 2-4 条有用的输入补全建议。

规则：
- label 不超过 30 字，value 是用户选择后实际填入的完整文本
- type=completion 为句子补全，type=question 为推荐提问，type=action 为推荐操作指令
- 建议应与当前项目/工作空间上下文相关
- 如果输入为空，基于项目上下文给出常见操作建议`,
    outputSchema: CAPABILITY_SCHEMAS['chat.suggestions'].toJSONSchema(),
  },

  'chat.title': {
    key: 'chat.title',
    label: '摘要标题',
    description: '对话结束后自动为对话生成一个简短、有意义的标题。',
    outputMode: 'structured',
    triggers: ['对话结束后自动命名', '用户手动触发重命名'],
    defaultPrompt: `你是一个标题生成专家。根据提供的对话内容摘要，为这段对话生成一个简短、准确的标题。

规则：
- 标题不超过 20 个字
- 使用对话的主要语言
- 抓住对话的核心主题，而非泛泛描述
- 避免使用"关于"、"讨论"等无信息量词汇`,
    outputSchema: CAPABILITY_SCHEMAS['chat.title'].toJSONSchema(),
  },

  'project.ephemeralName': {
    key: 'project.ephemeralName',
    label: '项目重命名',
    description: '根据项目内容和上下文，为项目生成一个直观的名称、图标和类型。',
    outputMode: 'structured',
    triggers: ['用户手动触发项目重命名'],
    defaultPrompt: `你是一个项目命名专家。根据 Agent 的任务描述，为临时项目生成一个直观的名称、图标和类型。

规则：
- title 应简短明了，体现任务核心内容
- icon 选择一个最贴切的 emoji
- type 根据任务性质判断`,
    outputSchema: CAPABILITY_SCHEMAS['project.ephemeralName'].toJSONSchema(),
  },

  'git.commitMessage': {
    key: 'git.commitMessage',
    label: 'Commit 信息',
    description: '根据代码变更内容，自动生成规范的 Git commit message。',
    outputMode: 'structured',
    triggers: ['用户请求生成 commit message'],
    defaultPrompt: `你是一个 Git commit message 专家。根据提供的代码变更 diff，生成规范的 commit message。

规则：
- subject 使用 Conventional Commits 格式：type(scope): description
- type 包括：feat, fix, refactor, docs, style, test, chore, perf
- scope 可选，指明变更的模块
- 使用英文编写
- body 仅在变更复杂时提供，解释 why 而非 what`,
    outputSchema: CAPABILITY_SCHEMAS['git.commitMessage'].toJSONSchema(),
  },
  'text.translate': {
    key: 'text.translate',
    label: '文本翻译',
    description: '将选中文本或对话内容翻译为目标语言，自动检测源语言。',
    outputMode: 'text',
    triggers: ['用户选中文本请求翻译', '对话中要求翻译内容'],
    defaultPrompt: `你是一个专业翻译。将提供的文本准确翻译为目标语言。

规则：
- 如果用户未指定目标语言：源语言为中文时翻译为英文，否则翻译为中文
- 保留原文的格式、换行和标点风格
- 专业术语优先使用该领域的惯用译法
- 不要添加解释或注释，只输出翻译结果`,
    outputSchema: {},
  },
}

/** Ordered capability keys for UI display. */
export const CAPABILITY_KEYS = [
  'project.classify',
  'chat.suggestions',
  'chat.title',
  'project.ephemeralName',
  'git.commitMessage',
  'text.translate',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
