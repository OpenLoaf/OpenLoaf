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
  VIDEO_GENERATE_ASPECT_RATIO_OPTIONS,
} from '../../../nodes/node-config'
import type { VariantFormProps } from '../types'
import { MediaSlot, PillSelect, UpstreamTextBadge } from '../shared'

/** Kling mode options. */
const KLING_MODES = ['std', 'pro'] as const
type KlingMode = (typeof KLING_MODES)[number]

/** Kling only supports 5s duration currently. */
const KLING_DURATION = 5

/**
 * vid-gen-kling (可灵视频) variant form.
 *
 * Inputs: prompt (required), image (optional first frame).
 * Params: mode (std/pro), duration (5s), aspectRatio (16:9), modelName.
 * Automatically selects text2video or image2video based on image presence.
 */
export function VidGenKlingVariant({
  variant,
  upstream,
  nodeResourceUrl,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(upstream.textContent ?? '')
  const [mode, setMode] = useState<KlingMode>('std')
  const [aspectRatio, setAspectRatio] = useState<string>('16:9')

  // Manual upload for first frame (only if no upstream source)
  const [manualFirstFrame, setManualFirstFrame] = useState<string | undefined>()

  const upstreamFirstFrame = upstream.images?.[0] ?? nodeResourceUrl
  const firstFrameUrl = upstreamFirstFrame ?? manualFirstFrame

  // Report warning when prompt is empty (required for Kling video).
  useEffect(() => {
    onWarningChange?.(!prompt.trim()
      ? t('v3.warnings.promptRequired', { defaultValue: 'Please enter a prompt' })
      : null)
  }, [prompt, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {
      prompt,
    }
    if (firstFrameUrl) {
      inputs.image = { url: firstFrameUrl }
    }

    onParamsChange({
      inputs,
      params: {
        mode,
        duration: KLING_DURATION,
        aspectRatio: aspectRatio !== 'auto' ? aspectRatio : '16:9',
      },
    })
  }, [prompt, mode, aspectRatio, firstFrameUrl, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Optional first-frame slot */}
      <div className="flex items-end gap-2">
        <MediaSlot
          label={t('v3.fields.firstFrame', { defaultValue: 'First Frame' })}
          icon={<ImagePlus size={16} />}
          src={firstFrameUrl}
          disabled={disabled}
          onUpload={!upstreamFirstFrame
            ? (dataUrl) => setManualFirstFrame(dataUrl)
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

      {/* Mode selector (std / pro) */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          {t('v3.fields.mode', { defaultValue: 'Mode' })}
        </span>
        <div className="flex gap-1">
          {KLING_MODES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              className={[
                'flex-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                mode === m
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              onClick={() => setMode(m)}
            >
              {m === 'std'
                ? t('v3.fields.modeStd', { defaultValue: 'Standard' })
                : t('v3.fields.modePro', { defaultValue: 'Pro' })}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio + Duration row */}
      <div className="flex items-center gap-2">
        <PillSelect
          options={VIDEO_GENERATE_ASPECT_RATIO_OPTIONS.filter((r) => r !== 'auto').map((ratio) => ({
            value: ratio,
            label: ratio,
          }))}
          value={aspectRatio}
          onChange={setAspectRatio}
          disabled={disabled}
        />

        <span className="text-[11px] text-muted-foreground">
          {KLING_DURATION}s
        </span>
      </div>
    </div>
  )
}
