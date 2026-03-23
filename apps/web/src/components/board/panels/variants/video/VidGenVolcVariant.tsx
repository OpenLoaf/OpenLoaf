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
  VIDEO_GENERATE_DURATION_OPTIONS,
  VIDEO_GENERATE_STYLE_SUGGESTIONS,
} from '../../../nodes/node-config'
import type { VariantFormProps } from '../types'
import { MediaSlot, PillSelect, UpstreamTextBadge, toMediaInput } from '../shared'

/**
 * OL-VG-003 (即梦视频) variant form.
 *
 * Supports both text-to-video and image-to-video.
 * Inputs: prompt (required, in params), startImage (optional), images (optional).
 * Params: style, modelId, aspectRatio, duration.
 */
export function VidGenVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  initialParams,
  disabled = false,
  onParamsChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(
    (initialParams?.inputs?.prompt as string) ?? (initialParams?.params?.prompt as string) ?? '',
  )
  const [style, setStyle] = useState((initialParams?.params?.style as string) ?? '')
  const [aspectRatio, setAspectRatio] = useState<string>(
    (initialParams?.params?.aspectRatio as string) ?? 'auto',
  )
  const [duration, setDuration] = useState<(typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]>(
    (initialParams?.params?.duration as (typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]) ?? 5,
  )

  // Manual upload for first frame (only if no upstream source)
  const [manualFirstFrame, setManualFirstFrame] = useState<string | undefined>()

  // For display (resolved URL)
  const upstreamFirstFrame = upstream.images?.[0] ?? nodeResourceUrl
  const firstFrameUrl = upstreamFirstFrame ?? manualFirstFrame
  const hasFirstFrame = Boolean(firstFrameUrl)

  // For API submission (raw path)
  const upstreamFirstFramePath = upstream.imagePaths?.[0]
  const firstFramePath = upstreamFirstFramePath ?? manualFirstFrame

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (firstFramePath) {
      inputs.startImage = toMediaInput(firstFramePath)
    }
    // Additional reference images (beyond the first frame) — use raw paths for API.
    const extraPaths = (upstream.imagePaths ?? upstream.images)?.slice(1)
    if (extraPaths?.length) {
      inputs.images = extraPaths.map((src) => toMediaInput(src))
    }

    onParamsChange({
      inputs,
      params: {
        prompt,
        style: style || undefined,
        aspectRatio: aspectRatio !== 'auto' ? aspectRatio : undefined,
        duration,
      },
    })
  }, [prompt, style, aspectRatio, duration, firstFramePath, upstream.imagePaths, upstream.images, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Optional first-frame slot */}
      <div className="flex items-end gap-2">
        <MediaSlot
          label={t('v3.fields.firstFrame', { defaultValue: 'First Frame' })}
          icon={<ImagePlus size={16} />}
          src={firstFrameUrl}
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

      {/* Style pills */}
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

      {/* Aspect ratio + Duration row */}
      <div className="flex items-center gap-2">
        <PillSelect
          options={VIDEO_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => ({
            value: ratio,
            label: ratio === 'auto'
              ? t('v3.fields.ratioAuto', { defaultValue: 'Auto' })
              : ratio,
          }))}
          value={aspectRatio}
          onChange={setAspectRatio}
          disabled={disabled}
        />
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
      </div>
    </div>
  )
}
