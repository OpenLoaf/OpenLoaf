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
import { Film, Music } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { MediaSlot, toMediaInput } from '../shared'

/**
 * OL-LS-001 (即梦口型) variant form.
 *
 * Inputs: video ({url} - person video, MP4/AVI/MOV 2-120s), audio ({url} - audio file).
 * Params: none.
 * Both must be URLs.
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * `video` and `audio` slots from the framework instead of self-managing uploads.
 */
export function LipSyncVolcVariant({
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

  // Self-managed uploads (only used in fallback mode, i.e. resolvedSlots === undefined)
  const [manualVideoSrc, setManualVideoSrc] = useState<string | undefined>()
  const [manualAudioSrc, setManualAudioSrc] = useState<string | undefined>()
  const [videoExtension, setVideoExtension] = useState(
    (initialParams?.params?.videoExtension as boolean) ?? false,
  )
  const [faceThreshold, setFaceThreshold] = useState(
    (initialParams?.params?.faceThreshold as number) ?? 170,
  )

  // Resolve video and audio sources based on mode
  let videoUrl: string | undefined
  let audioUrl: string | undefined
  let videoPath: string | undefined
  let audioPath: string | undefined

  if (resolvedSlots) {
    // Framework mode: read from resolvedSlots['video'] and resolvedSlots['audio']
    const videoRef = (resolvedSlots['video'] ?? [])[0]
    const audioRef = (resolvedSlots['audio'] ?? [])[0]
    videoUrl = videoRef?.url
    audioUrl = audioRef?.url
    videoPath = videoRef?.path ?? videoRef?.url
    audioPath = audioRef?.path ?? audioRef?.url
  } else {
    // Fallback: self-managed
    const upstreamVideo = upstream.videoUrl
    const upstreamAudio = upstream.audioUrl
    videoUrl = upstreamVideo ?? manualVideoSrc
    audioUrl = upstreamAudio ?? manualAudioSrc
    videoPath = upstreamVideo ?? manualVideoSrc
    audioPath = upstreamAudio ?? manualAudioSrc
  }

  const hasVideo = Boolean(videoUrl)
  const hasAudio = Boolean(audioUrl)

  // Report warning when required inputs are missing
  useEffect(() => {
    if (!hasVideo && !hasAudio) {
      onWarningChange?.(t('v3.fields.lipSyncHint', { defaultValue: 'Connect a person video and audio node to generate lip sync video' }))
    } else if (!hasVideo) {
      onWarningChange?.(t('v3.fields.uploadPersonVideo', { defaultValue: 'Connect a person video node' }))
    } else if (!hasAudio) {
      onWarningChange?.(t('v3.fields.uploadAudio', { defaultValue: 'Connect an audio node' }))
    } else {
      onWarningChange?.(null)
    }
  }, [hasVideo, hasAudio, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (videoPath) {
      inputs.video = toMediaInput(videoPath)
    }
    if (audioPath) {
      inputs.audio = toMediaInput(audioPath)
    }

    onParamsChange({
      inputs,
      params: {
        ...(videoExtension ? { videoExtension: true } : {}),
        faceThreshold,
      },
    })
  }, [videoPath, audioPath, videoExtension, faceThreshold, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Video + Audio slots side by side — only rendered in fallback mode */}
      {!resolvedSlots ? (
        <div className="flex items-end gap-3">
          <MediaSlot
            label={t('v3.fields.personVideo', { defaultValue: 'Video' })}
            icon={<Film size={16} />}
            src={videoUrl}
            required
            disabled={disabled}
            uploadAccept="video/*"
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={!upstream.videoUrl
              ? (value) => setManualVideoSrc(value)
              : undefined}
            onRemove={manualVideoSrc
              ? () => setManualVideoSrc(undefined)
              : undefined}
          />
          <MediaSlot
            label={t('v3.fields.audioInput', { defaultValue: 'Audio' })}
            icon={<Music size={16} />}
            src={audioUrl}
            required
            disabled={disabled}
            uploadAccept="audio/*"
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={!upstream.audioUrl
              ? (value) => setManualAudioSrc(value)
              : undefined}
            onRemove={manualAudioSrc
              ? () => setManualAudioSrc(undefined)
              : undefined}
          />
        </div>
      ) : null}

      {/* ── Parameters ── */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={videoExtension}
            onChange={(e) => setVideoExtension(e.target.checked)}
            disabled={disabled}
            className="accent-foreground"
          />
          {t('v3.params.videoExtension', { defaultValue: '音频较长时延长视频' })}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0">
            {t('v3.params.faceThreshold', { defaultValue: '人脸匹配' })}
          </span>
          <input
            type="range"
            min={120}
            max={200}
            step={5}
            value={faceThreshold}
            onChange={(e) => setFaceThreshold(Number(e.target.value))}
            disabled={disabled}
            className="h-1 flex-1 appearance-none rounded-full bg-foreground/10 accent-foreground"
          />
          <span className="w-8 text-right text-[10px] text-muted-foreground tabular-nums">
            {faceThreshold}
          </span>
        </div>
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.lipSyncHint', { defaultValue: 'Connect a person video and audio node to generate lip sync video' })}
      </p>
    </div>
  )
}
