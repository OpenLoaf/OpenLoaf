/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import CHANNEL_IDENTITY_ZH from './identity.zh.md'
import CHANNEL_IDENTITY_EN from './identity.en.md'
import CHANNEL_APPROVAL_ZH from './approval.zh.md'
import CHANNEL_APPROVAL_EN from './approval.en.md'
import { getStandardPrompt } from '../master'

/**
 * Channel Agent 工具集 —— 用于 IM 通道（微信 / Slack / Telegram 等）。
 *
 * 相比 master：
 *  - 排除纯 UI 渲染类（JsxCreate / ChartRender / DocPreview / GenerateWidget / Widget*）
 *  - 排除前端交互类（EditDocument）
 *  - 排除 OpenLoaf app 内部对象类（ProjectQuery/Mutate / BoardQuery/Mutate / CalendarQuery/Mutate / EmailQuery/Mutate）
 *  - 排除桌面 / 浏览器控制类（MacosObserve/Act / BrowserSnapshot/Act/Wait/DownloadImage）——
 *    IM 通道专注于"对话 + 云能力"，桌面遥控能力留给 OpenLoaf 桌面端
 */
export const CHANNEL_AGENT_TOOL_IDS = [
  // web
  'OpenUrl',
  'WebFetch',
  // 后台进程
  'Jobs',
  'Kill',
  'Sleep',
  // 文件读取类（非渲染）
  'FileInfo',
  'ExcelInspect',
  'WordInspect',
  'PdfInspect',
  'PptxInspect',
  // 格式转换
  'ImageProcess',
  'VideoConvert',
  'DocConvert',
  // 云能力
  'CloudImageGenerate',
  'CloudImageEdit',
  'CloudVideoGenerate',
  'CloudTTS',
  'CloudSpeechRecognize',
  'CloudImageUnderstand',
  'CloudTask',
  'CloudTaskCancel',
  'CloudUserInfo',
  'CloudLogin',
  // 沙箱脚本
  'JsSandbox',
  // 调度
  'ScheduledTaskManage',
  'ScheduledTaskStatus',
  'ScheduledTaskWait',
  // 子 agent 协作
  'Agent',
  'SendMessage',
  'SubmitPlan',
  // 媒体下载
  'VideoDownload',
] as const

/**
 * Channel agent 不应该出现在 preface builtin-skills 列表里的技能名单。
 *
 * 原因：
 *  - canvas-ops-skill / project-ops-skill / workbench-ops-skill ——
 *    面向 OpenLoaf 画布 / 项目 / 工作台内嵌对象，IM 用户不在 app 里。
 *  - browser-ops-skill / macos-control-skill ——
 *    对应的工具已从 CHANNEL_AGENT_TOOL_IDS 剔除，技能正文再讲只会误导模型。
 *  - settings-guide-skill —— 指导用户操作 OpenLoaf 设置页，IM 通道无从操作。
 *  - skill-creator-skill —— 创建新技能属于 app 内开发动作，IM 场景不触发。
 */
export const CHANNEL_EXCLUDED_SKILL_NAMES: ReadonlyArray<string> = [
  'canvas-ops-skill',
  'browser-ops-skill',
  'macos-control-skill',
  'settings-guide-skill',
  'skill-creator-skill',
]

/** Get channel agent prompt (identity + approval protocol + standard framework). */
export function getChannelPrompt(lang?: string): string {
  const isEn = lang?.startsWith('en')
  const identity = (isEn ? CHANNEL_IDENTITY_EN : CHANNEL_IDENTITY_ZH).trim()
  const approval = (isEn ? CHANNEL_APPROVAL_EN : CHANNEL_APPROVAL_ZH).trim()
  const standard = getStandardPrompt(lang)
  return `${identity}\n\n---\n\n${approval}\n\n---\n\n${standard}`
}
