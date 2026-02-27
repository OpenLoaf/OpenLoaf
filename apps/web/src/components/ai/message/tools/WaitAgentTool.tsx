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
import { ClockIcon, CheckCircle2Icon, XCircleIcon, ShieldAlertIcon } from 'lucide-react'
import { useChatTools } from '../../context'
import type { AnyToolPart } from './shared/tool-utils'
import {
  asPlainObject,
  normalizeToolInput,
  isToolStreaming,
  isApprovalPending,
  getApprovalId,
} from './shared/tool-utils'
import ToolApprovalActions from './shared/ToolApprovalActions'
import type { SubAgentStreamState } from '../../context/ChatToolContext'
import type { ToolPartSnapshot } from '@/hooks/use-chat-runtime'

/** Pending approval info for a sub-agent. */
type PendingApproval = { approvalId: string; toolName?: string }

/** Find pending approvals belonging to a specific agent. */
function getAgentPendingApprovals(
  agentId: string,
  toolParts: Record<string, ToolPartSnapshot>,
): PendingApproval[] {
  const result: PendingApproval[] = []
  for (const part of Object.values(toolParts)) {
    if (
      part.subAgentToolCallId === agentId &&
      isApprovalPending(part as AnyToolPart)
    ) {
      const approvalId = getApprovalId(part as AnyToolPart)
      if (approvalId) {
        result.push({ approvalId, toolName: part.toolName })
      }
    }
  }
  return result
}

/** Single agent status row inside wait-agent. */
function AgentStatusRow({ agentId, stream, toolParts }: {
  agentId: string
  stream: SubAgentStreamState | undefined
  toolParts: Record<string, ToolPartSnapshot>
}) {
  const isRunning = stream?.streaming === true || stream?.state === 'output-streaming'
  const hasError = stream?.state === 'output-error'
  const isDone = stream?.state === 'output-available' && !stream?.streaming

  const pendingApprovals = React.useMemo(
    () => getAgentPendingApprovals(agentId, toolParts),
    [agentId, toolParts],
  )
  const hasPending = pendingApprovals.length > 0

  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center gap-2">
        {hasError ? (
          <XCircleIcon className="size-3.5 shrink-0 text-destructive" />
        ) : isDone ? (
          <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-500" />
        ) : hasPending ? (
          <ShieldAlertIcon className="size-3.5 shrink-0 text-amber-500" />
        ) : (
          <div className="size-3.5 shrink-0 flex items-center justify-center">
            <span className="size-2 animate-pulse rounded-full bg-blue-500" />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">
          {stream?.name || agentId}
        </span>
        <span className={cn(
          'text-[10px]',
          hasError && 'text-destructive',
          isDone && 'text-emerald-600 dark:text-emerald-400',
          hasPending && 'text-amber-600 dark:text-amber-400',
          isRunning && !hasPending && 'text-blue-600 dark:text-blue-400',
        )}>
          {hasError ? '出错' : isDone ? '完成' : hasPending ? '待审批' : '运行中'}
        </span>
      </div>
      {hasPending ? (
        <div className="ml-5 space-y-1">
          {pendingApprovals.map((pa) => (
            <div key={pa.approvalId} className="flex items-center gap-2">
              {pa.toolName ? (
                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                  {pa.toolName}
                </span>
              ) : null}
              <ToolApprovalActions approvalId={pa.approvalId} size="sm" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Skeleton loading bar for waiting state. */
function WaitingSkeleton() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/20" />
      </div>
    </div>
  )
}

/** Render wait-agent tool with loading effect and agent status list. */
export default function WaitAgentTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { subAgentStreams, toolParts } = useChatTools()

  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const outputObj = asPlainObject(normalizeToolInput(part.output))

  // 从 input 获取等待的 agent IDs
  const waitIds: string[] = Array.isArray(inputObj?.ids)
    ? (inputObj!.ids as string[]).filter((id) => typeof id === 'string')
    : []

  const isWaiting = isToolStreaming(part) || (!outputObj && part.state !== 'output-available' && part.state !== 'output-error')
  const timedOut = outputObj?.timed_out === true
  const completedId = typeof outputObj?.completed_id === 'string' ? outputObj.completed_id : null
  const statusMap = asPlainObject(outputObj?.status) as Record<string, string> | null

  // 检测是否有任何等待中的 agent 有 pending approval
  const hasAnyPendingApproval = React.useMemo(() => {
    for (const id of waitIds) {
      if (getAgentPendingApprovals(id, toolParts).length > 0) return true
    }
    return false
  }, [waitIds, toolParts])

  // subAgentStreams 的 key 就是 agent_id，直接查找
  const agentStreamMap = React.useMemo(() => {
    const map: Record<string, SubAgentStreamState | undefined> = {}
    for (const id of waitIds) {
      map[id] = subAgentStreams[id]
    }
    return map
  }, [waitIds, subAgentStreams])

  return (
    <div
      className={cn(
        'mb-2 min-w-0 rounded-lg border bg-card text-xs',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground/90">
          {isWaiting && hasAnyPendingApproval
            ? '子代理等待审批…'
            : isWaiting
              ? '等待子代理完成…'
              : timedOut
                ? '等待超时'
                : '等待完成'}
        </span>
        {waitIds.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            ({waitIds.length} 个代理)
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {isWaiting ? (
        <div className="border-t px-3 py-1">
          <WaitingSkeleton />
        </div>
      ) : null}

      {/* Agent status list */}
      {waitIds.length > 0 ? (
        <div className="border-t px-3 py-1">
          {waitIds.map((id) => (
            <AgentStatusRow
              key={id}
              agentId={id}
              stream={agentStreamMap[id]}
              toolParts={toolParts}
            />
          ))}
        </div>
      ) : null}

      {/* Result summary */}
      {outputObj && !isWaiting ? (
        <div className="border-t bg-muted/30 px-3 py-1.5">
          {completedId ? (
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
              首个完成: {completedId}
            </div>
          ) : null}
          {timedOut ? (
            <div className="text-[11px] text-amber-600 dark:text-amber-400">
              等待超时
            </div>
          ) : null}
          {statusMap ? (
            <div className="mt-1 space-y-0.5">
              {Object.entries(statusMap).map(([id, status]) => (
                <div key={id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="truncate">{id}</span>
                  <span>→</span>
                  <span className={cn(
                    status === 'completed' && 'text-emerald-600 dark:text-emerald-400',
                    status === 'failed' && 'text-destructive',
                  )}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
