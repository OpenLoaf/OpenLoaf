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
import ProjectTool from './ProjectTool'
import WriteFileTool from './WriteFileTool'
import ShellTool from './ShellTool'
import WidgetTool from './WidgetTool'
import WidgetInitTool from './WidgetInitTool'
import WidgetCheckTool from './WidgetCheckTool'
import JsxCreateTool from './JsxCreateTool'
import SpawnAgentTool from './SpawnAgentTool'
import WaitAgentTool from './WaitAgentTool'
import ChartTool from './ChartTool'
import ExcelTool from './ExcelTool'
import WordTool from './WordTool'
import PptxTool from './PptxTool'
import PdfTool from './PdfTool'
import ImageProcessTool from './ImageProcessTool'
import BrowserSnapshotTool from './BrowserSnapshotTool'
import BrowserScreenshotTool from './BrowserScreenshotTool'
import VideoDownloadTool from './VideoDownloadTool'
import TaskTool from './TaskTool'
import ClaudeCodeBashTool from './ClaudeCodeBashTool'
import ClaudeCodeReadTool from './ClaudeCodeReadTool'
import ClaudeCodeWriteTool from './ClaudeCodeWriteTool'
import ClaudeCodeEditTool from './ClaudeCodeEditTool'
import ClaudeCodeSearchTool from './ClaudeCodeSearchTool'
import ClaudeCodeWebTool from './ClaudeCodeWebTool'
import ClaudeCodeTaskTool from './ClaudeCodeTaskTool'

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
  { match: 'websearch', component: ClaudeCodeWebTool as ComponentType<ToolComponentProps>, providerOnly: true, extraProps: { kind: 'websearch' } },
  { match: 'task', component: ClaudeCodeTaskTool as ComponentType<ToolComponentProps>, providerOnly: true },

  // ── Standard tools ──
  { match: 'update-plan', component: PlanTool as ComponentType<ToolComponentProps> },
  { match: 'request-user-input', component: RequestUserInputTool as ComponentType<ToolComponentProps> },
  { match: ['jsx-create', 'jsx-preview'], component: JsxCreateTool as ComponentType<ToolComponentProps> },
  { match: 'apply-patch', component: WriteFileTool as ComponentType<ToolComponentProps> },
  { match: 'shell-command', component: ShellTool as ComponentType<ToolComponentProps> },
  { match: 'generate-widget', component: WidgetTool as ComponentType<ToolComponentProps> },
  { match: 'widget-init', component: WidgetInitTool as ComponentType<ToolComponentProps> },
  { match: 'widget-check', component: WidgetCheckTool as ComponentType<ToolComponentProps> },
  { match: 'spawn-agent', component: SpawnAgentTool as ComponentType<ToolComponentProps> },
  { match: 'wait-agent', component: WaitAgentTool as ComponentType<ToolComponentProps> },
  { match: 'chart-render', component: ChartTool as ComponentType<ToolComponentProps> },
  { match: ['excel-query', 'excel-mutate'], component: ExcelTool as ComponentType<ToolComponentProps> },
  {
    match: ['word-query', 'word-mutate'],
    component: WordTool as ComponentType<ToolComponentProps>,
    guard: (part) => {
      const input = normalizeToolInput(part.input)
      const obj = typeof input === 'object' && input != null ? input as Record<string, unknown> : null
      return obj?.mode !== 'read-xml'
    },
  },
  {
    match: ['pptx-query', 'pptx-mutate'],
    component: PptxTool as ComponentType<ToolComponentProps>,
    guard: (part) => {
      const input = normalizeToolInput(part.input)
      const obj = typeof input === 'object' && input != null ? input as Record<string, unknown> : null
      return obj?.mode !== 'read-xml'
    },
  },
  { match: ['pdf-query', 'pdf-mutate'], component: PdfTool as ComponentType<ToolComponentProps> },
  { match: 'image-process', component: ImageProcessTool as ComponentType<ToolComponentProps> },
  { match: 'video-download', component: VideoDownloadTool as ComponentType<ToolComponentProps> },
  { match: ['browser-snapshot', 'browser-observe'], component: BrowserSnapshotTool as ComponentType<ToolComponentProps> },
  { match: 'browser-screenshot', component: BrowserScreenshotTool as ComponentType<ToolComponentProps> },
  { match: ['task-manage', 'create-task', 'task-status'], component: TaskTool as ComponentType<ToolComponentProps> },
  { match: 'project-mutate', component: ProjectTool as ComponentType<ToolComponentProps> },
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
    if (!matches.includes(toolKind)) return false
    if (entry.guard && !entry.guard(part)) return false
    return true
  })
}

export { CliThinkingTool, UnifiedTool }
