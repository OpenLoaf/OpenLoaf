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
import { MediaSlot } from '../shared'

/**
 * lip-sync-volc (即梦口型) variant form.
 *
 * Inputs: person ({url} - person image), audio ({url} - audio file).
 * Params: modelId.
 * Both must be URLs.
 */
export function LipSyncVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // Manual uploads (only used when no upstream source)
  const [manualPersonSrc, setManualPersonSrc] = useState<string | undefined>()
  const [manualAudioSrc, setManualAudioSrc] = useState<string | undefined>()

  const upstreamPerson = upstream.images?.[0] ?? nodeResourceUrl
  const upstreamAudio = upstream.audioUrl

  const personUrl = upstreamPerson ?? manualPersonSrc
  const audioUrl = upstreamAudio ?? manualAudioSrc
  const hasPerson = Boolean(personUrl)
  const hasAudio = Boolean(audioUrl)

  // Report warning when required inputs are missing
  useEffect(() => {
    if (!hasPerson && !hasAudio) {
      onWarningChange?.(t('v3.fields.lipSyncHint', { defaultValue: 'Connect a person image and audio node to generate lip sync video' }))
    } else if (!hasPerson) {
      onWarningChange?.(t('v3.fields.uploadPerson', { defaultValue: 'Connect a person image node' }))
    } else if (!hasAudio) {
      onWarningChange?.(t('v3.fields.uploadAudio', { defaultValue: 'Connect an audio node' }))
    } else {
      onWarningChange?.(null)
    }
  }, [hasPerson, hasAudio, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (personUrl) {
      inputs.person = { url: personUrl }
    }
    if (audioUrl) {
      inputs.audio = { url: audioUrl }
    }

    onParamsChange({
      inputs,
      params: {},
    })
  }, [personUrl, audioUrl, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Person + Audio slots side by side */}
      <div className="flex items-end gap-3">
        <MediaSlot
          label={t('v3.fields.personImage', { defaultValue: 'Person' })}
          icon={<User size={16} />}
          src={personUrl}
          required
          disabled={disabled}
          onUpload={!upstreamPerson
            ? (dataUrl) => setManualPersonSrc(dataUrl)
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
          onUpload={!upstreamAudio
            ? (dataUrl) => setManualAudioSrc(dataUrl)
            : undefined}
          onRemove={manualAudioSrc
            ? () => setManualAudioSrc(undefined)
            : undefined}
        />
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.lipSyncHint', { defaultValue: 'Connect a person image and audio node to generate lip sync video' })}
      </p>
    </div>
  )
}
