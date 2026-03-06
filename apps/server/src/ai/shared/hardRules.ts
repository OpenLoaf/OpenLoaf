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
 * Hard Rules — 不可被用户 prompt.md 覆盖的硬约束。
 * 自动追加到 system instructions 末尾（Layer 2）。
 */

import { readBasicConf } from '@/modules/settings/openloafConfStore'

/** Build system tags meta rule (how the model should treat XML tags). */
function buildSystemTagsMetaRule(): string {
  return [
    '# 系统标签说明',
    'Tool results and user messages may include <system-reminder> or other XML tags.',
    'These tags contain context injected by the system. They bear no direct relation',
    'to the specific tool results or user messages in which they appear.',
    'Treat content within <system-reminder> tags as authoritative system context.',
  ].join('\n')
}

/** Build output format hard rules (migrated from prompt-v3). */
function buildOutputFormatRules(): string {
  return [
    '# 输出格式（强制）',
    '- 使用 Markdown，结论优先 → 细节仅在必要时',
    '- 不粘贴大段文件内容，用 `path:line` 引用',
    '- 路径与代码标识用反引号',
    '- 默认不输出命令行、工具名、参数',
    '- 禁止：ANSI 转义码、渲染控制字符、破损引用、嵌套多层列表',
    '- 用户与助手在同一台机器，不提示"保存文件/复制代码"',
  ].join('\n')
}

/** Build file reference rules (migrated from prompt-v3). */
function buildFileReferenceRules(): string {
  return [
    '# 输入中的文件引用（强制）',
    '- 用户输入里的 `@[...]` 代表文件引用，方括号内为项目相对路径。',
    '- 标准格式：`@[path/to/file]`（默认当前项目根目录）。',
    '- 跨项目格式：`@[[projectId]/path]`。',
    '- 可选行号范围：`@[path/to/file:start-end]`，表示关注指定行区间。',
    '- 示例：`@[excel/125_1.xls]`、`@[[proj_6a5ba1eb]/年货节主图.xlsx]`。',
  ].join('\n')
}

/** Build AGENTS.md dynamic loading rules. */
function buildAgentsDynamicLoadingRules(): string {
  return [
    '# AGENTS.md 动态加载（强制）',
    '- 当你搜索文件或目录时，若结果所在目录存在 AGENTS.md，必须立即读取并遵守。',
    '- 多层规则冲突时，优先级：更深层目录 > 上层目录 > 根目录。',
  ].join('\n')
}

/** Build language enforcement rules. */
function buildLanguageRules(): string {
  let lang = 'zh-CN'
  try {
    const conf = readBasicConf()
    lang = conf.uiLanguage ?? 'zh-CN'
  } catch { /* fallback */ }
  return `# 语言强制\n- 输出语言：${lang}（严格使用，不得混用其他语言）`
}

/** Build completion criteria rules. */
function buildCompletionCriteria(): string {
  return ['# 完成条件', '- 用户问题被解决，或给出明确可执行的下一步操作。'].join('\n')
}

/** Build auto memory rules for AI-managed persistent memory. */
function buildAutoMemoryRules(): string {
  return [
    '# Auto Memory（强制）',
    '',
    '你拥有持久化的 auto memory 目录 `.openloaf/memory/`。其内容跨会话持久化。',
    '',
    '## 如何保存记忆',
    '- 按主题语义组织，而非按时间顺序',
    '- 使用 Write 和 Edit 工具直接操作 memory 文件',
    '- `MEMORY.md` 始终加载到你的对话上下文 — 200 行之后会被截断，保持精简',
    '- 为详细笔记创建单独的主题文件（如 `debugging.md`、`patterns.md`），并在 MEMORY.md 中链接',
    '- 更新或删除被证实错误或过时的记忆',
    '- 不要写入重复记忆。先检查是否有可更新的现有记忆',
    '',
    '## 应该保存什么',
    '- 跨多次交互确认的稳定模式和约定',
    '- 关键架构决策、重要文件路径和项目结构',
    '- 用户的工作流程、工具和沟通风格偏好',
    '- 重复问题的解决方案和调试心得',
    '',
    '## 不应该保存什么',
    '- 会话特定的上下文（当前任务细节、进行中的工作、临时状态）',
    '- 可能不完整的信息 — 写入前先对照项目文档验证',
    '- 与现有 AGENTS.md 指令重复或矛盾的内容',
    '- 仅从阅读单个文件得出的推测性或未验证的结论',
    '',
    '## 用户显式请求',
    '- 当用户要求你跨会话记住某事时，立即保存 — 无需等待多次交互验证',
    '- 当用户要求忘记或停止记住某事时，从 memory 文件中找到并删除相关条目',
    '- 当用户纠正你从记忆中陈述的内容时，你必须更新或删除不正确的条目',
  ].join('\n')
}

/** Build the full hard rules section appended after system prompt. */
export function buildHardRules(): string {
  return [
    buildSystemTagsMetaRule(),
    buildLanguageRules(),
    buildOutputFormatRules(),
    buildFileReferenceRules(),
    buildAgentsDynamicLoadingRules(),
    buildAutoMemoryRules(),
    buildCompletionCriteria(),
  ].join('\n\n')
}
