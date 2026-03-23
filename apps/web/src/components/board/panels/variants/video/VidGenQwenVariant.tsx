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
 * OL-VG-001 (百炼视频) variant form.
 *
 * Requires a first-frame image (startImage) -- pure text-to-video is NOT supported.
 * Params: prompt, style, upstreamModelId, duration, withAudio.
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * the `startFrame` slot from the framework instead of self-managing uploads.
 */
export function VidGenQwenVariant({
  variant,
  upstream,
  nodeResourceUrl,
  initialParams,
  disabled = false,
  onParamsChange,
  onWarningChange,
  resolvedSlots,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(
    (initialParams?.inputs?.prompt as string) ?? (initialParams?.params?.prompt as string) ?? '',
  )
  const [style, setStyle] = useState((initialParams?.params?.style as string) ?? '')
  const [duration, setDuration] = useState<(typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]>(
    (initialParams?.params?.duration as (typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]) ?? 5,
  )
  const [withAudio, setWithAudio] = useState(
    (initialParams?.params?.withAudio as boolean) ?? false,
  )

  // Self-managed first frame (only used in fallback mode, i.e. resolvedSlots === undefined)
  const [manualFirstFrame, setManualFirstFrame] = useState<string | undefined>()

  // Resolve first frame source based on mode
  let firstFrameUrl: string | undefined
  let firstFramePath: string | undefined
  let hasFirstFrame: boolean

  if (resolvedSlots) {
    // Framework mode: read from resolvedSlots['startFrame']
    const refs = resolvedSlots['startFrame'] ?? []
    const ref = refs[0]
    firstFrameUrl = ref?.url
    firstFramePath = ref?.path ?? ref?.url
    hasFirstFrame = Boolean(firstFrameUrl)
  } else {
    // Fallback: self-managed
    const upstreamFirstFrame = upstream.images?.[0] ?? nodeResourceUrl
    firstFrameUrl = upstreamFirstFrame ?? manualFirstFrame
    const upstreamFirstFramePath = upstream.imagePaths?.[0]
    firstFramePath = upstreamFirstFramePath ?? manualFirstFrame
    hasFirstFrame = Boolean(firstFrameUrl)
  }

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
    inputs.prompt = prompt
    onParamsChange({
      inputs,
      params: {
        style: style || undefined,
        duration,
        withAudio: withAudio || undefined,
      },
    })
  }, [prompt, style, duration, withAudio, firstFramePath, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* First-frame slot — only rendered in fallback (no resolvedSlots) mode */}
      {!resolvedSlots ? (
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
            onUpload={!(upstream.images?.[0] ?? nodeResourceUrl)
              ? (value) => setManualFirstFrame(value)
              : undefined}
            onRemove={manualFirstFrame
              ? () => setManualFirstFrame(undefined)
              : undefined}
          />
        </div>
      ) : null}

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
        <div className="no-scrollbar flex gap-1 overflow-x-auto" onWheel={(e) => { e.stopPropagation(); e.currentTarget.scrollLeft += e.deltaY }}>
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
