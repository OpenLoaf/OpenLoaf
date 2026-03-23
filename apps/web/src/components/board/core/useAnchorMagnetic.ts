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
) {
  const refsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  // 逻辑：记录上一次热区状态，用于切换 transition。
  const prevInHotzoneMap = useRef<Map<string, boolean>>(new Map())
  // 逻辑：用 ref 持有 anchors，让 RAF 循环读取最新值而不重启 useEffect。
  const anchorsRef = useRef(anchors)
  anchorsRef.current = anchors

  const setRef = useCallback((anchorId: string, el: HTMLDivElement | null) => {
    if (el) {
      refsMap.current.set(anchorId, el)
    } else {
      refsMap.current.delete(anchorId)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      // 逻辑：失活时淡出所有 icon。
      for (const [, el] of refsMap.current) {
        el.style.transition = 'opacity 200ms ease'
        el.style.transform = 'translate(0px, 0px) scale(1)'
        el.style.opacity = '0'
      }
      prevInHotzoneMap.current.clear()
      return
    }

    // 逻辑：激活时纯淡入显示。
    for (const entry of anchorsRef.current) {
      const el = refsMap.current.get(entry.anchorId)
      if (!el) continue
      // 先设初始状态（无过渡，立刻就位）。
      el.style.transition = 'none'
      el.style.transform = 'translate(0px, 0px) scale(1)'
      el.style.opacity = '0'
      // 强制 reflow 使上一帧生效。
      el.getBoundingClientRect()
      // 然后淡入到可见状态。
      el.style.transition = 'opacity 200ms ease-out'
      el.style.transform = 'translate(0px, 0px) scale(1)'
      el.style.opacity = '1'
    }

    let rafId: number

    const animate = () => {
      const entries = anchorsRef.current
      const cursor = engine.getCursorWorld()
      const zoom = engine.viewport.getState().zoom

      for (const entry of entries) {
        const el = refsMap.current.get(entry.anchorId)
        if (!el) continue

        if (!cursor) {
          // 鼠标不在画布上 → 保持基准位置。
          if (prevInHotzoneMap.current.get(entry.anchorId)) {
            el.style.transition = `transform ${ANCHOR_BOUNCE_DURATION_MS}ms ${ANCHOR_BOUNCE_EASING}`
            el.style.transform = 'translate(0px, 0px) scale(1)'
            prevInHotzoneMap.current.set(entry.anchorId, false)
          }
          continue
        }

        // 逻辑：计算鼠标到锚点中心的屏幕像素距离。
        const dx = (cursor[0] - entry.worldPoint[0]) * zoom
        const dy = (cursor[1] - entry.worldPoint[1]) * zoom
        const dist = Math.hypot(dx, dy)
        const inHotzone = dist < ANCHOR_HOTZONE_RADIUS
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

    // 逻辑：入场动画结束后启动 RAF 循环（200ms 后）。
    const startTimer = window.setTimeout(() => {
      rafId = requestAnimationFrame(animate)
    }, 200)

    return () => {
      window.clearTimeout(startTimer)
      cancelAnimationFrame(rafId)
    }
  }, [active, engine])

  return { setRef }
}
