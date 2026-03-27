/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Inline mask painting overlay for image nodes.
 * Rendered on top of the image content when inpaint/erase mode is active.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { buildStrokeOutline } from '@/components/board/utils/stroke-path'
import type { CanvasStrokeTool } from '@/components/board/engine/types'

const BRUSH_MIN_SIZE = 8
const BRUSH_MAX_SIZE = 120
const BRUSH_DEFAULT_SIZE = 40
const BRUSH_MASK_COLOR = 'rgba(255, 255, 255, 1)'
const BRUSH_TOOL: CanvasStrokeTool = 'highlighter'
/** Semi-transparent red to preview mask areas on the image. */
const MASK_PREVIEW_FILL = 'rgba(255, 80, 80, 0.45)'

export { BRUSH_MIN_SIZE, BRUSH_MAX_SIZE }

export type MaskPaintResult = {
  /** Mask as a data URL (white = masked area, transparent = keep). */
  maskDataUrl: string
  /** Mask as a Blob for file upload. */
  maskBlob: Blob
  /** Whether any stroke was drawn. */
  hasStroke: boolean
}

/** Imperative handle exposed to the parent via ref. */
export type MaskPaintHandle = {
  brushSize: number
  setBrushSize: (size: number) => void
  undo: () => void
  redo: () => void
  clear: () => void
  canUndo: boolean
  canRedo: boolean
}

export type MaskPaintOverlayProps = {
  /** Whether mask painting is active. */
  active: boolean
  /** Natural image width in pixels. */
  imageWidth: number
  /** Natural image height in pixels. */
  imageHeight: number
  /** Callback when mask data changes (debounced on stroke end). */
  onMaskChange?: (result: MaskPaintResult | null) => void
  /** Callback when brush size changes (for syncing with panel slider). */
  onBrushSizeChange?: (size: number) => void
}

/**
 * Inline mask painting overlay.
 * Renders an absolutely positioned canvas on top of the image node.
 * The parent must have `position: relative` and matching dimensions.
 *
 * Brush controls (size slider, undo/redo) are exposed via ref
 * so the panel can render them inline.
 */
export const MaskPaintOverlay = memo(forwardRef<MaskPaintHandle, MaskPaintOverlayProps>(
  function MaskPaintOverlay({ active, imageWidth, imageHeight, onMaskChange, onBrushSizeChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const overlayRef = useRef<HTMLCanvasElement>(null)
    const maskRef = useRef<HTMLCanvasElement>(null)
    const isDrawingRef = useRef(false)
    const strokePointsRef = useRef<Array<[number, number, number]>>([])
    const preStrokeRef = useRef<ImageData | null>(null)
    const historyRef = useRef<ImageData[]>([])
    const redoRef = useRef<ImageData[]>([])
    const hasStrokeRef = useRef(false)

    const [brushSize, setBrushSizeRaw] = useState(BRUSH_DEFAULT_SIZE)
    const brushSizeRef = useRef(brushSize)
    // 逻辑：在 effect 中通知父组件，避免 setState-during-render 错误。
    useEffect(() => {
      if (brushSizeRef.current !== brushSize) {
        brushSizeRef.current = brushSize
        onBrushSizeChange?.(brushSize)
      }
    }, [brushSize, onBrushSizeChange])
    const setBrushSize = useCallback((size: number | ((prev: number) => number)) => {
      setBrushSizeRaw(size)
    }, [])
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
    const [, forceRender] = useState(0)

    /**
     * Compute the display rect of an object-contain image within its container.
     * Returns { x, y, w, h } in CSS pixels relative to the container.
     */
    const [displayRect, setDisplayRect] = useState({ x: 0, y: 0, w: 0, h: 0 })

    const computeDisplayRect = useCallback(() => {
      const container = containerRef.current
      if (!container || !imageWidth || !imageHeight) return
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (!cw || !ch) return
      const imgRatio = imageWidth / imageHeight
      const cRatio = cw / ch
      let w: number, h: number
      if (cRatio > imgRatio) {
        // Container is wider — image is height-limited
        h = ch
        w = ch * imgRatio
      } else {
        // Container is taller — image is width-limited
        w = cw
        h = cw / imgRatio
      }
      setDisplayRect({
        x: (cw - w) / 2,
        y: (ch - h) / 2,
        w,
        h,
      })
    }, [imageWidth, imageHeight])

    // Recompute on active/size changes
    useLayoutEffect(() => {
      if (!active) return
      computeDisplayRect()
    }, [active, imageWidth, imageHeight, computeDisplayRect])

    // Also recompute on resize
    useEffect(() => {
      if (!active) return
      const observer = new ResizeObserver(() => computeDisplayRect())
      if (containerRef.current) observer.observe(containerRef.current)
      return () => observer.disconnect()
    }, [active, computeDisplayRect])

    // Initialize canvas sizes + save empty snapshot for full undo
    useEffect(() => {
      if (!active || !imageWidth || !imageHeight) return
      const overlay = overlayRef.current
      const mask = maskRef.current
      if (overlay) {
        overlay.width = imageWidth
        overlay.height = imageHeight
      }
      if (mask) {
        mask.width = imageWidth
        mask.height = imageHeight
        // 逻辑：保存空白初始状态，使撤销可以回到完全无遮罩。
        const ctx = mask.getContext('2d')
        if (ctx) {
          historyRef.current = [ctx.getImageData(0, 0, mask.width, mask.height)]
        } else {
          historyRef.current = []
        }
      }
      redoRef.current = []
      hasStrokeRef.current = false
    }, [active, imageWidth, imageHeight])

    /** Render the mask preview onto the visible overlay canvas. */
    const renderPreview = useCallback(() => {
      const overlay = overlayRef.current
      const mask = maskRef.current
      if (!overlay || !mask) return
      const ctx = overlay.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      ctx.save()
      ctx.globalAlpha = 1
      ctx.drawImage(mask, 0, 0)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = MASK_PREVIEW_FILL
      ctx.fillRect(0, 0, overlay.width, overlay.height)
      ctx.restore()
    }, [])

    /** Push current mask state to history for undo. */
    const pushSnapshot = useCallback(() => {
      const mask = maskRef.current
      if (!mask) return
      const ctx = mask.getContext('2d')
      if (!ctx) return
      historyRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height))
      redoRef.current = []
      if (historyRef.current.length > 30) historyRef.current.shift()
      forceRender((n) => n + 1)
    }, [])

    /** Emit mask data after stroke ends. */
    const emitMaskData = useCallback(() => {
      const mask = maskRef.current
      if (!mask || !onMaskChange) return
      if (!hasStrokeRef.current) {
        onMaskChange(null)
        return
      }
      mask.toBlob((blob) => {
        if (!blob) return
        onMaskChange({
          maskDataUrl: mask.toDataURL('image/png'),
          maskBlob: blob,
          hasStroke: true,
        })
      }, 'image/png')
    }, [onMaskChange])

    const resolvePoint = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = overlayRef.current
        const container = containerRef.current
        if (!canvas || !container || !displayRect.w || !displayRect.h) return null
        const rect = canvas.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        // 逻辑：canvas 精确覆盖 object-contain 图片区域，1:1 映射。
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        const x = (event.clientX - rect.left) * scaleX
        const y = (event.clientY - rect.top) * scaleY
        // 逻辑：cursor 定位需要转换到节点本地坐标系（除以 zoom 因子），
        // 因为 CSS left/top 是在 transform 之前的本地空间中解释的。
        const containerRect = container.getBoundingClientRect()
        const zoomX = containerRect.width / container.clientWidth
        const zoomY = containerRect.height / container.clientHeight
        const displayX = (event.clientX - containerRect.left) / zoomX
        const displayY = (event.clientY - containerRect.top) / zoomY
        return {
          x,
          y,
          displayX,
          displayY,
          scale: (scaleX + scaleY) / 2,
        }
      },
      [displayRect.w, displayRect.h],
    )

    const drawStroke = useCallback(
      (point: { x: number; y: number; scale: number }) => {
        const mask = maskRef.current
        if (!mask) return
        const ctx = mask.getContext('2d')
        if (!ctx) return
        const lineWidth = brushSize * point.scale
        const outline = buildStrokeOutline(strokePointsRef.current, {
          size: lineWidth,
          tool: BRUSH_TOOL,
        })
        const snapshot = preStrokeRef.current
        if (snapshot) {
          ctx.putImageData(snapshot, 0, 0)
        }
        if (outline.length > 0) {
          ctx.fillStyle = BRUSH_MASK_COLOR
          ctx.beginPath()
          ctx.moveTo(outline[0][0], outline[0][1])
          for (let i = 1; i < outline.length; i++) {
            ctx.lineTo(outline[i][0], outline[i][1])
          }
          ctx.closePath()
          ctx.fill()
        }
        renderPreview()
        if (!hasStrokeRef.current) {
          hasStrokeRef.current = true
        }
      },
      [brushSize, renderPreview],
    )

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!active) return
        const point = resolvePoint(event)
        if (!point) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        const mask = maskRef.current
        const ctx = mask?.getContext('2d')
        if (mask && ctx) {
          preStrokeRef.current = ctx.getImageData(0, 0, mask.width, mask.height)
        }
        strokePointsRef.current = []
        isDrawingRef.current = true
        setCursorPos({ x: point.displayX, y: point.displayY })
        strokePointsRef.current.push([point.x, point.y, event.pressure || 0.5])
        drawStroke(point)
      },
      [active, resolvePoint, drawStroke],
    )

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!active) return
        const point = resolvePoint(event)
        if (!point) return
        setCursorPos({ x: point.displayX, y: point.displayY })
        if (!isDrawingRef.current) return
        event.stopPropagation()
        strokePointsRef.current.push([point.x, point.y, event.pressure || 0.5])
        drawStroke(point)
      },
      [active, resolvePoint, drawStroke],
    )

    const handlePointerUp = useCallback(() => {
      if (isDrawingRef.current) {
        preStrokeRef.current = null
        strokePointsRef.current = []
        pushSnapshot()
        emitMaskData()
      }
      isDrawingRef.current = false
    }, [pushSnapshot, emitMaskData])

    const handlePointerLeave = useCallback(() => {
      isDrawingRef.current = false
      setCursorPos(null)
    }, [])

    const handleUndo = useCallback(() => {
      const mask = maskRef.current
      // 逻辑：history[0] 是空白初始状态，至少保留它才能完全撤销。
      if (!mask || historyRef.current.length <= 1) return
      const ctx = mask.getContext('2d')
      if (!ctx) return
      redoRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height))
      const prev = historyRef.current.pop()!
      ctx.putImageData(prev, 0, 0)
      renderPreview()
      // history 只剩初始空白 = 无笔迹
      if (historyRef.current.length <= 1) {
        hasStrokeRef.current = false
      }
      forceRender((n) => n + 1)
      emitMaskData()
    }, [renderPreview, emitMaskData])

    const handleRedo = useCallback(() => {
      const mask = maskRef.current
      if (!mask || redoRef.current.length === 0) return
      const ctx = mask.getContext('2d')
      if (!ctx) return
      historyRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height))
      const next = redoRef.current.pop()!
      ctx.putImageData(next, 0, 0)
      renderPreview()
      hasStrokeRef.current = true
      forceRender((n) => n + 1)
      emitMaskData()
    }, [renderPreview, emitMaskData])

    /** Clear all mask strokes. */
    const handleClear = useCallback(() => {
      const mask = maskRef.current
      if (!mask) return
      const ctx = mask.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, mask.width, mask.height)
      historyRef.current = [ctx.getImageData(0, 0, mask.width, mask.height)]
      redoRef.current = []
      hasStrokeRef.current = false
      renderPreview()
      forceRender((n) => n + 1)
      emitMaskData()
    }, [renderPreview, emitMaskData])

    // Keyboard shortcuts
    useEffect(() => {
      if (!active) return
      const handleKeyDown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
          event.preventDefault()
          handleUndo()
        }
        if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
          event.preventDefault()
          handleRedo()
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [active, handleUndo, handleRedo])

    // 逻辑：用原生事件监听 wheel（non-passive），React onWheel 是 passive 无法 preventDefault。
    // 所有滚轮事件都用来调节笔刷大小，阻止冒泡防止画布缩放。
    useEffect(() => {
      if (!active) return
      const canvas = overlayRef.current
      if (!canvas) return
      const handleWheel = (event: WheelEvent) => {
        event.stopPropagation()
        event.preventDefault()
        const dir = event.deltaY > 0 ? -1 : 1
        setBrushSize((prev) => Math.min(BRUSH_MAX_SIZE, Math.max(BRUSH_MIN_SIZE, prev + dir * 1)))
      }
      canvas.addEventListener('wheel', handleWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', handleWheel)
    }, [active, setBrushSize])

    // Expose controls to parent
    useImperativeHandle(ref, () => ({
      brushSize,
      setBrushSize,
      undo: handleUndo,
      redo: handleRedo,
      clear: handleClear,
      canUndo: historyRef.current.length > 1,
      canRedo: redoRef.current.length > 0,
    }), [brushSize, handleUndo, handleRedo, handleClear])

    if (!active) return null

    return (
      <>
        {/* Invisible sizing container to measure parent */}
        <div ref={containerRef} className="pointer-events-none absolute inset-0" style={{ zIndex: -1 }} />
        {/* Hidden mask canvas (white = masked area) */}
        <canvas ref={maskRef} className="hidden" />
        {/* Visible overlay canvas — positioned to match object-contain image area */}
        <canvas
          ref={overlayRef}
          className="nodrag nopan absolute cursor-none touch-none"
          style={{
            zIndex: 10,
            left: displayRect.x,
            top: displayRect.y,
            width: displayRect.w,
            height: displayRect.h,
          }}
          data-board-editor
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
        {/* Brush cursor — positioned relative to the parent container */}
        {cursorPos ? (
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/80"
            style={{
              zIndex: 11,
              left: cursorPos.x,
              top: cursorPos.y,
              width: brushSize,
              height: brushSize,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
            }}
          />
        ) : null}
      </>
    )
  },
))
