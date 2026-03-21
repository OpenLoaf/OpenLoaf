/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Sparkles, Wand2 } from 'lucide-react'
import type { CanvasNodeElement } from '../engine/types'
import type { TextNodeProps } from '../nodes/TextNode'
import {
  BOARD_GENERATE_INPUT,
} from '../ui/board-style-system'

/** Fallback model options used when no cloud models are available. */
const FALLBACK_MODEL_OPTIONS = [
  { id: 'auto', label: '' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
] as const

export type TextGenerateParams = {
  instruction: string
  modelId: string
}

export type TextAiPanelProps = {
  element: CanvasNodeElement<TextNodeProps>
  upstreamText?: string
  onGenerate: (params: TextGenerateParams) => void
}

/** AI text operation panel displayed below text nodes with upstream text connections. */
export function TextAiPanel({
  element,
  upstreamText,
  onGenerate,
}: TextAiPanelProps) {
  const { t } = useTranslation('board')

  const [instruction, setInstruction] = useState('')
  const [modelId, setModelId] = useState('auto')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = useCallback(() => {
    if (isGenerating || !instruction.trim()) return
    setIsGenerating(true)
    onGenerate({ instruction, modelId })
    // Reset generating state after a short delay (actual task tracking is done elsewhere).
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, instruction, modelId, onGenerate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleGenerate()
      }
    },
    [handleGenerate],
  )

  return (
    <div className="flex w-[420px] flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-lg">
      {/* -- Upstream Text Preview -- */}
      {upstreamText ? (
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('textPanel.upstreamPreview')}
          </label>
          <div className="relative max-h-[200px] overflow-hidden rounded-3xl bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
            {upstreamText}
            {/* Gradient fade at the bottom */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-muted/50 to-transparent" />
          </div>
        </div>
      ) : null}

      {/* -- AI Instruction -- */}
      <div className="flex flex-col gap-1.5">
        <textarea
          className={[
            'min-h-[72px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          placeholder={t('textPanel.instructionPlaceholder')}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
      </div>

      {/* -- Bottom Bar -- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <select
            className={[
              'rounded-3xl border px-2.5 py-1.5 text-xs',
              BOARD_GENERATE_INPUT,
            ].join(' ')}
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            {FALLBACK_MODEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id === 'auto' ? t('textPanel.autoRecommend') : opt.label}
              </option>
            ))}
          </select>

          {/* Translate shortcut */}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-3xl px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 dark:hover:bg-foreground/10"
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setInstruction(t('textPanel.translate'))
            }}
          >
            <Wand2 size={12} />
            {t('textPanel.translate')}
          </button>

          {/* Credits placeholder */}
          <span className="text-xs text-muted-foreground">
            <Sparkles size={12} className="mr-0.5 inline-block" />
          </span>
        </div>

        {/* Send button */}
        <button
          type="button"
          disabled={isGenerating || !instruction.trim()}
          className={[
            'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors duration-150',
            'bg-foreground text-background',
            (isGenerating || !instruction.trim())
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-foreground/90',
          ].join(' ')}
          onClick={handleGenerate}
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  )
}
