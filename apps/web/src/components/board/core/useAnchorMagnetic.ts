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

import type { CanvasPoint } from '../engine/types'
import type { CanvasEngine } from '../engine/CanvasEngine'
import { useCallback, useEffect, useRef } from 'react'
import {
  ANCHOR_BOUNCE_DURATION_MS,
  ANCHOR_BOUNCE_EASING,
  ANCHOR_HOTZONE_RADIUS,
  ANCHOR_MAGNETIC_DURATION_MS,
  ANCHOR_MAGNETIC_MAX,
  ANCHOR_MAGNETIC_SCALE,
} from '../engine/constants'

export type AnchorEntry = {
  anchorId: string
  worldPoint: CanvasPoint
}

/** World-space bounding rect [x, y, w, h]. */
export type WorldRect = [number, number, number, number]

/** Check if a world point is inside the given rect (with optional padding in screen px). */
function isInsideRect(
  cursor: CanvasPoint,
  rect: WorldRect,
  zoom: number,
  paddingPx = 0,
): boolean {
  const pad = paddingPx / zoom
  return (
    cursor[0] >= rect[0] + pad &&
    cursor[0] <= rect[0] + rect[2] - pad &&
    cursor[1] >= rect[1] + pad &&
    cursor[1] <= rect[1] + rect[3] - pad
  )
}

/**
 * Magnetic-follow animation for anchor icons.
 *
 * Runs a RAF loop while `active` is true.  Reads `engine.getCursorWorld()`
 * (updated silently by SelectTool) and applies CSS transforms directly to
 * each registered icon DOM element via refs, bypassing React renders.
 *
 * Three visual states per icon:
 * 1. **Rest** — opacity 0, scale(1)
 * 2. **Visible idle** — at base position, scale(1), opacity 1
 * 3. **Magnetic follow** — translated toward cursor (clamped), scale(ANCHOR_MAGNETIC_SCALE)
 */
export function useAnchorMagnetic(
  engine: CanvasEngine,
  active: boolean,
  anchors: AnchorEntry[],
  /** Node bounding rect in world coords — magnetic only triggers outside this rect. */
  nodeRect?: WorldRect | null,
) {
  const refsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  // 逻辑：记录上一次热区状态，用于切换 transition。
  const prevInHotzoneMap = useRef<Map<string, boolean>>(new Map())
  // 逻辑：追踪是否正在淡出中，用于防止重新激活时瞬移闪烁。
  const fadingOutRef = useRef(false)
  // 逻辑：用 ref 持有 anchors，让 RAF 循环读取最新值而不重启 useEffect。
  const anchorsRef = useRef(anchors)
  anchorsRef.current = anchors
  const nodeRectRef = useRef(nodeRect)
  nodeRectRef.current = nodeRect

  const setRef = useCallback((anchorId: string, el: HTMLDivElement | null) => {
    if (el) {
      refsMap.current.set(anchorId, el)
    } else {
      refsMap.current.delete(anchorId)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      // 逻辑：失活时弹回中心再淡出。
      fadingOutRef.current = true
      for (const [, el] of refsMap.current) {
        el.style.transition = `transform ${ANCHOR_BOUNCE_DURATION_MS}ms ${ANCHOR_BOUNCE_EASING}, opacity 200ms ease ${ANCHOR_BOUNCE_DURATION_MS * 0.6}ms`
        el.style.transform = 'translate(0px, 0px) scale(1)'
        el.style.opacity = '0'
      }
      prevInHotzoneMap.current.clear()
      return
    }

    // 逻辑：判断是否从淡出中恢复（鼠标移回），此时用过渡动画而非瞬移，避免闪烁。
    const reEntry = fadingOutRef.current
    fadingOutRef.current = false

    const cursor = engine.getCursorWorld()
    const zoom = engine.viewport.getState().zoom
    for (const entry of anchorsRef.current) {
      const el = refsMap.current.get(entry.anchorId)
      if (!el) continue
      let tx = 0
      let ty = 0
      let inHotzone = false
      if (cursor) {
        const cursorInside = nodeRectRef.current && isInsideRect(cursor, nodeRectRef.current, zoom)
        if (!cursorInside) {
          const dx = (cursor[0] - entry.worldPoint[0]) * zoom
          const dy = (cursor[1] - entry.worldPoint[1]) * zoom
          const dist = Math.hypot(dx, dy)
          inHotzone = dist < ANCHOR_HOTZONE_RADIUS
          if (inHotzone) {
            const clamp = dist > ANCHOR_MAGNETIC_MAX ? ANCHOR_MAGNETIC_MAX / dist : 1
            tx = dx * clamp
            ty = dy * clamp
          }
        }
      }
      const targetTransform = inHotzone
        ? `translate(${tx}px, ${ty}px) scale(${ANCHOR_MAGNETIC_SCALE})`
        : 'translate(0px, 0px) scale(1)'

      if (reEntry) {
        // 淡出中恢复：从当前位置平滑过渡到目标位置，同时淡入。
        el.style.transition = `transform ${ANCHOR_BOUNCE_DURATION_MS}ms ${ANCHOR_BOUNCE_EASING}, opacity 150ms ease-out`
        el.style.transform = targetTransform
        el.style.opacity = '1'
      } else {
        // 首次出现：第一帧无过渡直接就位并隐藏，
        // 第二帧再启用 transition 淡入——完全避免同步布局刷新。
        el.style.transition = 'none'
        el.style.transform = targetTransform
        el.style.opacity = '0'
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 150ms ease-out'
          el.style.opacity = '1'
        })
      }
      prevInHotzoneMap.current.set(entry.anchorId, inHotzone)
    }

    let rafId: number

    const animate = () => {
      const entries = anchorsRef.current
      const cur = engine.getCursorWorld()
      const z = engine.viewport.getState().zoom

      for (const entry of entries) {
        const el = refsMap.current.get(entry.anchorId)
        if (!el) continue

        if (!cur) {
          // 鼠标不在画布上 → 弹回基准位置。
          if (prevInHotzoneMap.current.get(entry.anchorId)) {
            el.style.transition = `transform ${ANCHOR_BOUNCE_DURATION_MS}ms ${ANCHOR_BOUNCE_EASING}`
            el.style.transform = 'translate(0px, 0px) scale(1)'
            prevInHotzoneMap.current.set(entry.anchorId, false)
          }
          continue
        }

        // 逻辑：鼠标在节点内部时视为不在热区，只有节点外才触发磁吸。
        const cursorInside = nodeRectRef.current && isInsideRect(cur, nodeRectRef.current, z)
        const dx = (cur[0] - entry.worldPoint[0]) * z
        const dy = (cur[1] - entry.worldPoint[1]) * z
        const dist = Math.hypot(dx, dy)
        const inHotzone = !cursorInside && dist < ANCHOR_HOTZONE_RADIUS
        const wasInHotzone = prevInHotzoneMap.current.get(entry.anchorId) ?? false

        if (inHotzone) {
          const clamp = dist > ANCHOR_MAGNETIC_MAX ? ANCHOR_MAGNETIC_MAX / dist : 1
          const tx = dx * clamp
          const ty = dy * clamp
          el.style.transition = `transform ${ANCHOR_MAGNETIC_DURATION_MS}ms ease-out`
          el.style.transform = `translate(${tx}px, ${ty}px) scale(${ANCHOR_MAGNETIC_SCALE})`
          prevInHotzoneMap.current.set(entry.anchorId, true)
        } else if (wasInHotzone) {
          // 逻辑：离开热区 → 弹回基准位置，弹性过冲曲线。
          el.style.transition = `transform ${ANCHOR_BOUNCE_DURATION_MS}ms ${ANCHOR_BOUNCE_EASING}`
          el.style.transform = 'translate(0px, 0px) scale(1)'
          prevInHotzoneMap.current.set(entry.anchorId, false)
        }
      }

      rafId = requestAnimationFrame(animate)
    }

    // 逻辑：淡入完成后启动 RAF 磁吸跟随。
    const startTimer = window.setTimeout(() => {
      rafId = requestAnimationFrame(animate)
    }, 150)

    return () => {
      window.clearTimeout(startTimer)
      cancelAnimationFrame(rafId)
    }
  }, [active, engine])

  return { setRef }
}
