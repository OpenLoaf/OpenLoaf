/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import PM_IDENTITY_ZH from './identity.zh.md'
import PM_IDENTITY_EN from './identity.en.md'
import { getStandardPrompt } from '../master'

/**
 * PM Agent 工具集 — 继承 Project Agent 工具集 + spawn-agent 协作工具。
 * 排除 task-manage（PM 不创建 Task，用 spawn-agent 同步调度 Specialist）。
 */
export const PM_AGENT_TOOL_IDS = [
  // core (always available)
  'tool-search',
  'Bash',
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'request-user-input',
  // agent collaboration (PM's core capability)
  'spawn-agent',
  'send-input',
  'wait-agent',
  'abort-agent',
  // system (deferred)
  'update-plan',
  // web
  'open-url',
  'WebSearch',
  'WebFetch',
  // project (query only)
  'project-query',
  // document
  'edit-document',
  // file info
  'file-info',
  // memory
  'memory-search',
  'memory-get',
] as const

/** Get PM agent prompt (PM identity + standard framework) in specified language. */
export function getPMPrompt(lang?: string): string {
  const identity = lang?.startsWith('en') ? PM_IDENTITY_EN.trim() : PM_IDENTITY_ZH.trim()
  const standard = getStandardPrompt(lang)
  return `${identity}\n\n---\n\n${standard}`
}
