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
import { Film, User } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { MediaSlot, PillSelect, toMediaInput } from '../shared'

/** Mode 选项：wan-std = 标准模式 (30积分/秒)，wan-pro = 专业模式 (60积分/秒) */
const FACE_SWAP_MODE_OPTIONS = [
  { value: 'wan-std', label: 'Standard' },
  { value: 'wan-pro', label: 'Pro' },
] as const

type FaceSwapMode = (typeof FACE_SWAP_MODE_OPTIONS)[number]['value']

/**
 * OL-FS-001 / OL-FS-002 (百炼视频换脸) variant form.
 *
 * Inputs: image ({url} - face to swap in), video ({url} - reference video).
 * Params: mode ("wan-std" | "wan-pro").
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * `face` and `video` slots from the framework instead of self-managing uploads.
 */
export function FaceSwapQwenVariant({
  variant,
  upstream,
  nodeResourceUrl,
  disabled = false,
  onParamsChange,
  onWarningChange,
  resolvedSlots,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // OL-FS-001 默认标准模式，OL-FS-002 默认专业模式
  const defaultMode: FaceSwapMode = variant.id === 'OL-FS-002' ? 'wan-pro' : 'wan-std'
  const [mode, setMode] = useState<FaceSwapMode>(defaultMode)

  // Self-managed uploads (only used in fallback mode, i.e. resolvedSlots === undefined)
  const [manualImageSrc, setManualImageSrc] = useState<string | undefined>()
  const [manualVideoSrc, setManualVideoSrc] = useState<string | undefined>()

  // Resolve face image and video sources based on mode
  let imageUrl: string | undefined
  let videoUrl: string | undefined
  let imagePath: string | undefined
  let videoPath: string | undefined

  if (resolvedSlots) {
    // Framework mode: read from resolvedSlots['face'] and resolvedSlots['video']
    const faceRef = (resolvedSlots['face'] ?? [])[0]
    const videoRef = (resolvedSlots['video'] ?? [])[0]
    imageUrl = faceRef?.url
    videoUrl = videoRef?.url
    imagePath = faceRef?.path ?? faceRef?.url
    videoPath = videoRef?.path ?? videoRef?.url
  } else {
    // Fallback: self-managed
    const upstreamImage = upstream.images?.[0] ?? nodeResourceUrl
    const upstreamVideo = upstream.videoUrl
    imageUrl = upstreamImage ?? manualImageSrc
    videoUrl = upstreamVideo ?? manualVideoSrc
    const upstreamImagePath = upstream.imagePaths?.[0]
    imagePath = upstreamImagePath ?? manualImageSrc
    videoPath = upstreamVideo ?? manualVideoSrc
  }

  const hasImage = Boolean(imageUrl)
  const hasVideo = Boolean(videoUrl)

  // Report warning when required inputs are missing
  useEffect(() => {
    if (!hasImage && !hasVideo) {
      onWarningChange?.(t('v3.fields.faceSwapHint', { defaultValue: 'Connect a face image and video node' }))
    } else if (!hasImage) {
      onWarningChange?.(t('v3.fields.uploadFaceImage', { defaultValue: 'Connect a face image node' }))
    } else if (!hasVideo) {
      onWarningChange?.(t('v3.fields.uploadVideo', { defaultValue: 'Connect a video node' }))
    } else {
      onWarningChange?.(null)
    }
  }, [hasImage, hasVideo, onWarningChange, t])

  // Sync params to parent on any change.
  useEffect(() => {
    const inputs: Record<string, unknown> = {}
    if (imagePath) {
      inputs.image = toMediaInput(imagePath)
    }
    if (videoPath) {
      inputs.video = toMediaInput(videoPath)
    }

    onParamsChange({
      inputs,
      params: { mode },
    })
  }, [imagePath, videoPath, mode, onParamsChange])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Face image + Video slots side by side — only rendered in fallback mode */}
      {!resolvedSlots ? (
        <div className="flex items-end gap-3">
          <MediaSlot
            label={t('v3.fields.faceImage', { defaultValue: 'Face' })}
            icon={<User size={16} />}
            src={imageUrl}
            required
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={!(upstream.images?.[0] ?? nodeResourceUrl)
              ? (value) => setManualImageSrc(value)
              : undefined}
            onRemove={manualImageSrc
              ? () => setManualImageSrc(undefined)
              : undefined}
          />
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
            onUpload={!upstream.videoUrl
              ? (value) => setManualVideoSrc(value)
              : undefined}
            onRemove={manualVideoSrc
              ? () => setManualVideoSrc(undefined)
              : undefined}
          />
        </div>
      ) : null}

      {/* Mode 选择器 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t('v3.fields.mode', { defaultValue: 'Mode' })}
        </span>
        <PillSelect
          options={FACE_SWAP_MODE_OPTIONS.map((o) => ({
            value: o.value,
            label: t(`v3.fields.faceSwapMode.${o.value}`, { defaultValue: o.label }),
          }))}
          value={mode}
          onChange={(v) => setMode(v as FaceSwapMode)}
          disabled={disabled}
        />
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        {t('v3.fields.faceSwapHint', { defaultValue: 'Connect a face image and video node' })}
      </p>
    </div>
  )
}
