/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Full-screen image adjustment overlay for canvas image nodes.
 * Provides crop, rotate, and flip functionality using react-advanced-cropper.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cropper, type CropperRef } from 'react-advanced-cropper'
import 'react-advanced-cropper/dist/style.css'
import {
  Check,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react'
import { cn } from '@udecode/cn'
import i18next from 'i18next'

export type ImageAdjustState = {
  rotation: number
  flipH: boolean
  flipV: boolean
  cropRect?: { x: number; y: number; width: number; height: number }
  aspectRatio?: string
}

export type ImageAdjustResult = {
  /** Transformed image as a Blob. */
  blob: Blob
  /** Final image width. */
  width: number
  /** Final image height. */
  height: number
  /** Preview data URL. */
  previewSrc: string
  /** Adjustment state for re-editing. */
  adjust: ImageAdjustState
}

type ImageAdjustOverlayProps = {
  /** Whether the overlay is visible. */
  active: boolean
  /** Image source URL to adjust. */
  imageSrc: string
  /** Initial adjustment state to restore. */
  initialAdjust?: ImageAdjustState
  /** Called when user confirms the adjustment. */
  onConfirm: (result: ImageAdjustResult) => void
  /** Called when user cancels. */
  onCancel: () => void
}

const ASPECT_RATIOS: { key: string; label: string; value?: number }[] = [
  { key: 'free', label: '自由' },
  { key: '1:1', label: '1:1', value: 1 },
  { key: '4:3', label: '4:3', value: 4 / 3 },
  { key: '3:4', label: '3:4', value: 3 / 4 },
  { key: '16:9', label: '16:9', value: 16 / 9 },
  { key: '9:16', label: '9:16', value: 9 / 16 },
  { key: '3:2', label: '3:2', value: 3 / 2 },
]

/** Preview max dimension for generating data URL. */
const PREVIEW_MAX_DIM = 512
const PREVIEW_QUALITY = 0.82

export function ImageAdjustOverlay({
  active,
  imageSrc,
  initialAdjust,
  onConfirm,
  onCancel,
}: ImageAdjustOverlayProps) {
  const cropperRef = useRef<CropperRef>(null)
  const [selectedRatio, setSelectedRatio] = useState(
    initialAdjust?.aspectRatio || 'free',
  )
  const [rotation, setRotation] = useState(initialAdjust?.rotation ?? 0)
  const [flipH, setFlipH] = useState(initialAdjust?.flipH ?? false)
  const [flipV, setFlipV] = useState(initialAdjust?.flipV ?? false)
  const [submitting, setSubmitting] = useState(false)

  // 逻辑：初始化时恢复之前的调整状态。
  const initialApplied = useRef(false)
  useEffect(() => {
    if (!active) {
      initialApplied.current = false
      return
    }
    if (initialApplied.current) return
    if (!initialAdjust) {
      initialApplied.current = true
      return
    }
    // 逻辑：cropper 就绪后延迟应用初始变换。
    const timer = setTimeout(() => {
      const cropper = cropperRef.current
      if (!cropper) return
      if (initialAdjust.rotation) {
        cropper.rotateImage(initialAdjust.rotation)
      }
      if (initialAdjust.flipH) {
        cropper.flipImage(true, false)
      }
      if (initialAdjust.flipV) {
        cropper.flipImage(false, true)
      }
      initialApplied.current = true
    }, 300)
    return () => clearTimeout(timer)
  }, [active, initialAdjust])

  // 逻辑：重置状态当 overlay 重新激活。
  useEffect(() => {
    if (active) {
      setSelectedRatio(initialAdjust?.aspectRatio || 'free')
      setRotation(initialAdjust?.rotation ?? 0)
      setFlipH(initialAdjust?.flipH ?? false)
      setFlipV(initialAdjust?.flipV ?? false)
      setSubmitting(false)
    }
  }, [active, initialAdjust])

  const handleRotate90CW = useCallback(() => {
    cropperRef.current?.rotateImage(90)
    setRotation((prev) => (prev + 90) % 360)
  }, [])

  const handleRotate90CCW = useCallback(() => {
    cropperRef.current?.rotateImage(-90)
    setRotation((prev) => ((prev - 90) % 360 + 360) % 360)
  }, [])

  const handleFlipH = useCallback(() => {
    cropperRef.current?.flipImage(true, false)
    setFlipH((prev) => !prev)
  }, [])

  const handleFlipV = useCallback(() => {
    cropperRef.current?.flipImage(false, true)
    setFlipV((prev) => !prev)
  }, [])

  const handleRatioChange = useCallback((key: string) => {
    setSelectedRatio(key)
  }, [])

  const handleConfirm = useCallback(async () => {
    const cropper = cropperRef.current
    if (!cropper || submitting) return
    setSubmitting(true)
    try {
      const canvas = cropper.getCanvas()
      if (!canvas) {
        onCancel()
        return
      }
      const width = canvas.width
      const height = canvas.height

      // 逻辑：生成预览图。
      const maxSide = Math.max(width, height)
      const scale = maxSide > PREVIEW_MAX_DIM ? PREVIEW_MAX_DIM / maxSide : 1
      const pw = Math.round(width * scale)
      const ph = Math.round(height * scale)
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = pw
      previewCanvas.height = ph
      const previewCtx = previewCanvas.getContext('2d')
      if (previewCtx) {
        previewCtx.drawImage(canvas, 0, 0, pw, ph)
      }
      const previewSrc = previewCanvas.toDataURL('image/png', PREVIEW_QUALITY)

      // 逻辑：生成完整尺寸 Blob。
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))),
          'image/png',
        )
      })

      // 逻辑：获取裁剪坐标（相对百分比）。
      const coordinates = cropper.getCoordinates()
      const imageState = cropper.getState()
      let cropRect: ImageAdjustState['cropRect']
      if (coordinates && imageState?.imageSize) {
        const imgW = imageState.imageSize.width
        const imgH = imageState.imageSize.height
        if (imgW > 0 && imgH > 0) {
          cropRect = {
            x: coordinates.left / imgW,
            y: coordinates.top / imgH,
            width: coordinates.width / imgW,
            height: coordinates.height / imgH,
          }
        }
      }

      onConfirm({
        blob,
        width,
        height,
        previewSrc,
        adjust: {
          rotation,
          flipH,
          flipV,
          cropRect,
          aspectRatio: selectedRatio,
        },
      })
    } catch {
      onCancel()
    }
  }, [submitting, rotation, flipH, flipV, selectedRatio, onConfirm, onCancel])

  // 逻辑：ESC 关闭覆盖层。
  useEffect(() => {
    if (!active) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [active, onCancel])

  if (!active) return null

  const ratioConfig = ASPECT_RATIOS.find((r) => r.key === selectedRatio)
  const aspectRatio = ratioConfig?.value

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/70"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 裁剪区域 */}
      <div className="relative flex-1 w-full max-w-[80vw] max-h-[calc(100vh-120px)] p-8">
        <Cropper
          ref={cropperRef}
          src={imageSrc}
          className="h-full w-full"
          stencilProps={{
            aspectRatio,
            grid: true,
          }}
          backgroundClassName="bg-black/40"
          scaleImage={{ wheel: false, touch: false }}
        />
      </div>

      {/* 底部控制栏 */}
      <div
        className={cn(
          'flex items-center gap-3 px-6 py-3 mb-6 rounded-full',
          'bg-background/90 backdrop-blur-xl shadow-lg border border-border/40',
        )}
      >
        {/* 裁剪比例 */}
        <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio.key}
              type="button"
              className={cn(
                'px-2.5 py-1 text-xs rounded-full transition-colors duration-150',
                selectedRatio === ratio.key
                  ? 'bg-foreground text-background'
                  : 'text-foreground/70 hover:bg-foreground/8',
              )}
              onClick={() => handleRatioChange(ratio.key)}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        <span className="h-5 w-px bg-border/60" />

        {/* 翻转 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              'p-2 rounded-full transition-colors duration-150',
              flipH
                ? 'bg-foreground/10 text-blue-500'
                : 'text-foreground/70 hover:bg-foreground/8',
            )}
            onClick={handleFlipH}
            title={i18next.t('board:imageAdjust.flipH', { defaultValue: '水平翻转' })}
          >
            <FlipHorizontal2 size={16} />
          </button>
          <button
            type="button"
            className={cn(
              'p-2 rounded-full transition-colors duration-150',
              flipV
                ? 'bg-foreground/10 text-blue-500'
                : 'text-foreground/70 hover:bg-foreground/8',
            )}
            onClick={handleFlipV}
            title={i18next.t('board:imageAdjust.flipV', { defaultValue: '垂直翻转' })}
          >
            <FlipVertical2 size={16} />
          </button>
        </div>

        <span className="h-5 w-px bg-border/60" />

        {/* 旋转 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-2 rounded-full text-foreground/70 hover:bg-foreground/8 transition-colors duration-150"
            onClick={handleRotate90CCW}
            title={i18next.t('board:imageAdjust.rotateCCW', { defaultValue: '逆时针旋转 90°' })}
          >
            <RotateCcw size={16} />
          </button>
          <span className="text-xs text-foreground/50 min-w-[3ch] text-center tabular-nums">
            {rotation}°
          </span>
          <button
            type="button"
            className="p-2 rounded-full text-foreground/70 hover:bg-foreground/8 transition-colors duration-150"
            onClick={handleRotate90CW}
            title={i18next.t('board:imageAdjust.rotateCW', { defaultValue: '顺时针旋转 90°' })}
          >
            <RotateCw size={16} />
          </button>
        </div>

        <span className="h-5 w-px bg-border/60" />

        {/* 取消 / 确认 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-foreground/70 hover:bg-foreground/8 transition-colors duration-150"
            onClick={onCancel}
          >
            <X size={14} />
            {i18next.t('board:imageAdjust.cancel', { defaultValue: '取消' })}
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors duration-150',
              'bg-foreground text-background hover:bg-foreground/90',
              submitting && 'opacity-50 pointer-events-none',
            )}
            onClick={handleConfirm}
            disabled={submitting}
          >
            <Check size={14} />
            {submitting
              ? i18next.t('board:imageAdjust.applying', { defaultValue: '应用中...' })
              : i18next.t('board:imageAdjust.confirm', { defaultValue: '确认' })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
