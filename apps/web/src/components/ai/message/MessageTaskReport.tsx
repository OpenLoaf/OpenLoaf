/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import * as React from "react"
import type { UIMessage } from "@ai-sdk/react"
import { CheckCircle2, XCircle, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@openloaf/ui/avatar"
import { Message, MessageContent } from "@/components/ai-elements/message"
import MessageParts from "./MessageParts"

interface MessageTaskReportProps {
  message: UIMessage
}

type AgentIdentity = {
  type?: 'secretary' | 'pm' | 'specialist'
  name?: string
  projectId?: string
  projectTitle?: string
  taskId?: string
}

function resolveTaskReportInfo(message: UIMessage) {
  const metadata = (message as any)?.metadata as
    | { taskId?: string; agentType?: string; displayName?: string; projectId?: string; agentIdentity?: AgentIdentity }
    | undefined
  const parts = Array.isArray(message.parts) ? message.parts : []
  const taskRefPart = parts.find((p: any) => p?.type === 'task-ref') as
    | { taskId?: string; title?: string; agentType?: string; status?: string }
    | undefined
  const identity = metadata?.agentIdentity

  return {
    displayName: identity?.name || metadata?.displayName || taskRefPart?.agentType || '任务助手',
    agentType: identity?.type || (metadata?.agentType === 'pm' ? 'pm' : 'specialist'),
    projectTitle: identity?.projectTitle,
    taskTitle: taskRefPart?.title || '',
    status: (taskRefPart?.status || 'completed') as 'completed' | 'failed' | 'running',
    taskId: metadata?.taskId || taskRefPart?.taskId || '',
  }
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  secretary: '秘书',
  pm: 'PM',
  specialist: '专家',
}

export default React.memo(function MessageTaskReport({ message }: MessageTaskReportProps) {
  const { displayName, agentType, projectTitle, status, taskTitle } = resolveTaskReportInfo(message)
  const agentTypeLabel = AGENT_TYPE_LABELS[agentType] || agentType

  const textParts = React.useMemo(() => {
    const parts = Array.isArray(message.parts) ? (message.parts as any[]) : []
    return parts.filter((p) => p?.type === 'text')
  }, [message.parts])

  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'

  return (
    <Message from="assistant" className="min-w-0 w-full">
      <div className="flex items-center gap-2 px-1">
        <Avatar className={cn(
          "size-6 ring-1",
          isCompleted && "ring-foreground/40",
          isFailed && "ring-destructive/40",
          !isCompleted && !isFailed && "ring-foreground/40",
        )}>
          <AvatarFallback className={cn(
            isCompleted && "bg-secondary text-foreground",
            isFailed && "bg-destructive/10 text-destructive",
            !isCompleted && !isFailed && "bg-secondary text-foreground",
          )}>
            {isCompleted ? <CheckCircle2 className="size-3.5" /> : null}
            {isFailed ? <XCircle className="size-3.5" /> : null}
            {!isCompleted && !isFailed ? <ClipboardList className="size-3.5" /> : null}
          </AvatarFallback>
        </Avatar>
        <span className="rounded-3xl bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {agentTypeLabel}
        </span>
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          {displayName}
        </span>
        {projectTitle && (
          <span className="truncate text-[10px] text-muted-foreground/60">
            [{projectTitle}]
          </span>
        )}
        {taskTitle && (
          <span className={cn(
            "ml-1 truncate rounded-3xl px-2 py-0.5 text-[10px] font-medium",
            isCompleted && "bg-secondary text-foreground",
            isFailed && "bg-destructive/10 text-destructive",
            !isCompleted && !isFailed && "bg-secondary text-foreground",
          )}>
            {taskTitle}
          </span>
        )}
      </div>
      <MessageContent className="min-w-0 w-full space-y-2">
        <MessageParts parts={textParts} options={{ isAnimating: false, messageId: message.id }} />
      </MessageContent>
    </Message>
  )
})
