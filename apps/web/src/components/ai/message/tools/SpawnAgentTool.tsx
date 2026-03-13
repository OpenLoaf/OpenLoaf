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
import { BotIcon, ChevronRightIcon } from 'lucide-react'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import { useChatSession } from '../../context'
import type { AnyToolPart } from './shared/tool-utils'
import {
  asPlainObject,
  normalizeToolInput,
  isToolStreaming,
} from './shared/tool-utils'
import type { SubAgentStreamState } from '../../context/ChatToolContext'

/** Resolve agent status display. */
function AgentStatusBadge({ stream, part }: {
  stream: SubAgentStreamState | undefined
  part: AnyToolPart
}) {
  const isStreaming = stream?.streaming === true
  const state = stream?.state ?? part.state
  const hasError = state === 'output-error' || Boolean(stream?.errorText)
  const isDone = state === 'output-available' && !isStreaming

  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        出错
      </span>
    )
  }
  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ol-green">
        <span className="size-1.5 rounded-full bg-ol-green" />
        已完成
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ol-blue">
      <span className="size-1.5 animate-pulse rounded-full bg-ol-blue" />
      运行中
    </span>
  )
}

/** Truncate output to last N lines for preview. */
function getOutputPreview(output: string, maxLines = 3): string {
  if (!output) return ''
  const lines = output.trimEnd().split('\n')
  if (lines.length <= maxLines) return output.trimEnd()
  return `…${lines.slice(-maxLines).join('\n')}`
}

/** Render spawn-agent tool as an interactive agent card. */
export default function SpawnAgentTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId: contextTabId, sessionId } = useChatSession()

  // 从 input / output 解析 agent 信息
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const outputObj = asPlainObject(normalizeToolInput(part.output))

  // agent_id 来自 spawn-agent 的 output，也是 subAgentStreams 的 key
  const agentId = typeof outputObj?.agent_id === 'string' ? outputObj.agent_id : ''
  // 性能关键：直接从 zustand 按 agentId selector 订阅，避免 context 整体刷新。
  const stream = useChatRuntime((s) => {
    if (!contextTabId || !agentId) return undefined
    return s.subAgentStreamsByTabId[contextTabId]?.[agentId]
  })

  const agentName = stream?.name
    || (typeof inputObj?.agentType === 'string' ? inputObj.agentType : '')
    || '子代理'
  const task = stream?.task
    || (Array.isArray(inputObj?.items)
      ? (inputObj!.items as any[])
          .filter((i: any) => i?.type === 'text')
          .map((i: any) => i?.text ?? '')
          .join(' ')
          .slice(0, 120)
      : '')

  const isStreaming = isToolStreaming(part) || stream?.streaming === true
  const outputPreview = getOutputPreview(stream?.output ?? '', 3)

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
        'group mb-2 min-w-0 cursor-pointer rounded-lg border bg-card text-xs transition-colors hover:border-primary/30 hover:bg-accent/50',
        className,
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <BotIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
          {agentName}
        </span>
        <AgentStatusBadge stream={stream} part={part} />
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Task description */}
      {task ? (
        <div className="border-t px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
          {task}
        </div>
      ) : null}

      {/* Output preview */}
      {outputPreview ? (
        <div className="border-t bg-muted/30 px-3 py-1.5">
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-3">
            {outputPreview}
          </pre>
        </div>
      ) : null}

      {/* Agent ID footer */}
      {agentId ? (
        <div className="border-t px-3 py-1 text-[10px] text-muted-foreground/50">
          {agentId}
        </div>
      ) : null}
    </div>
  )
}
