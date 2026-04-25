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
import CHANNEL_HARNESS_ZH from './harness.zh.md'
import CHANNEL_HARNESS_EN from './harness.en.md'

/**
 * Channel agent 默认 chat model —— IM 场景对首条回复延迟极度敏感（ack-first
 * SLO 3s），需要低首 token 延迟的模型。Qwen Flash (`OL-TX-008`) 是当前
 * SaaS 目录里最快的一档，工具调用稳定、中文流利，单价足够低可接受高频
 * debounce 消耗。
 *
 * 所有 channel bridge（wechat / slack / telegram / …）在调 runChatStream 时
 * 都应传这个常量，统一口径，避免各 bridge 自己硬编码模型 id 漂移。
 */
export const CHANNEL_DEFAULT_CHAT_MODEL_ID = 'qwen:OL-TX-008'

/**
 * Channel Agent 工具集 —— 用于 IM 通道（微信 / Slack / Telegram 等）。
 *
 * 相比 master：
 *  - 排除纯 UI 渲染类（JsxCreate / ChartRender / DocPreview / GenerateWidget / Widget*）
 *  - 排除前端交互类（EditDocument）
 *  - 排除 OpenLoaf app 内部对象类（ProjectQuery/Mutate / BoardQuery/Mutate / CalendarQuery/Mutate / EmailQuery/Mutate）
 *  - 排除浏览器控制类（BrowserSnapshot/Act/Wait/DownloadImage）—— 留给 OpenLoaf 桌面端
 *  - **保留** 桌面（macOS）控制类（MacosObserve / MacosAct）—— "用微信远程遥控电脑"是 IM 通道的核心价值之一，
 *    仅在 OpenLoaf Desktop（macOS）runtime 下注册；非桌面端工具未注册，模型不会看到
 */
export const CHANNEL_AGENT_TOOL_IDS = [
  // 注：channel bridge 的 fastAgent（ack）和 超时兜底 summarizer 都由 bridge 独立触发，
  // 不通过 agent 工具通道。agent 只专注业务回复，完全不感知 ack 层的存在。
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
  // 微信出站：image/video/file 气泡（voice 不支持——SDK 限制）
  'SendWeChatMedia',
  // 桌面（macOS）远程控制 —— 仅在 OpenLoaf Desktop（macOS）runtime 下真实注册
  'MacosObserve',
  'MacosAct',
] as const

/**
 * Channel agent 不应该出现在 preface builtin-skills 列表里的技能名单。
 *
 * 原因：
 *  - canvas-ops-skill / project-ops-skill / workbench-ops-skill ——
 *    面向 OpenLoaf 画布 / 项目 / 工作台内嵌对象，IM 用户不在 app 里。
 *  - browser-ops-skill —— 对应工具（BrowserSnapshot/Act/Wait）已从 CHANNEL_AGENT_TOOL_IDS 剔除，
 *    技能正文再讲只会误导模型。
 *  - settings-guide-skill —— 指导用户操作 OpenLoaf 设置页，IM 通道无从操作。
 *  - skill-creator-skill —— 创建新技能属于 app 内开发动作，IM 场景不触发。
 *
 * 注意：macos-control-skill 保留在 channel 可见列表——"用微信远程遥控电脑"是 IM 通道的核心价值。
 * builtin-skills/index.ts 已在 `OPENLOAF_RUNTIME=desktop && darwin`（或 mock）之外静默跳过，
 * 非桌面端自然不会出现在 preface 里，无需在这里额外排除。
 */
export const CHANNEL_EXCLUDED_SKILL_NAMES: ReadonlyArray<string> = [
  'canvas-ops-skill',
  'browser-ops-skill',
  'settings-guide-skill',
  'skill-creator-skill',
]

/**
 * Get channel agent prompt (identity + approval + channel-specific harness).
 *
 * 刻意不复用 master 的 `getStandardPrompt()`：master harness 面向 OpenLoaf app 内
 * 全能 agent（改代码 / 画布 / 文档编辑 / Windows PowerShell…），对 IM 场景既冗余
 * 又冲突——例如其"默认静默发工具、不要预告"与 channel 的 ack-first 正面对撞。
 * channel 自己的 harness 只留 IM 真正需要的 6 块：工具调度 / 失败处理 / 图像反幻觉
 * / macOS 控制 / 记忆 / 路径。
 */
export function getChannelPrompt(lang?: string): string {
  const isEn = lang?.startsWith('en')
  const identity = (isEn ? CHANNEL_IDENTITY_EN : CHANNEL_IDENTITY_ZH).trim()
  const approval = (isEn ? CHANNEL_APPROVAL_EN : CHANNEL_APPROVAL_ZH).trim()
  const harness = (isEn ? CHANNEL_HARNESS_EN : CHANNEL_HARNESS_ZH).trim()
  return `${identity}\n\n---\n\n${approval}\n\n---\n\n${harness}`
}
