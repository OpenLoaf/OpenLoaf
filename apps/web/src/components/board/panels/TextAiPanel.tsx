/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * TextAiPanel — AI panel for text nodes on the canvas.
 *
 * Unlike media panels (image/video/audio) that use SaaS v3 capabilities,
 * this panel uses local feature definitions + Board Agent + chat models.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Check, Copy, Film, GitBranch, Loader2, Mic, Square, X } from 'lucide-react'
import type { CanvasNodeElement } from '../engine/types'
import type { TextNodeProps } from '../nodes/text-node-types'
import type { UpstreamData } from '../engine/upstream-data'
import {
  BOARD_GENERATE_INPUT,
} from '../ui/board-style-system'
import { TEXT_FEATURES, getApplicableFeatures, getTextFeature } from './text-features'
import { TextFeatureTabBar } from './shared/TextFeatureTabBar'
import { useTextModelOptions } from './hooks/useTextModelOptions'
import { useTextStream, type BoardAgentRequestBody } from './hooks/useTextStream'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextGenerateParams = {
  featureId: string
  instruction: string
  chatModelId: string
  chatModelSource: 'local' | 'cloud'
  upstreamText?: string
  skillContents?: { name: string; content: string }[]
}

export type TextAiPanelProps = {
  element: CanvasNodeElement<TextNodeProps>
  upstream: UpstreamData | null
  onApplyReplace: (text: string) => void
  onApplyDerive: (text: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** AI text generation panel displayed below text nodes. */
export function TextAiPanel({
  upstream,
  onApplyReplace,
  onApplyDerive,
}: TextAiPanelProps) {
  const { t } = useTranslation('board')

  // ── Feature selection ──
  const applicableFeatures = useMemo(
    () => getApplicableFeatures(upstream),
    [upstream],
  )
  const [selectedFeatureId, setSelectedFeatureId] = useState(
    () => applicableFeatures[0]?.id ?? TEXT_FEATURES[0].id,
  )

  // Auto-update selected feature when applicability changes
  useEffect(() => {
    if (applicableFeatures.some((f) => f.id === selectedFeatureId)) return
    if (applicableFeatures.length > 0) {
      setSelectedFeatureId(applicableFeatures[0].id)
    }
  }, [applicableFeatures, selectedFeatureId])

  const selectedFeature = getTextFeature(selectedFeatureId)
  const outputMode = selectedFeature?.outputMode ?? 'replace'

  // ── Model selection ──
  const { modelOptions, chatModelSource } = useTextModelOptions(
    selectedFeature?.requiredModelTags,
  )
  const [selectedModelId, setSelectedModelId] = useState('auto')

  // ── Instruction input ──
  const [instruction, setInstruction] = useState('')

  // ── Stream state ──
  const stream = useTextStream()

  // ── Upstream text ──
  const upstreamText = useMemo(
    () => upstream?.textList.join('\n') || undefined,
    [upstream],
  )

  // ── Generate handler ──
  const canGenerate = instruction.trim().length > 0 && !stream.isStreaming

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return
    const body: BoardAgentRequestBody = {
      featureId: selectedFeatureId,
      instruction: instruction.trim(),
      upstreamText,
      upstreamImages: upstream?.imageList.length ? upstream.imageList : undefined,
      upstreamVideos: upstream?.videoList.length ? upstream.videoList : undefined,
      upstreamAudios: upstream?.audioList.length ? upstream.audioList : undefined,
      chatModelId: selectedModelId === 'auto' ? undefined : selectedModelId,
      chatModelSource,
    }
    stream.startStream(body)
  }, [canGenerate, selectedFeatureId, instruction, upstreamText, upstream, selectedModelId, chatModelSource, stream])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleGenerate()
      }
    },
    [handleGenerate],
  )

  // ── Apply / discard ──
  const handleApply = useCallback(() => {
    if (!stream.text) return
    if (outputMode === 'derive') {
      onApplyDerive(stream.text)
    } else {
      onApplyReplace(stream.text)
    }
    stream.clear()
    setInstruction('')
  }, [stream, outputMode, onApplyReplace, onApplyDerive])

  const handleDerive = useCallback(() => {
    if (!stream.text) return
    onApplyDerive(stream.text)
    stream.clear()
    setInstruction('')
  }, [stream, onApplyDerive])

  const handleDiscard = useCallback(() => {
    stream.abort()
    stream.clear()
  }, [stream])

  const handleCopy = useCallback(() => {
    if (stream.text) {
      void navigator.clipboard.writeText(stream.text)
    }
  }, [stream.text])

  // ── No model available warning ──
  const noModelAvailable =
    modelOptions.length === 0 &&
    (selectedFeature?.requiredModelTags?.length ?? 0) > 0

  // ── Result visible ──
  const hasResult = stream.text.length > 0 || stream.isStreaming || stream.error

  return (
    <div className="flex w-[420px] flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-lg">
      {/* ── Feature Tabs ── */}
      <TextFeatureTabBar
        features={applicableFeatures}
        selectedFeatureId={selectedFeatureId}
        onSelect={(id) => {
          setSelectedFeatureId(id)
          stream.clear()
        }}
        disabled={stream.isStreaming}
      />

      {/* ── Upstream Preview ── */}
      {upstreamText || upstream?.imageList.length || upstream?.videoList.length || upstream?.audioList.length ? (
        <div className="flex flex-col gap-2">
          {/* Text preview */}
          {upstreamText ? (
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('textPanel.upstreamPreview')}
              </label>
              <div className="relative max-h-[120px] overflow-hidden rounded-2xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                {upstreamText}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-muted/50 to-transparent" />
              </div>
            </div>
          ) : null}
          {/* Image thumbnails */}
          {upstream?.imageList.length ? (
            <div className="flex flex-wrap gap-1.5">
              {upstream.imageList.slice(0, 4).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-[60px] w-[60px] rounded-xl border border-border object-cover"
                />
              ))}
              {upstream.imageList.length > 4 ? (
                <div className="flex h-[60px] w-[60px] items-center justify-center rounded-xl border border-border bg-muted/50 text-xs text-muted-foreground">
                  +{upstream.imageList.length - 4}
                </div>
              ) : null}
            </div>
          ) : null}
          {/* Video files */}
          {upstream?.videoList.length ? (
            <div className="flex flex-wrap gap-1.5">
              {upstream.videoList.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                >
                  <Film size={12} />
                  <span className="max-w-[120px] truncate">{p.split('/').pop()}</span>
                </div>
              ))}
            </div>
          ) : null}
          {/* Audio files */}
          {upstream?.audioList.length ? (
            <div className="flex flex-wrap gap-1.5">
              {upstream.audioList.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                >
                  <Mic size={12} />
                  <span className="max-w-[120px] truncate">{p.split('/').pop()}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── No model warning ── */}
      {noModelAvailable ? (
        <div className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t('textPanel.noModelForFeature')}
        </div>
      ) : null}

      {/* ── Instruction Input ── */}
      <textarea
        className={[
          'min-h-[60px] w-full resize-none rounded-2xl border px-3 py-2 text-sm leading-relaxed',
          BOARD_GENERATE_INPUT,
        ].join(' ')}
        placeholder={
          selectedFeature?.placeholderKey
            ? t(selectedFeature.placeholderKey)
            : t('textPanel.instructionPlaceholder')
        }
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={stream.isStreaming}
      />

      {/* ── Bottom Bar: Model + Generate ── */}
      <div className="flex items-center justify-between gap-2">
        <select
          className={[
            'max-w-[180px] truncate rounded-3xl border px-2.5 py-1.5 text-xs',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          disabled={stream.isStreaming}
        >
          <option value="auto">{t('textPanel.autoRecommend')}</option>
          {modelOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.providerName} / {opt.modelId}
            </option>
          ))}
        </select>

        {stream.isStreaming ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors duration-150 hover:bg-destructive/90"
            onClick={stream.abort}
            title={t('textPanel.stop')}
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canGenerate}
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors duration-150',
              'bg-foreground text-background',
              !canGenerate ? 'cursor-not-allowed opacity-50' : 'hover:bg-foreground/90',
            ].join(' ')}
            onClick={handleGenerate}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>

      {/* ── Result Preview ── */}
      {hasResult ? (
        <div className="flex flex-col gap-2">
          <div className="relative max-h-[200px] overflow-y-auto rounded-2xl bg-muted/50 p-3 text-sm leading-relaxed">
            {stream.isStreaming && !stream.text ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">{t('textPanel.generating')}</span>
              </div>
            ) : null}
            {stream.text ? (
              <div className="whitespace-pre-wrap text-foreground">{stream.text}</div>
            ) : null}
            {stream.error ? (
              <div className="text-xs text-destructive">{stream.error}</div>
            ) : null}
          </div>

          {/* Action buttons — only when stream is done and has text */}
          {!stream.isStreaming && stream.text ? (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-3xl px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 dark:hover:bg-foreground/10"
                onClick={handleCopy}
                title={t('textPanel.copy')}
              >
                <Copy size={12} />
                {t('textPanel.copy')}
              </button>
              {outputMode === 'replace' ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-3xl px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 dark:hover:bg-foreground/10"
                  onClick={handleDerive}
                  title={t('textPanel.derive')}
                >
                  <GitBranch size={12} />
                  {t('textPanel.derive')}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-3xl px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 dark:hover:bg-foreground/10"
                onClick={handleDiscard}
              >
                <X size={12} />
                {t('textPanel.discard')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-3xl bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors duration-150 hover:bg-foreground/90"
                onClick={handleApply}
              >
                <Check size={12} />
                {t('textPanel.apply')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
