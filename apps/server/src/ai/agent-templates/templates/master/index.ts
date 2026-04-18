/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AgentTemplate } from '../../types'
import { buildPowerShellGuide } from '@/ai/tools/powershell/prompt'
import MASTER_PROMPT_ZH from './prompt-v5.zh.md'
import MASTER_PROMPT_EN from './prompt-v5.en.md'
import HARNESS_ZH from './harness-v5.zh.md'
import HARNESS_EN from './harness-v5.en.md'

/** Combine master-specific prompt with shared harness core. */
function combine(masterPrompt: string, harness: string): string {
  return `${masterPrompt.trim()}\n\n---\n\n${harness.trim()}`
}

/**
 * Append a PowerShell usage guide on Windows hosts so agents stop reaching
 * for Bash-only idioms (`&&`, `grep`, unquoted CJK paths, etc.). On
 * non-Windows hosts this is a no-op, keeping the prompt token-lean.
 *
 * Edition detection is async (spawns `pwsh --version`), so we pass `null`
 * from sync prompt assembly paths — the guide still contains the core rules
 * and only loses the 5.1-specific footnote when edition is unknown.
 */
function appendPowerShellGuideIfWindows(prompt: string): string {
  if (process.platform !== 'win32') return prompt
  const guide = buildPowerShellGuide(null)
  return `${prompt}\n\n---\n\n${guide}`
}

export const masterTemplate: AgentTemplate = {
  id: 'master',
  name: 'AI 秘书',
  description: 'AI 秘书，负责全局调度、即时问答、委派复杂任务',
  icon: 'sparkles',
  deferredToolIds: [
    // agent collaboration (loaded on demand — SendMessage after spawning an
    // agent, SubmitPlan after receiving a PLAN_N.md from the plan subagent)
    'SendMessage',
    'SubmitPlan',
    // background process management (loaded on demand via ToolSearch)
    'Jobs',
    'Kill',
    'Sleep',
    // system
    'JsxCreate',
    'FileInfo',
    // web
    'OpenUrl',
    'WebSearch',
    'WebFetch',
    // browser automation
    'BrowserSnapshot',
    'BrowserAct',
    'BrowserWait',
    'BrowserDownloadImage',
    // media download (AI media generation moved to board v3 flow)
    'VideoDownload',
    // chart
    'ChartRender',
    // project
    'ProjectQuery',
    'ProjectMutate',
    // board
    'BoardQuery',
    'BoardMutate',
    // calendar
    'CalendarQuery',
    'CalendarMutate',
    // email
    'EmailQuery',
    'EmailMutate',
    // document
    'EditDocument',
    // office
    'DocPreview',
    'ExcelQuery',
    'ExcelMutate',
    'WordQuery',
    'WordMutate',
    'PptxQuery',
    'PptxMutate',
    'PdfInspect',
    'PdfMutate',
    // convert
    'ImageProcess',
    'VideoConvert',
    'DocConvert',
    // widget
    'GenerateWidget',
    'WidgetInit',
    'WidgetList',
    'WidgetGet',
    'WidgetCheck',
    // memory
    'MemorySave',
    // scheduled task
    'ScheduledTaskManage',
    'ScheduledTaskStatus',
    'ScheduledTaskWait',
    // cloud capabilities (progressive discovery: Browse → Detail → Generate)
    // activated on demand via LoadSkill('cloud-media-skill') / LoadSkill('cloud-text-skill') or ToolSearch
    'CloudCapBrowse',
    'CloudCapDetail',
    'CloudModelGenerate',
    'CloudTextGenerate',
    'CloudTask',
    'CloudTaskCancel',
    'CloudUserInfo',
    'CloudLogin',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: true,
  systemPrompt: combine(MASTER_PROMPT_ZH, HARNESS_ZH),
}

/** Get master prompt (master identity + skill routing + harness core) in specified language. */
export function getMasterPrompt(lang?: string): string {
  const base = lang?.startsWith('en')
    ? combine(MASTER_PROMPT_EN, HARNESS_EN)
    : combine(MASTER_PROMPT_ZH, HARNESS_ZH)
  return appendPowerShellGuideIfWindows(base)
}

/** Get the shared harness core (for PM/Project agents to reuse, without the Master identity). */
export function getStandardPrompt(lang?: string): string {
  const base = lang?.startsWith('en') ? HARNESS_EN.trim() : HARNESS_ZH.trim()
  return appendPowerShellGuideIfWindows(base)
}
