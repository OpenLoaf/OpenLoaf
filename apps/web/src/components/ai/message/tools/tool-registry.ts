/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { ComponentType } from 'react'
import type { AnyToolPart, ToolVariant } from './shared/tool-utils'
import { normalizeToolInput } from './shared/tool-utils'

// Lazy imports to keep the registry lightweight
import CliThinkingTool from './CliThinkingTool'
import RequestUserInputTool from './RequestUserInputTool'
import UnifiedTool from './UnifiedTool'
import PlanTool from './PlanTool'
import ProjectMutateTool from './ProjectMutateTool'
import WriteFileTool from './WriteFileTool'
import ShellTool from './ShellTool'
import WidgetTool from './WidgetTool'
import WidgetInitTool from './WidgetInitTool'
import WidgetCheckTool from './WidgetCheckTool'
import JsxCreateTool from './JsxCreateTool'
import SubAgentPanel from './SubAgentPanel'
import ChartTool from './ChartTool'
import ExcelTool from './ExcelTool'
import WordTool from './WordTool'
import PptxTool from './PptxTool'
import PdfTool from './PdfTool'
import ImageProcessTool from './ImageProcessTool'
import BrowserSnapshotTool from './BrowserSnapshotTool'
import BrowserActionTool from './BrowserActionTool'
import OpenUrlTool from './OpenUrlTool'
import VideoDownloadTool from './VideoDownloadTool'
import ScheduledTaskTool from './ScheduledTaskTool'
import ClaudeCodeBashTool from './ClaudeCodeBashTool'
import ClaudeCodeReadTool from './ClaudeCodeReadTool'
import ClaudeCodeWriteTool from './ClaudeCodeWriteTool'
import ClaudeCodeEditTool from './ClaudeCodeEditTool'
import ClaudeCodeSearchTool from './ClaudeCodeSearchTool'
import ClaudeCodeWebTool from './ClaudeCodeWebTool'
import WebSearchTool from './WebSearchTool'
import ClaudeCodeTaskTool from './ClaudeCodeTaskTool'
import FileInfoTool from './FileInfoTool'
import GlobTool from './GlobTool'
import ReadTool from './ReadTool'
import GrepTool from './GrepTool'
import SendMessageTool from './SendMessageTool'
import JobsTool from './JobsTool'
import SleepTool from './SleepTool'
import LoadSkillTool from './LoadSkillTool'
import CloudModelGenerateTool from './CloudModelGenerateTool'
import CloudLoginTool from './CloudLoginTool'

export type ToolComponentProps = {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
  kind?: string
}

type ToolRegistryEntry = {
  match: string | string[]
  component: ComponentType<ToolComponentProps>
  /** Only match when providerExecuted is true */
  providerOnly?: boolean
  /** Extra props to pass */
  extraProps?: Record<string, unknown>
  /** Custom guard — return false to skip this entry */
  guard?: (part: AnyToolPart) => boolean
}

/**
 * Tool registry: maps tool kind to component.
 * Order matters — first match wins.
 */
export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  // ── Claude Code CLI tools (providerExecuted) ──
  { match: 'bash', component: ClaudeCodeBashTool as ComponentType<ToolComponentProps>, providerOnly: true },
  { match: 'read', component: ClaudeCodeReadTool as ComponentType<ToolComponentProps>, providerOnly: true },
  { match: 'write', component: ClaudeCodeWriteTool as ComponentType<ToolComponentProps>, providerOnly: true },
  { match: ['edit', 'multiedit'], component: ClaudeCodeEditTool as ComponentType<ToolComponentProps>, providerOnly: true },
  { match: 'glob', component: ClaudeCodeSearchTool as ComponentType<ToolComponentProps>, providerOnly: true, extraProps: { kind: 'glob' } },
  { match: 'grep', component: ClaudeCodeSearchTool as ComponentType<ToolComponentProps>, providerOnly: true, extraProps: { kind: 'grep' } },
  { match: 'ls', component: ClaudeCodeSearchTool as ComponentType<ToolComponentProps>, providerOnly: true, extraProps: { kind: 'ls' } },
  { match: 'webfetch', component: ClaudeCodeWebTool as ComponentType<ToolComponentProps>, providerOnly: true, extraProps: { kind: 'webfetch' } },
  { match: 'websearch', component: WebSearchTool as ComponentType<ToolComponentProps>, providerOnly: true },
  { match: 'task', component: ClaudeCodeTaskTool as ComponentType<ToolComponentProps>, providerOnly: true },

  // ── Standard tools ──
  { match: 'SubmitPlan', component: PlanTool as ComponentType<ToolComponentProps> },
  { match: 'AskUserQuestion', component: RequestUserInputTool as ComponentType<ToolComponentProps> },
  { match: ['JsxCreate', 'jsx-preview'], component: JsxCreateTool as ComponentType<ToolComponentProps> },
  { match: ['Edit', 'apply-patch'], component: WriteFileTool as ComponentType<ToolComponentProps> },
  { match: ['Bash', 'shell-command'], component: ShellTool as ComponentType<ToolComponentProps> },
  { match: ['Read', 'read-file'], component: ReadTool as ComponentType<ToolComponentProps> },
  { match: ['Grep', 'grep-files'], component: GrepTool as ComponentType<ToolComponentProps> },
  { match: ['Glob', 'list-dir'], component: GlobTool as ComponentType<ToolComponentProps> },
  { match: 'Write', component: WriteFileTool as ComponentType<ToolComponentProps> },
  { match: 'GenerateWidget', component: WidgetTool as ComponentType<ToolComponentProps> },
  { match: 'WidgetInit', component: WidgetInitTool as ComponentType<ToolComponentProps> },
  { match: 'WidgetCheck', component: WidgetCheckTool as ComponentType<ToolComponentProps> },
  { match: 'Agent', component: SubAgentPanel as ComponentType<ToolComponentProps> },
  { match: 'SendMessage', component: SendMessageTool as ComponentType<ToolComponentProps> },
  { match: 'ChartRender', component: ChartTool as ComponentType<ToolComponentProps> },
  { match: ['ExcelQuery', 'ExcelMutate'], component: ExcelTool as ComponentType<ToolComponentProps> },
  {
    match: ['WordQuery', 'WordMutate'],
    component: WordTool as ComponentType<ToolComponentProps>,
    guard: (part) => {
      const input = normalizeToolInput(part.input)
      const obj = typeof input === 'object' && input != null ? input as Record<string, unknown> : null
      return obj?.mode !== 'read-xml'
    },
  },
  {
    match: ['PptxQuery', 'PptxMutate'],
    component: PptxTool as ComponentType<ToolComponentProps>,
    guard: (part) => {
      const input = normalizeToolInput(part.input)
      const obj = typeof input === 'object' && input != null ? input as Record<string, unknown> : null
      return obj?.mode !== 'read-xml'
    },
  },
  { match: ['PdfQuery', 'PdfMutate'], component: PdfTool as ComponentType<ToolComponentProps> },
  { match: 'ImageProcess', component: ImageProcessTool as ComponentType<ToolComponentProps> },
  { match: 'VideoDownload', component: VideoDownloadTool as ComponentType<ToolComponentProps> },
  { match: 'OpenUrl', component: OpenUrlTool as ComponentType<ToolComponentProps> },
  { match: ['BrowserSnapshot', 'BrowserObserve', 'BrowserScreenshot'], component: BrowserSnapshotTool as ComponentType<ToolComponentProps> },  // BrowserObserve/BrowserScreenshot kept for backward compat with old messages
  { match: ['BrowserWait', 'BrowserAct', 'BrowserExtract', 'BrowserDownloadImage'], component: BrowserActionTool as ComponentType<ToolComponentProps> },  // BrowserExtract kept for backward compat with old messages
  { match: ['Jobs'], component: JobsTool as ComponentType<ToolComponentProps> },
  { match: ['Kill'], component: JobsTool as ComponentType<ToolComponentProps> },
  { match: ['Sleep'], component: SleepTool as ComponentType<ToolComponentProps> },
  { match: ['LoadSkill'], component: LoadSkillTool as ComponentType<ToolComponentProps> },
  { match: ['ScheduledTaskManage'], component: ScheduledTaskTool as ComponentType<ToolComponentProps> },
  { match: 'ProjectMutate', component: ProjectMutateTool as ComponentType<ToolComponentProps> },
  { match: 'FileInfo', component: FileInfoTool as ComponentType<ToolComponentProps> },
  { match: 'WebFetch', component: ClaudeCodeWebTool as ComponentType<ToolComponentProps>, extraProps: { kind: 'webfetch' } },
  { match: 'WebSearch', component: WebSearchTool as ComponentType<ToolComponentProps> },

  // ── Cloud capabilities ──
  // CloudModelGenerate renders the files[] / pendingUrls[] preview grid. The
  // other cloud tools (Browse/Detail/TextGenerate/Task/TaskCancel/UserInfo)
  // fall through to UnifiedTool — their responses are JSON that reads fine as-is.
  { match: 'CloudModelGenerate', component: CloudModelGenerateTool as ComponentType<ToolComponentProps> },
  { match: 'CloudLogin', component: CloudLoginTool as ComponentType<ToolComponentProps> },
]

/** Look up a registry entry by tool kind. */
export function findToolEntry(
  toolKind: string,
  providerExecuted: boolean,
  part: AnyToolPart,
): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY.find((entry) => {
    if (entry.providerOnly && !providerExecuted) return false
    if (!entry.providerOnly && providerExecuted) return false
    const matches = Array.isArray(entry.match) ? entry.match : [entry.match]
    if (!matches.some(m => m.toLowerCase() === toolKind.toLowerCase())) return false
    if (entry.guard && !entry.guard(part)) return false
    return true
  })
}

export { CliThinkingTool, UnifiedTool }
