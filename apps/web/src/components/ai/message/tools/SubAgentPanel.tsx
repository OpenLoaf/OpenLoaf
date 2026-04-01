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
  ChevronRightIcon,
  LoaderCircleIcon,
  WrenchIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from 'lucide-react'
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
}: {
  isStreaming: boolean
  isDone: boolean
  hasError: boolean
  isAborted: boolean
}) {
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <AlertCircleIcon className="size-3" />
        出错
      </span>
    )
  }
  if (isAborted) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <AlertCircleIcon className="size-3" />
        已中止
      </span>
    )
  }
  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
        <CheckCircleIcon className="size-3" />
        已完成
      </span>
    )
  }
  if (isStreaming) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <LoaderCircleIcon className="size-3 animate-spin" />
        运行中
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

/** Render Agent tool as an interactive agent card with real-time progress. */
export default function SubAgentPanel({
  part,
  className,
}: ToolComponentProps) {
  const { tabId: contextTabId, sessionId } = useChatSession()

  // 从 input / output 解析 agent 信息
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const outputObj = asPlainObject(normalizeToolInput(part.output))

  // agent_id 来自 Agent 的 output，也是 subAgentStreams 的 key
  const agentIdFromOutput =
    typeof outputObj?.agent_id === 'string' ? outputObj.agent_id : ''

  // 从 zustand 响应式查找 agentId（只在 agentId 变化时 re-render，不受 stream 内容变化影响）
  const masterToolCallId = part.toolCallId || ''

  const resolvedAgentId = useChatRuntime((s) => {
    if (agentIdFromOutput) return agentIdFromOutput
    if (!contextTabId || !masterToolCallId) return ''
    const tabStreams = s.subAgentStreamsByTabId[contextTabId]
    if (!tabStreams) return ''
    for (const [aid, st] of Object.entries(tabStreams)) {
      if (st.masterToolUseId === masterToolCallId) return aid
    }
    return ''
  })

  const agentId = resolvedAgentId || agentIdFromOutput || ''

  // 独立 selector 订阅 stream 状态（引用稳定，只在该 agent 的 stream 变化时触发）
  const stream = useChatRuntime((s) => {
    if (!contextTabId || !agentId) return undefined
    return s.subAgentStreamsByTabId[contextTabId]?.[agentId]
  })

  const agentName =
    stream?.name ||
    (typeof inputObj?.agentType === 'string' ? inputObj.agentType : '') ||
    '子智能体'
  const task =
    stream?.task ||
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
  const outputPreview = getOutputPreview(stream?.output ?? '', 3)

  // 实时经过时间
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    if (!stream?.startedAt || !isStreaming) {
      if (stream?.startedAt && (isDone || hasError)) {
        setElapsed(Date.now() - stream.startedAt)
      }
      return
    }
    const update = () => setElapsed(Date.now() - stream.startedAt!)
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [stream?.startedAt, isStreaming, isDone, hasError])

  const handleClick = React.useCallback(() => {
    if (!agentId) return
    useLayoutState.getState().pushStackItem({
      id: `sub-agent-chat:${agentId}`,
      sourceKey: `sub-agent-chat:${agentId}`,
      component: 'sub-agent-chat',
      title: agentName,
      params: { agentId, sessionId },
    })
  }, [agentId, agentName, sessionId])

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
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
          {agentName}
        </span>
        <AgentStatusBadge isStreaming={isStreaming} isDone={isDone} hasError={hasError} isAborted={isAborted} />
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Task description */}
      {task ? (
        <div className="border-t px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
          {task}
        </div>
      ) : null}

      {/* Recent tools activity (shown while running) */}
      {isStreaming &&
      stream?.recentTools &&
      stream.recentTools.length > 0 ? (
        <div className="border-t px-3 py-1.5 space-y-0.5">
          {stream.recentTools.map((tool, i) => (
            <div
              key={`${tool}-${i}`}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <WrenchIcon className="size-3 shrink-0" />
              <span className="truncate">{tool}</span>
              {i === stream.recentTools!.length - 1 && (
                <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Output preview (shown when done) */}
      {isDone && outputPreview ? (
        <div className="border-t bg-muted/30 px-3 py-1.5">
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-3">
            {outputPreview}
          </pre>
        </div>
      ) : null}

      {/* Footer stats */}
      {(elapsed > 0 ||
        (stream?.toolUseCount != null && stream.toolUseCount > 0) ||
        agentId) && (
        <div className="flex items-center gap-3 border-t px-3 py-1 text-[10px] text-muted-foreground/50">
          {elapsed > 0 && <span>{formatElapsed(elapsed)}</span>}
          {stream?.toolUseCount != null && stream.toolUseCount > 0 && (
            <span>{stream.toolUseCount} tools</span>
          )}
          {agentId && (
            <span className="ml-auto truncate">{agentId}</span>
          )}
        </div>
      )}
    </div>
  )
}
