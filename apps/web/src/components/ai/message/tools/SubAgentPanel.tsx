/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  BotIcon,
  LoaderCircleIcon,
  WrenchIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import { useChatSession } from '../../context'
import {
  asPlainObject,
  normalizeToolInput,
  isToolStreaming,
} from './shared/tool-utils'
import type { ToolComponentProps } from './tool-registry'

/** Format elapsed milliseconds to human-readable string. */
function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remainS = s % 60
  return remainS > 0 ? `${m}m${remainS}s` : `${m}m`
}

/** Resolve agent status display. */
function AgentStatusBadge({
  isStreaming,
  isDone,
  hasError,
  isAborted,
  t,
}: {
  isStreaming: boolean
  isDone: boolean
  hasError: boolean
  isAborted: boolean
  t: (key: string) => string
}) {
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <AlertCircleIcon className="size-3" />
        {t('subAgentPanel.status.error')}
      </span>
    )
  }
  if (isAborted) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <AlertCircleIcon className="size-3" />
        {t('subAgentPanel.status.aborted')}
      </span>
    )
  }
  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
        <CheckCircleIcon className="size-3" />
        {t('subAgentPanel.status.done')}
      </span>
    )
  }
  if (isStreaming) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <LoaderCircleIcon className="size-3 animate-spin" />
        {t('subAgentPanel.status.running')}
      </span>
    )
  }
  return null
}

/** Truncate output to last N lines for preview. */
function getOutputPreview(output: string, maxLines = 3): string {
  if (!output) return ''
  const lines = output.trimEnd().split('\n')
  if (lines.length <= maxLines) return output.trimEnd()
  return `...${lines.slice(-maxLines).join('\n')}`
}

/** Extract the latest part info from stream parts for preview display. */
function getLatestPartInfo(parts: unknown[] | undefined): {
  type: 'tool' | 'text' | null
  toolName?: string
  text?: string
} {
  if (!parts || parts.length === 0) return { type: null }
  // Walk backwards to find the latest meaningful part
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i] as { type?: string; toolName?: string; text?: string } | null
    if (!p?.type) continue
    if (
      p.type === 'tool-invocation' ||
      p.type === 'dynamic-tool' ||
      p.type.startsWith('tool-')
    ) {
      return { type: 'tool', toolName: p.toolName ?? p.type }
    }
    if (p.type === 'text' && p.text) {
      return { type: 'text', text: p.text }
    }
  }
  return { type: null }
}

/** Get last N lines of text for preview. */
function getLastLines(text: string, maxLines = 3): string {
  if (!text) return ''
  const lines = text.trimEnd().split('\n')
  if (lines.length <= maxLines) return text.trimEnd()
  return lines.slice(-maxLines).join('\n')
}

/** Show the latest streaming part: tool name or text content. */
function LatestPartPreview({
  stream,
  isStreaming,
  isDone,
}: {
  stream: { parts?: unknown[]; output?: string; recentTools?: string[] } | undefined
  isStreaming: boolean
  isDone: boolean
}) {
  const latestPart = getLatestPartInfo(stream?.parts)

  // Determine what to show: latest part from parts, or fallback to recentTools/output
  // Tool part → show tool name
  if (latestPart.type === 'tool') {
    return (
      <div className="flex items-center gap-1.5 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <WrenchIcon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{latestPart.toolName}</span>
        {isStreaming && <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />}
      </div>
    )
  }

  // Text part → show last 3 lines (like thinking component)
  if (latestPart.type === 'text') {
    const preview = getLastLines(latestPart.text ?? '', 3)
    return (
      <div className="border-t px-3 py-1.5">
        <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-3">
          {preview}
        </pre>
      </div>
    )
  }

  // No parts info — fallback to recentTools (streaming) or output (done)
  if (isStreaming && stream?.recentTools && stream.recentTools.length > 0) {
    const lastTool = stream.recentTools[stream.recentTools.length - 1]
    return (
      <div className="flex items-center gap-1.5 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <WrenchIcon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{lastTool}</span>
        <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
      </div>
    )
  }

  if (isDone) {
    const outputPreview = getOutputPreview(stream?.output ?? '', 3)
    if (!outputPreview) return null
    return (
      <div className="border-t bg-muted/30 px-3 py-1.5">
        <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-3">
          {outputPreview}
        </pre>
      </div>
    )
  }

  return null
}

/** Render Agent tool as an interactive agent card with real-time progress. */
export default function SubAgentPanel({
  part,
  className,
}: ToolComponentProps) {
  const { t } = useTranslation('ai')
  const { tabId: contextTabId, sessionId } = useChatSession()

  // 从 input / output 解析 agent 信息
  const inputObj = asPlainObject(normalizeToolInput(part.input))

  // 从 XML output 解析 agentId 和元数据
  const outputMeta = React.useMemo(() => {
    const result = { agentId: '', toolUseCount: 0, durationMs: 0 }
    const extractFromXml = (xml: string) => {
      const idMatch = xml.match(/<task-id>([^<]+)<\/task-id>/)
      if (idMatch?.[1]) result.agentId = idMatch[1]
      const toolMatch = xml.match(/<tool_uses>(\d+)<\/tool_uses>/)
      if (toolMatch?.[1]) result.toolUseCount = Number.parseInt(toolMatch[1], 10)
      const durMatch = xml.match(/<duration_ms>(\d+)<\/duration_ms>/)
      if (durMatch?.[1]) result.durationMs = Number.parseInt(durMatch[1], 10)
    }
    const raw = part.output
    if (typeof raw === 'string') {
      extractFromXml(raw)
      if (result.agentId) return result
    }
    const outputObj = asPlainObject(normalizeToolInput(raw))
    if (typeof outputObj?.agent_id === 'string') {
      result.agentId = outputObj.agent_id
      return result
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const text = typeof item === 'string' ? item : (item as any)?.text
        if (typeof text === 'string') {
          extractFromXml(text)
          if (result.agentId) return result
        }
      }
    }
    return result
  }, [part.output])

  // 从 zustand 响应式查找 agentId（只在 agentId 变化时 re-render，不受 stream 内容变化影响）
  const masterToolCallId = part.toolCallId || ''

  const resolvedAgentId = useChatRuntime((s) => {
    if (outputMeta.agentId) return outputMeta.agentId
    if (!contextTabId || !masterToolCallId) return ''
    const tabStreams = s.subAgentStreamsByTabId[contextTabId]
    if (!tabStreams) return ''
    for (const [aid, st] of Object.entries(tabStreams)) {
      if (st.masterToolUseId === masterToolCallId) return aid
    }
    return ''
  })

  const agentId = resolvedAgentId || outputMeta.agentId || ''

  // 独立 selector 订阅 stream 状态（引用稳定，只在该 agent 的 stream 变化时触发）
  const stream = useChatRuntime((s) => {
    if (!contextTabId || !agentId) return undefined
    return s.subAgentStreamsByTabId[contextTabId]?.[agentId]
  })

  const agentName =
    stream?.name ||
    (typeof inputObj?.subagent_type === 'string' ? inputObj.subagent_type : '') ||
    (typeof inputObj?.agentType === 'string' ? inputObj.agentType : '') ||
    t('subAgentPanel.defaultName')
  const task =
    stream?.task ||
    (typeof inputObj?.prompt === 'string' ? (inputObj.prompt as string).slice(0, 200) : '') ||
    (typeof inputObj?.description === 'string' ? inputObj.description as string : '') ||
    (Array.isArray(inputObj?.items)
      ? (inputObj!.items as any[])
          .filter((i: any) => i?.type === 'text')
          .map((i: any) => i?.text ?? '')
          .join(' ')
          .slice(0, 120)
      : '')

  // stream.streaming 是 SSE 层的实时状态，比 part.state 更准确
  const streamEnded = stream != null && stream.streaming === false
  const isStreaming = streamEnded ? false : (isToolStreaming(part) || stream?.streaming === true)
  const effectiveState = stream?.state ?? part.state
  const isDone = effectiveState === 'output-available' || (streamEnded && effectiveState !== 'output-error')
  const hasError = effectiveState === 'output-error' || Boolean(stream?.errorText)
  const isAborted = !isStreaming && !isDone && !hasError && part.state === 'output-denied'

  // 实时经过时间（stream 优先，fallback 到 outputMeta）
  const [elapsed, setElapsed] = React.useState(outputMeta.durationMs)
  React.useEffect(() => {
    if (!stream?.startedAt || !isStreaming) {
      if (stream?.startedAt && (isDone || hasError)) {
        setElapsed(Date.now() - stream.startedAt)
      } else if (!stream && outputMeta.durationMs > 0) {
        setElapsed(outputMeta.durationMs)
      }
      return
    }
    const update = () => setElapsed(Date.now() - stream.startedAt!)
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [stream?.startedAt, isStreaming, isDone, hasError, outputMeta.durationMs])

  const handleClick = React.useCallback(() => {
    if (!agentId) return
    useLayoutState.getState().pushStackItem({
      id: `SubAgent-chat:${agentId}`,
      sourceKey: `SubAgent-chat:${agentId}`,
      component: 'SubAgent-chat',
      title: t('subAgentPanel.stackTitle'),
      params: { agentId, sessionId },
    })
  }, [agentId, sessionId, t])

  return (
    <div
      className={cn(
        'group min-w-0 cursor-pointer rounded-3xl border bg-card text-xs transition-colors hover:border-primary/30 hover:bg-accent/50',
        className,
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <BotIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-muted-foreground">{t('subAgentPanel.label')}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
          {agentName}
        </span>
        <AgentStatusBadge isStreaming={isStreaming} isDone={isDone} hasError={hasError} isAborted={isAborted} t={t} />
      </div>

      {/* Task description */}
      {task ? (
        <div className="show-scrollbar-thin max-h-30 overflow-y-auto whitespace-pre-wrap border-t px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {task}
        </div>
      ) : null}

      {/* Latest part preview */}
      <LatestPartPreview stream={stream} isStreaming={isStreaming} isDone={isDone} />

      {/* Footer stats */}
      {(elapsed > 0 ||
        (stream?.toolUseCount ?? outputMeta.toolUseCount) > 0 ||
        agentId) && (
        <div className="flex items-center gap-3 border-t px-3 py-1 text-[10px] text-muted-foreground/50">
          {elapsed > 0 && <span>{formatElapsed(elapsed)}</span>}
          {(stream?.toolUseCount ?? outputMeta.toolUseCount) > 0 && (
            <span>{stream?.toolUseCount ?? outputMeta.toolUseCount} tools</span>
          )}
          {agentId && (
            <span className="ml-auto truncate">{agentId}</span>
          )}
        </div>
      )}
    </div>
  )
}
