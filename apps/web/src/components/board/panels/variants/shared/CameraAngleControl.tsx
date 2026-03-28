/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { cn } from '@udecode/cn'
import { Video } from 'lucide-react'
import { Slider } from '@openloaf/ui/slider'
import type { ParamField, SelectField, SliderField } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAMERA_ANGLE_KEYS = new Set([
  'horizontalAngle',
  'verticalAngle',
  'zoom',
  'focalLength',
])

/** Default param overrides for camera angle fields. */
export const CAMERA_ANGLE_DEFAULTS: Record<string, number> = {
  horizontalAngle: 40,
  verticalAngle: -20,
}

const ANGLE_PRESETS = [
  { id: 'front', h: 0, v: 0 },
  { id: 'left', h: -90, v: 0 },
  { id: 'right', h: 90, v: 0 },
  { id: 'back', h: 180, v: 0 },
  { id: 'top', h: 0, v: 45 },
  { id: 'bottom', h: 0, v: -45 },
  { id: 'front-left', h: -45, v: 15 },
  { id: 'front-right', h: 45, v: 15 },
] as const

/** Map preset id to i18n key under cameraAngle.presets. */
const PRESET_I18N_KEY: Record<string, string> = {
  'front': 'front',
  'left': 'left',
  'right': 'right',
  'back': 'back',
  'top': 'top',
  'bottom': 'bottom',
  'front-left': 'frontLeft',
  'front-right': 'frontRight',
}

export function isCameraAngleParams(fields: { key: string }[]): boolean {
  return fields.some((f) => CAMERA_ANGLE_KEYS.has(f.key))
}

export function splitCameraAngleFields<T extends { key: string }>(
  fields: T[],
): { cameraFields: T[]; otherFields: T[] } {
  const cameraFields: T[] = []
  const otherFields: T[] = []
  for (const f of fields) {
    if (CAMERA_ANGLE_KEYS.has(f.key)) cameraFields.push(f)
    else otherFields.push(f)
  }
  return { cameraFields, otherFields }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CameraAngleControlProps {
  fields: ParamField[]
  params: Record<string, unknown>
  onChange: (key: string, val: unknown) => void
  disabled?: boolean
  sourceImageUrl?: string
  children?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Focal length config
// ---------------------------------------------------------------------------

interface FocalConfig {
  perspDist: number
  distortK: number
  scale: number
}

const FOCAL_MAP: Record<string, FocalConfig> = {
  'ultra-wide': { perspDist: 1.6, distortK: 0.32, scale: 0.72 },
  'wide': { perspDist: 2.0, distortK: 0.15, scale: 0.82 },
  'standard': { perspDist: 3.0, distortK: 0, scale: 0.92 },
  'medium-tele': { perspDist: 3.5, distortK: -0.06, scale: 1.0 },
  'telephoto': { perspDist: 6.0, distortK: -0.1, scale: 1.08 },
  'super-tele': { perspDist: 12.0, distortK: -0.12, scale: 1.15 },
}
const FOCAL_DEFAULT: FocalConfig = FOCAL_MAP['standard']

// ---------------------------------------------------------------------------
// Face labels
// ---------------------------------------------------------------------------

function getFaceLabel(face: string): string {
  return i18next.t(`board:cameraAngle.faces.${face}`)
}

// ---------------------------------------------------------------------------
// 3D math
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number]
const DEG = Math.PI / 180
const S = 0.5 // cube half-size

const CUBE_VERTS: Vec3[] = [
  [-S, -S, -S], // 0
  [-S, -S, S], // 1
  [-S, S, -S], // 2
  [-S, S, S], // 3
  [S, -S, -S], // 4
  [S, -S, S], // 5
  [S, S, -S], // 6
  [S, S, S], // 7
]

// TL, TR, BR, BL as seen from outside
const CUBE_FACES = [
  { name: 'front', idx: [3, 7, 5, 1], normal: [0, 0, 1] as Vec3 },
  { name: 'back', idx: [6, 2, 0, 4], normal: [0, 0, -1] as Vec3 },
  { name: 'left', idx: [2, 3, 1, 0], normal: [-1, 0, 0] as Vec3 },
  { name: 'right', idx: [7, 6, 4, 5], normal: [1, 0, 0] as Vec3 },
  { name: 'top', idx: [2, 6, 7, 3], normal: [0, 1, 0] as Vec3 },
  { name: 'bottom', idx: [1, 5, 4, 0], normal: [0, -1, 0] as Vec3 },
]

function rotatePoint(p: Vec3, hDeg: number, vDeg: number): Vec3 {
  const h = hDeg * DEG
  const v = vDeg * DEG
  const cosH = Math.cos(h)
  const sinH = Math.sin(h)
  const cosV = Math.cos(v)
  const sinV = Math.sin(v)
  const [x, y, z] = p
  const x1 = x * cosH + z * sinH
  const z1 = -x * sinH + z * cosH
  const y2 = y * cosV - z1 * sinV
  const z2 = y * sinV + z1 * cosV
  return [x1, y2, z2]
}

function projectAndDistort(
  p: Vec3,
  perspDist: number,
  distortK: number,
  cx: number,
  cy: number,
  baseScale: number,
  maxR: number,
): { x: number; y: number; z: number } {
  const [x, y, z] = p
  const d = perspDist - z
  const pScale = d > 0.05 ? perspDist / d : perspDist / 0.05
  const sx = cx + x * pScale * baseScale
  const sy = cy - y * pScale * baseScale

  if (Math.abs(distortK) < 0.001) return { x: sx, y: sy, z }

  const dx = sx - cx
  const dy = sy - cy
  const rn = maxR > 0 ? Math.sqrt(dx * dx + dy * dy) / maxR : 0
  const factor = 1 + distortK * rn * rn
  return { x: cx + dx * factor, y: cy + dy * factor, z }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const EDGE_STEPS = 16
const IMG_SUBDIV = 10

function buildFacePath(
  ctx: CanvasRenderingContext2D,
  verts: Vec3[],
  perspDist: number,
  distortK: number,
  cx: number,
  cy: number,
  scale: number,
  maxR: number,
) {
  ctx.beginPath()
  for (let e = 0; e < 4; e++) {
    const v0 = verts[e]
    const v1 = verts[(e + 1) % 4]
    for (let i = 0; i <= EDGE_STEPS; i++) {
      const t = i / EDGE_STEPS
      const p: Vec3 = [
        v0[0] + (v1[0] - v0[0]) * t,
        v0[1] + (v1[1] - v0[1]) * t,
        v0[2] + (v1[2] - v0[2]) * t,
      ]
      const pt = projectAndDistort(p, perspDist, distortK, cx, cy, scale, maxR)
      if (e === 0 && i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
  }
  ctx.closePath()
}

function drawTriangleTex(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  dx0: number, dy0: number,
  dx1: number, dy1: number,
  dx2: number, dy2: number,
) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(dx0, dy0)
  ctx.lineTo(dx1, dy1)
  ctx.lineTo(dx2, dy2)
  ctx.closePath()
  ctx.clip()
  const denom =
    sx0 * (sy1 - sy2) - sx1 * (sy0 - sy2) + sx2 * (sy0 - sy1)
  if (Math.abs(denom) < 1e-6) {
    ctx.restore()
    return
  }
  const a =
    (dx0 * (sy1 - sy2) - dx1 * (sy0 - sy2) + dx2 * (sy0 - sy1)) / denom
  const b =
    (dy0 * (sy1 - sy2) - dy1 * (sy0 - sy2) + dy2 * (sy0 - sy1)) / denom
  const c =
    (sx0 * (dx1 - dx2) - sx1 * (dx0 - dx2) + sx2 * (dx0 - dx1)) / denom
  const d =
    (sx0 * (dy1 - dy2) - sx1 * (dy0 - dy2) + sx2 * (dy0 - dy1)) / denom
  const e =
    (sx0 * (sy1 * dx2 - sy2 * dx1) -
      sx1 * (sy0 * dx2 - sy2 * dx0) +
      sx2 * (sy0 * dx1 - sy1 * dx0)) /
    denom
  const f =
    (sx0 * (sy1 * dy2 - sy2 * dy1) -
      sx1 * (sy0 * dy2 - sy2 * dy0) +
      sx2 * (sy0 * dy1 - sy1 * dy0)) /
    denom
  ctx.setTransform(a, b, c, d, e, f)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}

function drawTextureOnFace(
  ctx: CanvasRenderingContext2D,
  tex: CanvasImageSource,
  texW: number,
  texH: number,
  faceVerts: Vec3[],
  perspDist: number,
  distortK: number,
  cx: number,
  cy: number,
  scale: number,
  maxR: number,
) {
  const [tl, tr, br, bl] = faceVerts
  const iw = texW
  const ih = texH
  const N = Math.abs(distortK) > 0.001 ? IMG_SUBDIV : 1

  const grid: { x: number; y: number }[][] = []
  for (let row = 0; row <= N; row++) {
    const rowPts: { x: number; y: number }[] = []
    const v = row / N
    for (let col = 0; col <= N; col++) {
      const u = col / N
      const p: Vec3 = [
        (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + u * v * br[0] + (1 - u) * v * bl[0],
        (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + u * v * br[1] + (1 - u) * v * bl[1],
        (1 - u) * (1 - v) * tl[2] + u * (1 - v) * tr[2] + u * v * br[2] + (1 - u) * v * bl[2],
      ]
      const pt = projectAndDistort(p, perspDist, distortK, cx, cy, scale, maxR)
      rowPts.push(pt)
    }
    grid.push(rowPts)
  }

  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const p00 = grid[row][col]
      const p10 = grid[row][col + 1]
      const p01 = grid[row + 1][col]
      const p11 = grid[row + 1][col + 1]
      const su = (col / N) * iw
      const sv = (row / N) * ih
      const eu = ((col + 1) / N) * iw
      const ev = ((row + 1) / N) * ih
      drawTriangleTex(ctx, tex, su, sv, eu, sv, su, ev, p00.x, p00.y, p10.x, p10.y, p01.x, p01.y)
      drawTriangleTex(ctx, tex, eu, sv, eu, ev, su, ev, p10.x, p10.y, p11.x, p11.y, p01.x, p01.y)
    }
  }
}

// ---------------------------------------------------------------------------
// Text texture cache
// ---------------------------------------------------------------------------

const TEX_SIZE = 128
const textTexCache = new Map<string, HTMLCanvasElement>()

function getTextTex(label: string, isDark: boolean): HTMLCanvasElement {
  const key = `${label}:${isDark}`
  const cached = textTexCache.get(key)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = TEX_SIZE
  c.height = TEX_SIZE
  const ctx = c.getContext('2d')!
  ctx.font = `bold ${TEX_SIZE * 0.5}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'
  ctx.fillText(label, TEX_SIZE / 2, TEX_SIZE / 2)
  textTexCache.set(key, c)
  return c
}

// ---------------------------------------------------------------------------
// Main scene drawing
// ---------------------------------------------------------------------------

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hAngle: number,
  vAngle: number,
  perspDist: number,
  distortK: number,
  cubeScale: number,
  dpr: number,
  img: HTMLImageElement | null,
) {
  const cx = w / 2
  const cy = h / 2
  const baseScale = Math.min(w, h) * 0.52 * cubeScale
  const maxR = Math.min(w, h) * 0.5
  const isDark = document.documentElement.classList.contains('dark')

  ctx.clearRect(0, 0, w, h)

  // ── Spotlight beam from camera ──
  const beamTip = { x: cx, y: h + 6 * dpr } // camera icon position (below canvas)
  const spread = baseScale * 1.1
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(beamTip.x, beamTip.y)
  ctx.lineTo(cx - spread, cy - baseScale * 0.3)
  ctx.lineTo(cx + spread, cy - baseScale * 0.3)
  ctx.closePath()
  const beamGrad = ctx.createLinearGradient(cx, beamTip.y, cx, cy - baseScale * 0.3)
  beamGrad.addColorStop(0, isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
  beamGrad.addColorStop(1, 'rgba(128,128,128,0)')
  ctx.fillStyle = beamGrad
  ctx.fill()
  ctx.restore()

  // Rotate all verts
  const rotated = CUBE_VERTS.map((v) => rotatePoint(v, hAngle, vAngle))

  // Sort faces back-to-front (lowest center z first)
  const sorted = CUBE_FACES.map((face) => {
    const centerZ =
      face.idx.reduce((s, i) => s + rotated[i][2], 0) / face.idx.length
    const rn = rotatePoint(face.normal, hAngle, vAngle)
    return { ...face, centerZ, isFrontFacing: rn[2] > 0 }
  }).sort((a, b) => a.centerZ - b.centerZ)

  const hasImg = img?.complete && (img.naturalWidth ?? 0) > 0

  // Draw pass 1: back-facing faces (semi-transparent, furthest first)
  // Draw pass 2: front-facing non-image faces (semi-transparent)
  // Draw pass 3: front face with image (opaque, on top)
  for (const face of sorted) {
    const verts = face.idx.map((i) => rotated[i])
    const isFrontImg = face.name === 'front' && hasImg

    // ── Fill ──
    ctx.save()
    buildFacePath(ctx, verts, perspDist, distortK, cx, cy, baseScale, maxR)
    if (isFrontImg) {
      // Skip dark fill under image — let image cover face directly to avoid
      // dark bleed through triangle seams. Use a clip-only approach.
    } else {
      const a = face.isFrontFacing ? 0.88 : 0.7
      ctx.fillStyle = isDark
        ? `rgba(28,28,28,${a})`
        : `rgba(245,245,245,${a})`
      ctx.fill()
    }
    ctx.restore()

    // ── Image on front face (drawn directly, no dark underlay) ──
    if (isFrontImg) {
      ctx.save()
      buildFacePath(ctx, verts, perspDist, distortK, cx, cy, baseScale, maxR)
      ctx.clip()
      // Fill face with image average-ish color first to seal any triangle gaps
      ctx.fillStyle = isDark ? '#2a2a2a' : '#e8e8e8'
      ctx.fillRect(0, 0, w, h)
      drawTextureOnFace(
        ctx, img!, img!.naturalWidth, img!.naturalHeight,
        verts, perspDist, distortK, cx, cy, baseScale, maxR,
      )
      ctx.restore()
    }

    // ── Text label mapped onto face ──
    if (!isFrontImg && face.isFrontFacing) {
      const textTex = getTextTex(getFaceLabel(face.name), isDark)
      ctx.save()
      buildFacePath(ctx, verts, perspDist, distortK, cx, cy, baseScale, maxR)
      ctx.clip()
      drawTextureOnFace(
        ctx, textTex, TEX_SIZE, TEX_SIZE,
        verts, perspDist, distortK, cx, cy, baseScale, maxR,
      )
      ctx.restore()
    }

    // ── Border ──
    ctx.save()
    buildFacePath(ctx, verts, perspDist, distortK, cx, cy, baseScale, maxR)
    ctx.strokeStyle = isDark
      ? `rgba(255,255,255,${face.isFrontFacing ? 0.3 : 0.08})`
      : `rgba(0,0,0,${face.isFrontFacing ? 0.18 : 0.05})`
    ctx.lineWidth = 1 * dpr
    ctx.stroke()
    ctx.restore()
  }

}

// ---------------------------------------------------------------------------
// CubePreview — canvas with barrel distortion
// ---------------------------------------------------------------------------

function CubePreview({
  hAngle,
  vAngle,
  focalLength,
  hasHorizontal,
  hasVertical,
  onDrag,
  disabled,
  sourceImageUrl,
}: {
  hAngle: number
  vAngle: number
  focalLength?: string
  hasHorizontal: boolean
  hasVertical: boolean
  onDrag: (dh: number, dv: number) => void
  disabled?: boolean
  sourceImageUrl?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgVer, setImgVer] = useState(0)

  const focal = FOCAL_MAP[focalLength ?? 'standard'] ?? FOCAL_DEFAULT

  const animRef = useRef({
    h: hAngle,
    v: vAngle,
    perspDist: focal.perspDist,
    distortK: focal.distortK,
    cubeScale: focal.scale,
    raf: 0,
    nudgePhase: 0,
    nudgeDone: false,
  })

  // Load image
  useEffect(() => {
    if (!sourceImageUrl) {
      imgRef.current = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = sourceImageUrl
    img.onload = () => {
      imgRef.current = img
      setImgVer((c) => c + 1)
    }
    imgRef.current = img
  }, [sourceImageUrl])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const anim = animRef.current
    if (isDragging.current) {
      anim.h = hAngle
      anim.v = vAngle
    }

    let running = true

    const tick = () => {
      if (!running) return
      const speed = isDragging.current ? 1 : 0.12

      let dh = hAngle - anim.h
      if (dh > 180) dh -= 360
      if (dh < -180) dh += 360
      anim.h += dh * speed
      anim.v += (vAngle - anim.v) * speed
      anim.perspDist += (focal.perspDist - anim.perspDist) * speed
      anim.distortK += (focal.distortK - anim.distortK) * speed
      anim.cubeScale += (focal.scale - anim.cubeScale) * speed
      if (anim.h > 180) anim.h -= 360
      if (anim.h < -180) anim.h += 360

      // Initial nudge: small wobble to hint draggability
      let nudgeOffset = 0
      if (!anim.nudgeDone && !isDragging.current) {
        anim.nudgePhase += 0.07
        if (anim.nudgePhase < Math.PI * 2) {
          nudgeOffset = Math.sin(anim.nudgePhase) * 12
        } else {
          anim.nudgeDone = true
        }
      }
      if (isDragging.current) anim.nudgeDone = true

      drawScene(
        ctx,
        canvas.width,
        canvas.height,
        anim.h + nudgeOffset,
        anim.v,
        anim.perspDist,
        anim.distortK,
        anim.cubeScale,
        dpr,
        imgRef.current,
      )

      const settled =
        Math.abs(dh) < 0.3 &&
        Math.abs(vAngle - anim.v) < 0.3 &&
        Math.abs(focal.perspDist - anim.perspDist) < 0.01 &&
        Math.abs(focal.distortK - anim.distortK) < 0.001

      if (!settled || !anim.nudgeDone) {
        anim.raf = requestAnimationFrame(tick)
      } else {
        anim.h = hAngle
        anim.v = vAngle
        anim.perspDist = focal.perspDist
        anim.distortK = focal.distortK
        anim.cubeScale = focal.scale
        drawScene(ctx, canvas.width, canvas.height, anim.h, anim.v, anim.perspDist, anim.distortK, anim.cubeScale, dpr, imgRef.current)
      }
    }

    cancelAnimationFrame(anim.raf)
    anim.raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(anim.raf)
    }
  }, [hAngle, vAngle, focal, imgVer])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = { x: e.clientX, y: e.clientY }
      isDragging.current = true
    },
    [disabled],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || disabled) return
      const dx = e.clientX - dragRef.current.x
      const dy = e.clientY - dragRef.current.y
      dragRef.current = { x: e.clientX, y: e.clientY }
      onDrag(hasHorizontal ? dx * 0.8 : 0, hasVertical ? dy * 0.8 : 0)
    },
    [disabled, hasHorizontal, hasVertical, onDrag],
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    isDragging.current = false
  }, [])

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        className={cn(
          'aspect-square w-full rounded-2xl border border-border/50 bg-muted/20',
          !disabled && 'cursor-grab active:cursor-grabbing',
          disabled && 'opacity-50',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <Video className="-mt-1.5 size-6 -rotate-90 text-muted-foreground/30" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PresetBar
// ---------------------------------------------------------------------------

function PresetBar({
  hAngle,
  vAngle,
  hasHorizontal,
  hasVertical,
  onSelect,
  disabled,
}: {
  hAngle: number
  vAngle: number
  hasHorizontal: boolean
  hasVertical: boolean
  onSelect: (h: number, v: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('board')

  const presets = ANGLE_PRESETS.filter((p) => {
    if (!hasHorizontal && p.h !== 0) return false
    if (!hasVertical && p.v !== 0) return false
    return true
  })

  const activePreset = presets.find(
    (p) =>
      (hasHorizontal ? Math.abs(p.h - hAngle) < 3 : true) &&
      (hasVertical ? Math.abs(p.v - vAngle) < 3 : true),
  )

  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((p) => {
        const isActive = activePreset?.id === p.id
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-150',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            onClick={() => onSelect(p.h, p.v)}
          >
            {t(`cameraAngle.presets.${PRESET_I18N_KEY[p.id] ?? p.id}`)}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LabeledSlider
// ---------------------------------------------------------------------------

function LabeledSlider({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SliderField
  value: number
  onChange: (val: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">
          {field.label}
        </span>
        <span className="min-w-[2rem] text-right text-[10px] tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        disabled={disabled}
        className="w-full"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// CameraAngleControl
// ---------------------------------------------------------------------------

const clamp = (val: number, min: number, max: number) =>
  Math.min(max, Math.max(min, val))

export function CameraAngleControl({
  fields,
  params,
  onChange,
  disabled,
  sourceImageUrl,
  children,
}: CameraAngleControlProps) {
  const hField = fields.find((f) => f.key === 'horizontalAngle') as
    | SliderField
    | undefined
  const vField = fields.find((f) => f.key === 'verticalAngle') as
    | SliderField
    | undefined
  const zField = fields.find((f) => f.key === 'zoom') as
    | SliderField
    | undefined
  const flField = fields.find((f) => f.key === 'focalLength') as
    | SelectField
    | undefined

  const hAngle = Number(params.horizontalAngle ?? hField?.default ?? 0)
  const vAngle = Number(params.verticalAngle ?? vField?.default ?? 0)
  const zoom = Number(params.zoom ?? zField?.default ?? 5)
  const focalLength = (params.focalLength ??
    flField?.default ??
    'standard') as string

  const handleDrag = useCallback(
    (dh: number, dv: number) => {
      if (hField) {
        let newH = Number(params.horizontalAngle ?? 0) + dh
        if (newH > 180) newH -= 360
        if (newH < -180) newH += 360
        onChange('horizontalAngle', Math.round(newH))
      }
      if (vField) {
        const cur = Number(params.verticalAngle ?? 0)
        onChange(
          'verticalAngle',
          Math.round(clamp(cur + dv, vField.min, vField.max)),
        )
      }
    },
    [hField, vField, params.horizontalAngle, params.verticalAngle, onChange],
  )

  const handlePresetSelect = useCallback(
    (h: number, v: number) => {
      if (hField) onChange('horizontalAngle', h)
      if (vField) onChange('verticalAngle', v)
    },
    [hField, vField, onChange],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled || !zField) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -(zField.step ?? 1) : (zField.step ?? 1)
      onChange('zoom', clamp(zoom + delta, zField.min, zField.max))
    },
    [disabled, zField, zoom, onChange],
  )

  return (
    <div className="flex flex-col gap-2">
      <PresetBar
        hAngle={hAngle}
        vAngle={vAngle}
        hasHorizontal={!!hField}
        hasVertical={!!vField}
        onSelect={handlePresetSelect}
        disabled={disabled}
      />

      <div className="flex gap-3">
        <div className="basis-4/10 shrink-0" onWheel={handleWheel}>
          <CubePreview
            hAngle={hAngle}
            vAngle={vAngle}
            focalLength={focalLength}
            hasHorizontal={!!hField}
            hasVertical={!!vField}
            onDrag={handleDrag}
            disabled={disabled}
            sourceImageUrl={sourceImageUrl}
          />
        </div>

        <div className="flex basis-6/10 flex-col justify-center gap-2.5">
          {hField ? (
            <LabeledSlider
              field={hField}
              value={hAngle}
              onChange={(v) => onChange('horizontalAngle', v)}
              disabled={disabled}
            />
          ) : null}
          {vField ? (
            <LabeledSlider
              field={vField}
              value={vAngle}
              onChange={(v) => onChange('verticalAngle', v)}
              disabled={disabled}
            />
          ) : null}
          {zField ? (
            <LabeledSlider
              field={zField}
              value={zoom}
              onChange={(v) => onChange('zoom', v)}
              disabled={disabled}
            />
          ) : null}
          {flField?.options?.length ? (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                {flField.label}
              </span>
              <div className="flex flex-wrap gap-1">
                {flField.options.map((opt) => {
                  const isActive = String(opt.value) === focalLength
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                      onClick={() => onChange('focalLength', opt.value)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  )
}
