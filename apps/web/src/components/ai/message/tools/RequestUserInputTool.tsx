'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ClipboardListIcon } from 'lucide-react'
import { trpc } from '@/utils/trpc'
import { useChatActions, useChatSession, useChatState, useChatTools } from '../../context'
import {
  Tool,
  ToolContent,
  ToolHeader,
} from '@/components/ai-elements/tool'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import type { AnyToolPart } from './shared/tool-utils'
import {
  asPlainObject,
  getApprovalId,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
} from './shared/tool-utils'

type Question = {
  key: string
  label: string
  type?: 'text' | 'secret' | 'select'
  options?: string[]
  required?: boolean
  defaultValue?: string
}

type RequestUserInputInput = {
  actionName?: string
  title?: string
  description?: string
  questions?: Question[]
}

const SECRET_TOKEN_RE = /\{\{secret:[0-9a-f-]{36}\}\}/

/** Mask a value if it looks like a secret token. */
function maskIfSecret(value: string): string {
  return SECRET_TOKEN_RE.test(value) ? '••••••' : value
}

/** Render a single question field. */
function QuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: Question
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const fieldType = question.type ?? 'text'

  if (fieldType === 'select' && question.options?.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-foreground/80">
          {question.label}
          {question.required !== false ? <span className="text-destructive">*</span> : null}
        </label>
        <select
          value={value}
          disabled={disabled}
          className={cn(
            'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground',
            'outline-none ring-offset-background',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">请选择...</option>
          {question.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-foreground/80">
        {question.label}
        {question.required !== false ? <span className="text-destructive">*</span> : null}
      </label>
      <input
        type={fieldType === 'secret' ? 'password' : 'text'}
        value={value}
        placeholder={question.defaultValue ? `默认: ${question.defaultValue}` : undefined}
        disabled={disabled}
        className={cn(
          'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground',
          'outline-none ring-offset-background placeholder:text-muted-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Render request-user-input tool UI. */
export default function RequestUserInputTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { messages, status } = useChatState()
  const { updateMessage, addToolApprovalResponse, sendMessage } = useChatActions()
  const { toolParts, upsertToolPart } = useChatTools()
  const { sessionId } = useChatSession()

  const approvalId = getApprovalId(part)
  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const isRejected = part.approval?.approved === false
  const isApproved = part.approval?.approved === true
  const hasOutput = part.output != null
  const isStreaming = isToolStreaming(part)
  const isApprovalPendingForPart = isApprovalPending(part)

  const normalizedInput = normalizeToolInput(part.input)
  const inputObject = asPlainObject(normalizedInput) as RequestUserInputInput | null
  const questions: Question[] = Array.isArray(inputObject?.questions) ? inputObject!.questions : []
  const formTitle = inputObject?.title
  const formDescription = inputObject?.description

  // 逻辑：历史数据从 output.answers 读取已提交的答案
  const savedAnswers = asPlainObject((part.output as any)?.answers) ?? {}
  const isReadonly = isRejected || isApproved || hasOutput

  const [answers, setAnswers] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const q of questions) {
      initial[q.key] = (savedAnswers[q.key] as string) ?? q.defaultValue ?? ''
    }
    return initial
  })

  const updateApprovalMutation = useMutation({
    ...trpc.chat.updateMessageParts.mutationOptions(),
  })

  const updateApprovalInMessages = React.useCallback(
    (approved: boolean) => {
      const nextMessages = messages ?? []
      for (const message of nextMessages) {
        const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : []
        const hasTarget = parts.some((c: any) => c?.approval?.id === approvalId)
        if (!hasTarget) continue
        const nextParts = parts.map((c: any) => {
          if (c?.approval?.id !== approvalId) return c
          return { ...c, approval: { ...c.approval, approved } }
        })
        updateMessage(message.id, { parts: nextParts })
        return { messageId: message.id, nextParts }
      }
      return null
    },
    [messages, updateMessage, approvalId],
  )

  const updateApprovalSnapshot = React.useCallback(
    (approved: boolean) => {
      for (const [toolKey, toolPart] of Object.entries(toolParts)) {
        if (toolPart?.approval?.id !== approvalId) continue
        upsertToolPart(toolKey, {
          ...toolPart,
          approval: { ...toolPart.approval, approved },
        })
        break
      }
    },
    [toolParts, upsertToolPart, approvalId],
  )

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const isActionDisabled =
    isSubmitting ||
    isReadonly ||
    status === 'submitted' ||
    (status === 'streaming' && !isApprovalPendingForPart)

  const handleSubmit = React.useCallback(async () => {
    if (!toolCallId || isActionDisabled) return
    setIsSubmitting(true)
    try {
      // 逻辑：secret 字段先存储到服务端，获取令牌
      const finalAnswers: Record<string, string> = {}
      for (const q of questions) {
        const value = answers[q.key] ?? ''
        if (q.type === 'secret' && value) {
          const res = await fetch('/ai/tools/store-secret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
          })
          const data = await res.json()
          finalAnswers[q.key] = data.token
        } else {
          finalAnswers[q.key] = value
        }
      }

      updateApprovalSnapshot(true)
      updateApprovalInMessages(true)

      if (approvalId) {
        await addToolApprovalResponse({ id: approvalId, approved: true })
      }
      await sendMessage(undefined as any, {
        body: { toolApprovalPayloads: { [toolCallId]: { answers: finalAnswers } } },
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    toolCallId,
    isActionDisabled,
    questions,
    answers,
    updateApprovalSnapshot,
    updateApprovalInMessages,
    approvalId,
    addToolApprovalResponse,
    sendMessage,
  ])

  const handleSkip = React.useCallback(async () => {
    if (isSubmitting || isReadonly) return
    setIsSubmitting(true)
    updateApprovalSnapshot(false)
    const approvalUpdate = updateApprovalInMessages(false)
    try {
      if (approvalId) {
        await addToolApprovalResponse({ id: approvalId, approved: false })
      }
      if (approvalUpdate) {
        try {
          await updateApprovalMutation.mutateAsync({
            sessionId,
            messageId: approvalUpdate.messageId,
            parts: approvalUpdate.nextParts as any,
          })
        } catch {
          // 逻辑：落库失败时保留本地状态
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    isSubmitting,
    isReadonly,
    updateApprovalSnapshot,
    updateApprovalInMessages,
    approvalId,
    addToolApprovalResponse,
    updateApprovalMutation,
    sessionId,
  ])

  const toolTitle = getToolName(part)

  return (
    <Tool
      defaultOpen={isStreaming || isApprovalPendingForPart}
      className={cn('w-full min-w-0 text-xs', className, isStreaming && 'tenas-tool-streaming')}
    >
      <ToolHeader
        title={toolTitle}
        type={part.type as any}
        state={part.state as any}
        icon={<ClipboardListIcon className="size-3.5 text-muted-foreground" />}
        className="p-2 gap-2 [&_span]:text-xs [&_svg]:size-3.5"
      />
      <ToolContent className="space-y-3 p-3 text-xs">
        {formTitle ? (
          <div className="text-xs font-semibold text-foreground/80">{formTitle}</div>
        ) : null}
        {formDescription ? (
          <div className="text-[11px] text-muted-foreground/70">{formDescription}</div>
        ) : null}

        {isRejected ? (
          <div className="text-[11px] text-muted-foreground">已跳过</div>
        ) : (
          <div className="flex flex-col gap-3">
            {questions.map((q) => {
              if (isReadonly) {
                // 逻辑：只读模式显示摘要
                const displayValue = q.type === 'secret'
                  ? '••••••'
                  : maskIfSecret(String(savedAnswers[q.key] ?? answers[q.key] ?? ''))
                return (
                  <div key={q.key} className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">{q.label}</span>
                    <span className="text-xs text-foreground">{displayValue || '—'}</span>
                  </div>
                )
              }
              return (
                <QuestionField
                  key={q.key}
                  question={q}
                  value={answers[q.key] ?? ''}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v }))}
                  disabled={isActionDisabled}
                />
              )
            })}
          </div>
        )}

        {/* 操作按钮 */}
        {!isReadonly && !isRejected ? (
          <div className="flex items-center gap-2 pt-1">
            <PromptInputButton
              type="button"
              size="sm"
              variant="default"
              disabled={isActionDisabled}
              onClick={handleSubmit}
            >
              {isSubmitting ? '提交中...' : '提交'}
            </PromptInputButton>
            <PromptInputButton
              type="button"
              size="sm"
              variant="outline"
              disabled={isActionDisabled}
              onClick={handleSkip}
            >
              跳过
            </PromptInputButton>
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  )
}
