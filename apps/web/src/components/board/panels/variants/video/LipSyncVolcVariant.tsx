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
 */
export function LipSyncVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  // initialParams not used — media-only variant with no cacheable text params
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // Manual uploads (only used when no upstream source)
  const [manualVideoSrc, setManualVideoSrc] = useState<string | undefined>()
  const [manualAudioSrc, setManualAudioSrc] = useState<string | undefined>()

  // For display (resolved URLs) — 输入类型为 video
  const upstreamVideo = upstream.videoUrl
  const upstreamAudio = upstream.audioUrl

  const videoUrl = upstreamVideo ?? manualVideoSrc
  const audioUrl = upstreamAudio ?? manualAudioSrc

  // For API submission (raw paths)
  const videoPath = upstreamVideo ?? manualVideoSrc
  const audioPath = upstreamAudio ?? manualAudioSrc
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
      params: {},
    })
  }, [videoPath, audioPath, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Video + Audio slots side by side */}
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
          onUpload={!upstreamVideo
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
          onUpload={!upstreamAudio
            ? (value) => setManualAudioSrc(value)
            : undefined}
          onRemove={manualAudioSrc
            ? () => setManualAudioSrc(undefined)
            : undefined}
        />
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.lipSyncHint', { defaultValue: 'Connect a person video and audio node to generate lip sync video' })}
      </p>
    </div>
  )
}
