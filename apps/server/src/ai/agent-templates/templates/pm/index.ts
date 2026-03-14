/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import PM_PROMPT_ZH from './prompt.zh.md'
import PM_PROMPT_EN from './prompt.en.md'

/**
 * PM Agent 工具集 — 继承 Project Agent 工具集 + spawn-agent 协作工具。
 * 排除 task-manage（PM 不创建 Task，用 spawn-agent 同步调度 Specialist）。
 */
export const PM_AGENT_TOOL_IDS = [
  // system
  'tool-search',
  'load-skill',
  'time-now',
  'update-plan',
  // agent collaboration (PM's core capability)
  'spawn-agent',
  'send-input',
  'wait-agent',
  'abort-agent',
  // file (read + write)
  'read-file',
  'list-dir',
  'grep-files',
  'apply-patch',
  // shell
  'shell-command',
  // web
  'open-url',
  'web-search',
  // project (query only)
  'project-query',
  // document
  'edit-document',
  // code
  'js-repl',
  'js-repl-reset',
  // file info
  'file-info',
  // memory
  'memory-search',
  'memory-get',
] as const

/** Get PM agent prompt in specified language. */
export function getPMPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return PM_PROMPT_EN.trim()
  }
  return PM_PROMPT_ZH.trim()
}
