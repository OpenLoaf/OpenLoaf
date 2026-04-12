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
import { useMutation } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trpc } from '@/utils/trpc'
import { useChatActions, useChatSession, useChatMessages, useChatStatus, useChatTools } from '../../context'
import {
  Tool,
  ToolContent,
} from '@/components/ai-elements/tool'
import type { AnyToolPart } from './shared/tool-utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import styles from './RequestUserInputTool.module.css'
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
  type?: 'text' | 'secret' | 'select' | 'textarea'
  inputType?: string
  options?: string[]
  required?: boolean
  defaultValue?: string
  placeholder?: string
  pattern?: string
  patternMessage?: string
  minLength?: number
  maxLength?: number
}

type ChoiceOption = {
  label: string
  description?: string
}

type Choice = {
  key: string
  question: string
  options: ChoiceOption[]
  multiSelect?: boolean
}

type RequestUserInputInput = {
  actionName?: string
  title?: string
  description?: string
  mode?: 'form' | 'choice'
  questions?: Question[]
  choices?: Choice[]
}

const SECRET_TOKEN_RE = /\{\{secret:[0-9a-f-]{36}\}\}/

/** Validate a single field value. Returns error message or empty string. */
function validateField(question: Question, value: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const trimmed = value.trim()
  if (question.required !== false && !trimmed) return t('userInput.required')
  if (!trimmed) return ''
  if (question.minLength != null && trimmed.length < question.minLength) {
    return t('userInput.minLength', { min: question.minLength })
  }
  if (question.maxLength != null && trimmed.length > question.maxLength) {
    return t('userInput.maxLength', { max: question.maxLength })
  }
  if (question.pattern) {
    try {
      const re = new RegExp(question.pattern)
      if (!re.test(trimmed)) return question.patternMessage ?? t('userInput.invalidFormat')
    } catch {
      // 逻辑：正则无效时跳过校验
    }
  }
  return ''
}

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
  error,
}: {
  question: Question
  value: string
  onChange: (value: string) => void
  disabled: boolean
  error?: string
}) {
  const fieldType = question.type ?? 'text'
  const hasError = Boolean(error)

  const errorHint = hasError ? (
    <div className="text-[11px] text-destructive">{error}</div>
  ) : null

  const fieldBorderCls = hasError
    ? 'border-destructive'
    : 'border-border/60'

  const { t } = useTranslation('ai')
  const placeholderText = question.placeholder
    ?? (question.defaultValue ? t('userInput.defaultPrefix', { value: question.defaultValue }) : undefined)

  if (fieldType === 'select' && question.options?.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-muted-foreground">
          {question.label}
          {question.required !== false ? <span className="text-destructive">*</span> : null}
        </label>
        <select
          value={value}
          disabled={disabled}
          className={cn(
            'h-8 w-full rounded-md border bg-transparent px-2.5 text-xs text-foreground',
            'outline-none focus-visible:border-foreground/30',
            'disabled:cursor-not-allowed disabled:opacity-40',
            fieldBorderCls,
          )}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t('userInput.selectPlaceholder')}</option>
          {question.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {errorHint}
      </div>
    )
  }

  if (fieldType === 'textarea') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-muted-foreground">
          {question.label}
          {question.required !== false ? <span className="text-destructive">*</span> : null}
        </label>
        <textarea
          value={value}
          placeholder={placeholderText}
          disabled={disabled}
          rows={3}
          maxLength={question.maxLength}
          className={cn(
            'w-full rounded-md border bg-transparent px-2.5 py-2 text-xs text-foreground',
            'outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30',
            'disabled:cursor-not-allowed disabled:opacity-40',
            'resize-y',
            fieldBorderCls,
          )}
          onChange={(e) => onChange(e.target.value)}
        />
        {errorHint}
      </div>
    )
  }

  const htmlInputType = fieldType === 'secret'
    ? 'password'
    : (question.inputType ?? 'text')

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-foreground/80">
        {question.label}
        {question.required !== false ? <span className="text-destructive">*</span> : null}
      </label>
      <input
        type={htmlInputType}
        value={value}
        placeholder={placeholderText}
        disabled={disabled}
        maxLength={question.maxLength}
        className={cn(
          'h-8 w-full rounded-md border bg-transparent px-2.5 text-xs text-foreground',
          'outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30',
          'disabled:cursor-not-allowed disabled:opacity-40',
          fieldBorderCls,
        )}
        onChange={(e) => onChange(e.target.value)}
      />
      {errorHint}
    </div>
  )
}

/** Render a single choice step (single or multi select). */
function ChoiceStep({
  choice,
  selected,
  onChange,
  disabled,
  onAutoAdvance,
}: {
  choice: Choice
  selected: string | string[]
  onChange: (value: string | string[]) => void
  disabled: boolean
  onAutoAdvance?: () => void
}) {
  const { t } = useTranslation('ai')
  const isMulti = choice.multiSelect === true
  const selectedSet = new Set(Array.isArray(selected) ? selected : selected ? [selected] : [])

  const handleToggle = (label: string) => {
    if (disabled) return
    if (isMulti) {
      const next = new Set(selectedSet)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      onChange(Array.from(next))
    } else {
      const newValue = selectedSet.has(label) ? '' : label
      onChange(newValue)
      if (newValue && onAutoAdvance) {
        setTimeout(onAutoAdvance, 280)
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-foreground">
        {choice.question}
        {isMulti ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">({t('userInput.multiSelect')})</span> : null}
      </div>
      <div className="flex flex-col gap-1">
        {choice.options?.map((opt, idx) => {
          const isSelected = selectedSet.has(opt.label)
          return (
            <button
              key={`${opt.label}-${idx}`}
              type="button"
              disabled={disabled}
              onClick={() => handleToggle(opt.label)}
              className={cn(
                styles.choiceOption,
                isSelected && styles.choiceOptionSelected,
              )}
            >
              {isSelected ? (
                <span className={styles.choiceCheck}>
                  <CheckIcon className="size-2.5" />
                </span>
              ) : null}
              <span className="text-xs font-medium text-foreground">{opt.label}</span>
              {opt.description ? (
                <span className="text-[11px] leading-tight text-muted-foreground">{opt.description}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Wizard component for step-by-step choice mode. */
function ChoiceWizard({
  choices,
  selections,
  onSelectionChange,
  disabled,
  errors,
  step,
  onStepChange,
}: {
  choices: Choice[]
  selections: Record<string, string | string[]>
  onSelectionChange: (key: string, value: string | string[]) => void
  disabled: boolean
  errors: Record<string, string>
  step: number
  onStepChange: (step: number) => void
}) {
  const total = choices.length
  const isLastStep = step >= total - 1
  const current = choices[step]

  const goNext = React.useCallback(() => {
    if (!isLastStep) onStepChange(step + 1)
  }, [isLastStep, step, onStepChange])

  if (!current) return null

  return (
    <div className="flex flex-col gap-3">
      <ChoiceStep
        key={step}
        choice={current}
        selected={selections[current.key] ?? (current.multiSelect ? [] : '')}
        onChange={(v) => onSelectionChange(current.key, v)}
        disabled={disabled}
        onAutoAdvance={!isLastStep && !current.multiSelect ? goNext : undefined}
      />

      {errors[current.key] ? (
        <div className="mt-1.5 text-[11px] text-destructive">{errors[current.key]}</div>
      ) : null}

      {/* Step indicator – hidden when there's only one step */}
      {total > 1 ? (
        <div className="flex items-center gap-1">
          {choices.map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              onClick={() => onStepChange(i)}
              className={cn(
                styles.stepDot,
                i === step
                  ? styles.stepDotActive
                  : i < step
                    ? styles.stepDotDone
                    : styles.stepDotPending,
              )}
            />
          ))}
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
            {step + 1}/{total}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** Render AskUserQuestion tool UI. */
export default function RequestUserInputTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { messages } = useChatMessages()
  const { status } = useChatStatus()
  const { updateMessage, addToolApprovalResponse } = useChatActions()
  const {
    toolParts,
    upsertToolPart,
    queueToolApprovalPayload,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
  } = useChatTools()
  const { sessionId } = useChatSession()
  const { t } = useTranslation('ai')

  /** Synthetic approval id for legacy input-available parts. */
  const syntheticApprovalIdRef = React.useRef<string | null>(null)
  const approvalId = getApprovalId(part)
  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const isRejected = part.approval?.approved === false
  const isApproved = part.approval?.approved === true
  const hasOutput = part.output != null
  const isStreaming = isToolStreaming(part)
  const isApprovalPendingForPart = isApprovalPending(part)
  // 逻辑：根据 tool 状态映射 macOS 标题栏红绿灯状态
  const windowState =
    part.state === 'output-error'
      ? 'error'
      : isStreaming
        ? 'running'
        : part.state === 'output-available'
          ? 'success'
          : 'idle'

  const normalizedInput = normalizeToolInput(part.input)
  const inputObject = asPlainObject(normalizedInput) as RequestUserInputInput | null
  const questions: Question[] = Array.isArray(inputObject?.questions) ? inputObject!.questions : []
  const choices: Choice[] = Array.isArray(inputObject?.choices) ? inputObject!.choices : []
  // TODO: form 模式仅用于兼容历史数据（旧版 questions 字段），新版工具只有 choices。历史数据清理后可删除 form 相关代码。
  const mode = choices.length > 0 ? 'choice' : 'form'
  const formTitle = inputObject?.title
  const formDescription = inputObject?.description

  // 逻辑：历史数据从 output.answers 读取已提交的答案
  const savedAnswers = asPlainObject((part.output as any)?.answers) ?? {}
  const isError = part.state === 'output-error'
  const isReadonly = isRejected || isApproved || hasOutput || isError

  const [answers, setAnswers] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    if (mode === 'form') {
      for (const q of questions) {
        initial[q.key] = (savedAnswers[q.key] as string) ?? q.defaultValue ?? ''
      }
    }
    return initial
  })

  // 逻辑：choice 模式的选中状态
  const [selections, setSelections] = React.useState<Record<string, string | string[]>>(() => {
    const initial: Record<string, string | string[]> = {}
    if (mode === 'choice') {
      for (const c of choices) {
        const saved = savedAnswers[c.key] as string | undefined
        if (c.multiSelect && saved) {
          initial[c.key] = saved.split(',').filter(Boolean)
        } else {
          initial[c.key] = saved ?? ''
        }
      }
    }
    return initial
  })

  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [choiceStep, setChoiceStep] = React.useState(0)
  const [touched, setTouched] = React.useState(false)

  /** Ensure this tool part has an approval id and approval-requested state. */
  const ensureApprovalRequested = React.useCallback((): string | undefined => {
    if (!toolCallId || !isApprovalPendingForPart) return approvalId
    if (approvalId) return approvalId
    if (syntheticApprovalIdRef.current) return syntheticApprovalIdRef.current

    // 缺失 approvalId 的 input-available 统一补齐为 approval-requested。
    const nextApprovalId = `aitxt-${crypto.randomUUID()}`
    syntheticApprovalIdRef.current = nextApprovalId

    const currentSnapshot = toolParts[toolCallId] ?? part
    const snapshotState = typeof currentSnapshot?.state === 'string' ? currentSnapshot.state : ''
    const nextSnapshot = {
      ...currentSnapshot,
      state: snapshotState === 'input-available' || !snapshotState
        ? 'approval-requested'
        : snapshotState,
      approval: { ...(currentSnapshot.approval ?? {}), id: nextApprovalId },
    }
    upsertToolPart(toolCallId, nextSnapshot as any)

    const nextMessages = messages ?? []
    for (const message of nextMessages) {
      const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : []
      const hasTarget = parts.some((c: any) => c?.toolCallId === toolCallId)
      if (!hasTarget) continue
      const nextParts = parts.map((c: any) => {
        if (c?.toolCallId !== toolCallId) return c
        const currentState = typeof c?.state === 'string' ? c.state : ''
        const nextState = currentState === 'input-available' || !currentState
          ? 'approval-requested'
          : currentState
        return {
          ...c,
          state: nextState,
          approval: c.approval ? { ...c.approval, id: nextApprovalId } : { id: nextApprovalId },
        }
      })
      updateMessage(message.id, { parts: nextParts })
      break
    }

    return nextApprovalId
  }, [toolCallId, isApprovalPendingForPart, approvalId, toolParts, part, messages, updateMessage, upsertToolPart])

  React.useEffect(() => {
    if (!approvalId && isApprovalPendingForPart) {
      ensureApprovalRequested()
    }
  }, [approvalId, isApprovalPendingForPart, ensureApprovalRequested])

  // 逻辑：用户修改字段后实时清除对应错误
  const handleFieldChange = React.useCallback((key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    if (touched) {
      setErrors((prev) => {
        const q = questions.find((item) => item.key === key)
        if (!q) return prev
        const err = validateField(q, value, t)
        if (!err) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return { ...prev, [key]: err }
      })
    }
  }, [questions, touched])

  const handleSelectionChange = React.useCallback((key: string, value: string | string[]) => {
    setSelections((prev) => ({ ...prev, [key]: value }))
  }, [])

  /** Validate all fields and return true if valid. */
  const validateAll = React.useCallback(() => {
    if (mode === 'choice') {
      const nextErrors: Record<string, string> = {}
      for (const c of choices) {
        const sel = selections[c.key]
        const isEmpty = Array.isArray(sel) ? sel.length === 0 : !sel
        if (isEmpty) nextErrors[c.key] = t('userInput.selectAtLeastOne')
      }
      setErrors(nextErrors)
      return Object.keys(nextErrors).length === 0
    }
    const nextErrors: Record<string, string> = {}
    for (const q of questions) {
      const err = validateField(q, answers[q.key] ?? '', t)
      if (err) nextErrors[q.key] = err
    }
    setErrors(nextErrors)
    setTouched(true)
    return Object.keys(nextErrors).length === 0
  }, [mode, questions, answers, choices, selections])

  const updateApprovalMutation = useMutation({
    ...trpc.chat.updateMessageParts.mutationOptions(),
  })

  /** Store secret values on the server and get placeholder tokens. */
  const storeSecretMutation = useMutation({
    ...trpc.ai.storeSecret.mutationOptions(),
  })

  const updateApprovalInMessages = React.useCallback(
    (
      approved: boolean,
      approvalIdOverride?: string,
      outputOverride?: Record<string, string>,
    ) => {
      const resolvedApprovalId = approvalIdOverride ?? approvalId
      const nextMessages = messages ?? []
      for (const message of nextMessages) {
        const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : []
        // 逻辑：优先通过 approvalId 查找，fallback 到 toolCallId（用于 input-available 状态）
        const hasTargetByApproval = resolvedApprovalId
          ? parts.some((c: any) => c?.approval?.id === resolvedApprovalId)
          : false
        const hasTargetByToolCall = parts.some((c: any) => c?.toolCallId === toolCallId)
        if (!hasTargetByApproval && !hasTargetByToolCall) continue
        const nextParts = parts.map((c: any) => {
          if (hasTargetByApproval) {
            if (c?.approval?.id !== resolvedApprovalId) return c
          } else if (c?.toolCallId !== toolCallId) {
            return c
          }
          // 逻辑：如果已有 approval 则更新，否则创建新的 approval 对象
          const nextApprovalId = resolvedApprovalId
            ?? (c?.approval?.id as string | undefined)
            ?? `aitxt-${crypto.randomUUID()}`
          const nextState = approved
            ? (outputOverride ? 'output-available' : 'approval-responded')
            : 'output-denied'
          const nextOutput = outputOverride
            ? { ...(c as any)?.output, answers: outputOverride }
            : (c as any)?.output
          return {
            ...c,
            state: nextState,
            approval: c.approval
              ? { ...c.approval, id: nextApprovalId, approved }
              : { id: nextApprovalId, approved },
            ...(outputOverride ? { output: nextOutput } : {}),
          }
        })
        updateMessage(message.id, { parts: nextParts })
        return { messageId: message.id, nextParts }
      }
      return null
    },
    [messages, updateMessage, approvalId, toolCallId],
  )

  const updateApprovalSnapshot = React.useCallback(
    (
      approved: boolean,
      approvalIdOverride?: string,
      outputOverride?: Record<string, string>,
    ) => {
      const resolvedApprovalId = approvalIdOverride ?? approvalId
      let updated = false
      for (const [toolKey, toolPart] of Object.entries(toolParts)) {
        if (resolvedApprovalId && toolPart?.approval?.id !== resolvedApprovalId) continue
        if (!resolvedApprovalId && toolPart?.toolCallId !== toolCallId) continue
        const nextApprovalId = resolvedApprovalId
          ?? (toolPart?.approval?.id as string | undefined)
          ?? `aitxt-${crypto.randomUUID()}`
        const nextState = approved
          ? (outputOverride ? 'output-available' : 'approval-responded')
          : 'output-denied'
        upsertToolPart(toolKey, {
          ...toolPart,
          state: nextState,
          approval: toolPart.approval
            ? { ...toolPart.approval, id: nextApprovalId, approved }
            : { id: nextApprovalId, approved },
          ...(outputOverride
            ? { output: { ...(toolPart as any)?.output, answers: outputOverride } }
            : {}),
        })
        updated = true
        break
      }
      if (!updated && toolCallId) {
        const nextApprovalId = resolvedApprovalId ?? `aitxt-${crypto.randomUUID()}`
        const nextState = approved
          ? (outputOverride ? 'output-available' : 'approval-responded')
          : 'output-denied'
        upsertToolPart(toolCallId, {
          ...(part as any),
          state: nextState,
          approval: (part as any)?.approval
            ? { ...(part as any).approval, id: nextApprovalId, approved }
            : { id: nextApprovalId, approved },
          ...(outputOverride
            ? { output: { ...((part as any)?.output ?? {}), answers: outputOverride } }
            : {}),
        })
      }
    },
    [toolParts, upsertToolPart, approvalId, toolCallId, part],
  )

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const isActionDisabled =
    isSubmitting ||
    isReadonly ||
    status === 'submitted' ||
    (status === 'streaming' && !isApprovalPendingForPart)

  const handleSubmit = React.useCallback(async () => {
    if (!toolCallId || isActionDisabled) return
    if (!validateAll()) return
    setIsSubmitting(true)
    try {
      let finalAnswers: Record<string, string> = {}

      if (mode === 'form') {
        for (const q of questions) {
          const value = answers[q.key] ?? ''
          if (q.type === 'secret' && value) {
            const data = await storeSecretMutation.mutateAsync({ value })
            finalAnswers[q.key] = data.token
          } else {
            finalAnswers[q.key] = value
          }
        }
      } else {
        // choice 模式：将选中项序列化为字符串
        for (const c of choices) {
          const sel = selections[c.key]
          finalAnswers[c.key] = Array.isArray(sel) ? sel.join(',') : (sel as string)
        }
      }

      const resolvedApprovalId = ensureApprovalRequested()
      queueToolApprovalPayload(toolCallId, { answers: finalAnswers })
      updateApprovalSnapshot(true, resolvedApprovalId, finalAnswers)
      const approvalUpdate = updateApprovalInMessages(true, resolvedApprovalId, finalAnswers)

      if (resolvedApprovalId) {
        await addToolApprovalResponse({ id: resolvedApprovalId, approved: true })
      }
      await continueAfterToolApprovals()
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
    toolCallId,
    isActionDisabled,
    validateAll,
    mode,
    questions,
    answers,
    choices,
    selections,
    updateApprovalSnapshot,
    updateApprovalInMessages,
    storeSecretMutation,
    ensureApprovalRequested,
    queueToolApprovalPayload,
    approvalId,
    addToolApprovalResponse,
    continueAfterToolApprovals,
    updateApprovalMutation,
    sessionId,
  ])

  const handleSkip = React.useCallback(async () => {
    if (isSubmitting || isReadonly) return
    setIsSubmitting(true)
    const resolvedApprovalId = ensureApprovalRequested()
    updateApprovalSnapshot(false, resolvedApprovalId)
    const approvalUpdate = updateApprovalInMessages(false, resolvedApprovalId)
    try {
      if (resolvedApprovalId) {
        await addToolApprovalResponse({ id: resolvedApprovalId, approved: false })
      }
      clearToolApprovalPayload(toolCallId)
      await continueAfterToolApprovals()
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
    ensureApprovalRequested,
    approvalId,
    addToolApprovalResponse,
    clearToolApprovalPayload,
    continueAfterToolApprovals,
    updateApprovalMutation,
    sessionId,
    toolCallId,
  ])

  const toolTitle = getToolName(part)

  /** Render compact summary when structured fields are missing. */
  const renderCompactSummary = () => {
    const useSaved = Object.keys(savedAnswers).length > 0
    const source = useSaved
      ? savedAnswers
      : mode === 'choice'
        ? selections
        : answers
    const entries: Array<{ key: string; label: string; value: string }> = []
    for (const [key, raw] of Object.entries(source)) {
      const label =
        questions.find((q) => q.key === key)?.label
        ?? choices.find((c) => c.key === key)?.question
        ?? key
      const rawValue = Array.isArray(raw) ? raw.join('、') : String(raw ?? '')
      const value = rawValue
        ? (maskIfSecret(rawValue))
        : '—'
      entries.push({ key, label, value })
    }
    if (entries.length === 0) {
      return <div className="text-[11px] text-muted-foreground">{t('userInput.noContent')}</div>
    }
    return (
      <div className="flex flex-col gap-2">
        {entries.map((item, index) => (
          <div key={`${item.key}-${index}`} className="flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground">{item.label}</span>
            <span className="text-xs text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    )
  }

  // 逻辑：choice 模式只读时的渲染
  const renderChoiceReadonly = () => (
    <div className="flex flex-col gap-3">
      {choices.map((c, idx) => {
        const sel = savedAnswers[c.key] as string | undefined
        return (
          <div key={c.key || `choice-ro-${idx}`} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{c.question}</span>
            <span className="text-xs text-foreground">{sel || '—'}</span>
          </div>
        )
      })}
    </div>
  )

  // 逻辑：form 模式只读时的渲染
  const renderFormReadonly = () => (
    <div className="flex flex-col gap-3">
      {questions.map((q, idx) => {
        const displayValue = q.type === 'secret'
          ? '••••••'
          : maskIfSecret(String(savedAnswers[q.key] ?? answers[q.key] ?? ''))
        return (
          <div key={q.key || `question-ro-${idx}`} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{q.label}</span>
            <span className="text-xs text-foreground">{displayValue || '—'}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <Tool
      open
      className={cn(
        'max-w-md min-w-0 text-xs overflow-hidden rounded-lg border border-border/60 bg-card text-foreground',
        className,
        isStreaming && 'openloaf-tool-streaming',
      )}
    >
      {/* ── Title bar ── */}
      <div className="flex w-full items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
        <TrafficLights state={windowState} />
        <span className="truncate text-[11px] text-muted-foreground">
          {formTitle || toolTitle}
        </span>
      </div>

      <ToolContent className="space-y-0 p-0 text-xs">
        {/* TODO: description 已从工具定义中移除，保留兼容历史数据渲染，后续可删除 */}
        {!formTitle && formDescription ? (
          <div className="px-3 pt-2.5 pb-0.5">
            <div className="text-[11px] leading-relaxed text-muted-foreground">{formDescription}</div>
          </div>
        ) : null}

        {/* ── Content area ── */}
        <div className="px-3 py-2.5">
          {isError ? (
            <div className="text-[11px] text-destructive">{t('userInput.paramError')}</div>
          ) : isRejected ? (
            <div className="text-[11px] text-muted-foreground">{t('userInput.skipped')}</div>
          ) : isReadonly ? (
            mode === 'choice'
              ? (choices.length > 0 ? renderChoiceReadonly() : renderCompactSummary())
              : (questions.length > 0 ? renderFormReadonly() : renderCompactSummary())
          ) : mode === 'choice' ? (
            <ChoiceWizard
              choices={choices}
              selections={selections}
              onSelectionChange={handleSelectionChange}
              disabled={isActionDisabled}
              errors={errors}
              step={choiceStep}
              onStepChange={setChoiceStep}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {questions.map((q, idx) => (
                <QuestionField
                  key={q.key || `question-${idx}`}
                  question={q}
                  value={answers[q.key] ?? ''}
                  onChange={(v) => handleFieldChange(q.key, v)}
                  disabled={isActionDisabled}
                  error={errors[q.key]}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Action bar ── */}
        {!isReadonly && !isRejected ? (
          <div className="flex items-center gap-1.5 border-t border-border/40 px-3 py-2">
            {mode === 'choice' && choices.length > 1 ? (
              <div className="flex items-center gap-1">
                {choiceStep > 0 ? (
                  <button
                    type="button"
                    onClick={() => setChoiceStep((s) => s - 1)}
                    className={cn(styles.actionButton, styles.secondaryButton)}
                  >
                    <ChevronLeftIcon className="size-3" />
                    {t('userInput.prevStep')}
                  </button>
                ) : null}
                {choiceStep < choices.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setChoiceStep((s) => s + 1)}
                    className={cn(styles.actionButton, styles.secondaryButton)}
                  >
                    {t('userInput.nextStep')}
                    <ChevronRightIcon className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={handleSkip}
                className={cn(styles.actionButton, styles.secondaryButton)}
              >
                {t('userInput.skip')}
              </button>
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={handleSubmit}
                className={cn(styles.actionButton, styles.primaryButton)}
              >
                {isSubmitting ? t('userInput.confirming') : t('userInput.confirm')}
              </button>
            </div>
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  )
}
