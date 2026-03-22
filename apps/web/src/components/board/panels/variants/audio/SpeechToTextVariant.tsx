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
import { Music } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { MediaSlot, toMediaInput } from '../shared'

/**
 * OL-SR-001 Speech-to-Text variant form.
 *
 * Inputs: audio (required, MediaInput).
 * Params: enableItn (boolean, default true).
 * Output: resultText (via v3Task polling).
 */
export function SpeechToTextVariant({
  upstream,
  initialParams,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // Manual audio upload (only used when no upstream audio)
  const [manualAudioSrc, setManualAudioSrc] = useState<string | undefined>()

  // enableItn — priority: cached > default true
  const [enableItn, setEnableItn] = useState(
    (initialParams?.params?.enableItn as boolean) ?? true,
  )

  // Resolve audio source
  const upstreamAudio = upstream.audioUrl
  const audioUrl = upstreamAudio ?? manualAudioSrc
  const audioPath = upstreamAudio ?? manualAudioSrc
  const hasAudio = Boolean(audioUrl)

  // Report warning when audio is missing
  useEffect(() => {
    onWarningChange?.(
      !hasAudio
        ? t('v3.warnings.audioRequired', {
            defaultValue: 'Connect an audio node for speech recognition',
          })
        : null,
    )
  }, [hasAudio, onWarningChange, t])

  // Sync params to parent on any change
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (audioPath) {
      inputs.audio = toMediaInput(audioPath)
    }

    onParamsChange({
      inputs,
      params: {
        enableItn,
      },
    })
  }, [audioPath, enableItn, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Audio input slot */}
      <MediaSlot
        label={t('v3.fields.audioInput', { defaultValue: 'Audio Input' })}
        icon={<Music size={16} />}
        src={audioUrl}
        required
        disabled={disabled}
        uploadAccept="audio/*"
        boardId={upstream.boardId}
        projectId={upstream.projectId}
        boardFolderUri={upstream.boardFolderUri}
        onUpload={
          !upstreamAudio ? (value) => setManualAudioSrc(value) : undefined
        }
        onRemove={
          manualAudioSrc ? () => setManualAudioSrc(undefined) : undefined
        }
      />

      {/* enableItn toggle */}
      <label className="flex items-center gap-2 px-0.5">
        <input
          type="checkbox"
          checked={enableItn}
          onChange={(e) => setEnableItn(e.target.checked)}
          disabled={disabled}
          className="h-3.5 w-3.5 rounded border-border accent-foreground"
        />
        <span className="text-[11px] text-muted-foreground">
          {t('v3.params.enableItn', { defaultValue: 'Smart Formatting' })}
        </span>
      </label>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.speechToTextHint', {
          defaultValue:
            'Upload or connect an audio node to transcribe speech to text',
        })}
      </p>
    </div>
  )
}
