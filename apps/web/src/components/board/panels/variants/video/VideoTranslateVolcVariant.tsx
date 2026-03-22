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
import { Film } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { MediaSlot, PillSelect, toMediaInput } from '../shared'

const LANGUAGE_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
]

/**
 * OL-VT-001 (即梦视频翻译) variant form.
 *
 * Inputs: video ({url} - source video).
 * Params: sourceLanguage, targetLanguage.
 */
export function VideoTranslateVolcVariant({
  variant,
  upstream,
  initialParams,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [sourceLanguage, setSourceLanguage] = useState<string>(
    (initialParams?.params?.sourceLanguage as string) ?? 'zh',
  )
  const [targetLanguage, setTargetLanguage] = useState<string>(
    (initialParams?.params?.targetLanguage as string) ?? 'en',
  )

  // Manual upload (only used when no upstream source)
  const [manualVideoSrc, setManualVideoSrc] = useState<string | undefined>()

  // For display (resolved URL)
  const upstreamVideo = upstream.videoUrl
  const videoUrl = upstreamVideo ?? manualVideoSrc

  // For API submission (raw path)
  const videoPath = upstreamVideo ?? manualVideoSrc
  const hasVideo = Boolean(videoUrl)

  // Report warning when required input is missing
  useEffect(() => {
    if (!hasVideo) {
      onWarningChange?.(t('v3.fields.videoTranslateHint', { defaultValue: 'Connect a video node to translate' }))
    } else {
      onWarningChange?.(null)
    }
  }, [hasVideo, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (videoPath) {
      inputs.video = toMediaInput(videoPath)
    }

    onParamsChange({
      inputs,
      params: {
        sourceLanguage,
        targetLanguage,
      },
    })
  }, [videoPath, sourceLanguage, targetLanguage, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Video slot */}
      <div className="flex items-end gap-3">
        <MediaSlot
          label={t('v3.fields.videoInput', { defaultValue: 'Video' })}
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
      </div>

      {/* Language selectors */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('v3.params.sourceLanguage', { defaultValue: 'Source Language' })}
        </span>
        <PillSelect
          options={LANGUAGE_OPTIONS}
          value={sourceLanguage}
          onChange={setSourceLanguage}
          disabled={disabled}
          fullWidth
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('v3.params.targetLanguage', { defaultValue: 'Target Language' })}
        </span>
        <PillSelect
          options={LANGUAGE_OPTIONS}
          value={targetLanguage}
          onChange={setTargetLanguage}
          disabled={disabled}
          fullWidth
        />
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.videoTranslateHint', { defaultValue: 'Connect a video node to translate' })}
      </p>
    </div>
  )
}
