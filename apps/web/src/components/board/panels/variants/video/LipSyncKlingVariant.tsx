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
import { Music, User } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { MediaSlot, toMediaInput } from '../shared'

/**
 * lip-sync-kling (可灵口型) variant form.
 *
 * Inputs: person ({url} - video or image), audio ({url} - audio file).
 * Params: none.
 * Person can be either a video or an image.
 */
export function LipSyncKlingVariant({
  variant,
  upstream,
  nodeResourceUrl,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // Person input: prefer video from upstream, fall back to image.
  // For display (resolved URLs)
  const upstreamPersonVideo = upstream.videoUrl
  const upstreamPersonImage = upstream.images?.[0] ?? nodeResourceUrl
  const upstreamPerson = upstreamPersonVideo ?? upstreamPersonImage
  const upstreamAudio = upstream.audioUrl

  // For API submission (raw paths)
  const upstreamPersonPath = upstream.videoUrl ?? upstream.imagePaths?.[0]

  // Manual uploads (only used when no upstream source)
  const [manualPersonSrc, setManualPersonSrc] = useState<string | undefined>()
  const [manualAudioSrc, setManualAudioSrc] = useState<string | undefined>()

  const personUrl = upstreamPerson ?? manualPersonSrc
  const audioUrl = upstreamAudio ?? manualAudioSrc

  // API submission paths
  const personPath = upstreamPersonPath ?? manualPersonSrc
  const audioPath = upstreamAudio ?? manualAudioSrc
  const hasPerson = Boolean(personUrl)
  const hasAudio = Boolean(audioUrl)

  // Report warning when required inputs are missing
  useEffect(() => {
    if (!hasPerson && !hasAudio) {
      onWarningChange?.(t('v3.fields.lipSyncKlingHint', { defaultValue: 'Connect a person video/image and audio node to generate lip sync video' }))
    } else if (!hasPerson) {
      onWarningChange?.(t('v3.fields.uploadPersonVideoOrImage', { defaultValue: 'Connect a video or image node' }))
    } else if (!hasAudio) {
      onWarningChange?.(t('v3.fields.uploadAudio', { defaultValue: 'Connect an audio node' }))
    } else {
      onWarningChange?.(null)
    }
  }, [hasPerson, hasAudio, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (personPath) {
      inputs.person = toMediaInput(personPath)
    }
    if (audioPath) {
      inputs.audio = toMediaInput(audioPath)
    }

    onParamsChange({
      inputs,
      params: {},
    })
  }, [personPath, audioPath, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Person + Audio slots side by side */}
      <div className="flex items-end gap-3">
        <MediaSlot
          label={t('v3.fields.personVideoOrImage', { defaultValue: 'Person' })}
          icon={<User size={16} />}
          src={personUrl}
          required
          disabled={disabled}
          uploadAccept="image/*,video/*"
          boardId={upstream.boardId}
          projectId={upstream.projectId}
          boardFolderUri={upstream.boardFolderUri}
          onUpload={!upstreamPerson
            ? (value) => setManualPersonSrc(value)
            : undefined}
          onRemove={manualPersonSrc
            ? () => setManualPersonSrc(undefined)
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
        {t('v3.fields.lipSyncKlingHint', { defaultValue: 'Connect a person video/image and audio node to generate lip sync video' })}
      </p>
    </div>
  )
}
