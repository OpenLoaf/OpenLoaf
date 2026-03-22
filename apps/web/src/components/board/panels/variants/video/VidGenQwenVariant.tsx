/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { BOARD_GENERATE_INPUT } from '../../../ui/board-style-system'
import {
  VIDEO_GENERATE_DURATION_OPTIONS,
  VIDEO_GENERATE_STYLE_SUGGESTIONS,
} from '../../../nodes/node-config'
import type { VariantFormProps } from '../types'
import { MediaSlot, PillSelect, UpstreamTextBadge, toMediaInput } from '../shared'

/**
 * vid-gen-qwen (百炼视频) variant form.
 *
 * Requires a first-frame image (startImage) -- pure text-to-video is NOT supported.
 * Params: prompt, style, upstreamModelId, duration, withAudio.
 */
export function VidGenQwenVariant({
  variant,
  upstream,
  nodeResourceUrl,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(upstream.textContent ?? '')
  const [style, setStyle] = useState('')
  const [duration, setDuration] = useState<(typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]>(5)
  const [withAudio, setWithAudio] = useState(false)

  // Manual upload for first frame (only if no upstream source)
  const [manualFirstFrame, setManualFirstFrame] = useState<string | undefined>()

  // For display (resolved URL)
  const upstreamFirstFrame = upstream.images?.[0] ?? nodeResourceUrl
  const firstFrameUrl = upstreamFirstFrame ?? manualFirstFrame
  const hasFirstFrame = Boolean(firstFrameUrl)

  // For API submission (raw path)
  const upstreamFirstFramePath = upstream.imagePaths?.[0]
  const firstFramePath = upstreamFirstFramePath ?? manualFirstFrame

  // Report warning when first frame is missing (required for this variant)
  useEffect(() => {
    onWarningChange?.(!hasFirstFrame
      ? t('v3.fields.firstFrameRequired', { defaultValue: 'Connect an image node (required)' })
      : null)
  }, [hasFirstFrame, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (firstFramePath) {
      inputs.startImage = toMediaInput(firstFramePath)
    }

    onParamsChange({
      inputs,
      params: {
        prompt,
        style: style || undefined,
        duration,
        withAudio: withAudio || undefined,
      },
    })
  }, [prompt, style, duration, withAudio, firstFramePath, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* First-frame slot (REQUIRED) */}
      <div className="flex items-end gap-2">
        <MediaSlot
          label={t('v3.fields.firstFrame', { defaultValue: 'First Frame' })}
          icon={<ImagePlus size={16} />}
          src={firstFrameUrl}
          required
          disabled={disabled}
          boardId={upstream.boardId}
          projectId={upstream.projectId}
          boardFolderUri={upstream.boardFolderUri}
          onUpload={!upstreamFirstFrame
            ? (value) => setManualFirstFrame(value)
            : undefined}
          onRemove={manualFirstFrame
            ? () => setManualFirstFrame(undefined)
            : undefined}
        />
      </div>

      {/* Prompt */}
      <div className="flex flex-col gap-1">
        {upstream.textContent ? <UpstreamTextBadge text={upstream.textContent} /> : null}
        <textarea
          className={[
            'min-h-[68px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
          placeholder={t('v3.fields.promptPlaceholder', { defaultValue: 'Describe the video you want to generate...' })}
          value={prompt}
          onChange={(e) => !disabled && setPrompt(e.target.value)}
          readOnly={disabled}
          rows={3}
        />
      </div>

      {/* Style */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          {t('v3.fields.style', { defaultValue: 'Style' })}
        </span>
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          <button
            type="button"
            disabled={disabled}
            className={[
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] transition-colors duration-150',
              !style
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            onClick={() => setStyle('')}
          >
            {t('v3.fields.styleAuto', { defaultValue: 'Auto' })}
          </button>
          {VIDEO_GENERATE_STYLE_SUGGESTIONS.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              className={[
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] transition-colors duration-150',
                style === s
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              onClick={() => setStyle(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Duration + withAudio row */}
      <div className="flex items-center gap-2">
        <PillSelect
          options={VIDEO_GENERATE_DURATION_OPTIONS.map((dur) => ({
            value: String(dur),
            label: `${dur}s`,
          }))}
          value={String(duration)}
          onChange={(v) =>
            setDuration(Number.parseInt(v, 10) as (typeof VIDEO_GENERATE_DURATION_OPTIONS)[number])
          }
          disabled={disabled}
        />

        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={withAudio}
            onChange={(e) => setWithAudio(e.target.checked)}
            disabled={disabled}
            className="accent-foreground"
          />
          {t('v3.fields.withAudio', { defaultValue: 'With Audio' })}
        </label>
      </div>
    </div>
  )
}
