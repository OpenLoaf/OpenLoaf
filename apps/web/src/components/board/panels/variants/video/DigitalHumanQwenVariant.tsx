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

const RESOLUTION_OPTIONS = ['480P', '720P'] as const

/**
 * OL-DH-001 (百炼数字人) variant form.
 *
 * Inputs: image ({url} - person portrait), audio ({url} - audio file, ≤20s).
 * Params: resolution ("480P" | "720P").
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * `image` and `audio` slots from the framework instead of self-managing uploads.
 */
export function DigitalHumanQwenVariant({
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

  const [resolution, setResolution] = useState<(typeof RESOLUTION_OPTIONS)[number]>(
    (initialParams?.params?.resolution as (typeof RESOLUTION_OPTIONS)[number]) ?? '480P',
  )

  // Self-managed uploads (only used in fallback mode, i.e. resolvedSlots === undefined)
  const [manualPersonSrc, setManualPersonSrc] = useState<string | undefined>()
  const [manualAudioSrc, setManualAudioSrc] = useState<string | undefined>()

  // Resolve person image and audio sources based on mode
  let personUrl: string | undefined
  let audioUrl: string | undefined
  let personPath: string | undefined
  let audioPath: string | undefined

  if (resolvedSlots) {
    // Framework mode: read from resolvedSlots['image'] and resolvedSlots['audio']
    const imageRef = (resolvedSlots['image'] ?? [])[0]
    const audioRef = (resolvedSlots['audio'] ?? [])[0]
    personUrl = imageRef?.url
    audioUrl = audioRef?.url
    personPath = imageRef?.path ?? imageRef?.url
    audioPath = audioRef?.path ?? audioRef?.url
  } else {
    // Fallback: self-managed
    const upstreamPerson = upstream.images?.[0] ?? nodeResourceUrl
    const upstreamAudio = upstream.audioUrl
    personUrl = upstreamPerson ?? manualPersonSrc
    audioUrl = upstreamAudio ?? manualAudioSrc
    const upstreamPersonPath = upstream.imagePaths?.[0]
    personPath = upstreamPersonPath ?? manualPersonSrc
    audioPath = upstreamAudio ?? manualAudioSrc
  }

  const hasPerson = Boolean(personUrl)
  const hasAudio = Boolean(audioUrl)

  // Report warning when required inputs are missing
  useEffect(() => {
    if (!hasPerson && !hasAudio) {
      onWarningChange?.(t('v3.fields.digitalHumanHint', { defaultValue: 'Connect a person image and audio node to generate digital human video' }))
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
    if (personPath) {
      inputs.image = toMediaInput(personPath)
    }
    if (audioPath) {
      inputs.audio = toMediaInput(audioPath)
    }

    onParamsChange({
      inputs,
      params: {
        resolution,
      },
    })
  }, [personPath, audioPath, resolution, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Person + Audio slots side by side — only rendered in fallback mode */}
      {!resolvedSlots ? (
        <div className="flex items-end gap-3">
          <MediaSlot
            label={t('v3.fields.personImage', { defaultValue: 'Person' })}
            icon={<User size={16} />}
            src={personUrl}
            required
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={!(upstream.images?.[0] ?? nodeResourceUrl)
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
            onUpload={!upstream.audioUrl
              ? (value) => setManualAudioSrc(value)
              : undefined}
            onRemove={manualAudioSrc
              ? () => setManualAudioSrc(undefined)
              : undefined}
          />
        </div>
      ) : null}

      {/* Resolution selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('v3.params.resolution', { defaultValue: 'Resolution' })}
        </span>
        <div className="flex gap-2">
          {RESOLUTION_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={disabled}
              className={[
                'flex-1 rounded-3xl border py-2 text-sm font-medium transition-colors duration-150',
                resolution === r
                  ? 'border-foreground/30 bg-foreground/5 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
              onClick={() => !disabled && setResolution(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.digitalHumanHint', { defaultValue: 'Connect a person image and audio node to generate digital human video' })}
      </p>
    </div>
  )
}
