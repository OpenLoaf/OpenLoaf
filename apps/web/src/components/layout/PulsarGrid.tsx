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

import { useEffect, useRef, useState } from 'react'

/**
 * PulsarGrid renders a TE-style interactive dot-network canvas.
 * Optimised for 60 fps via spatial grid O(n·k) + batched draw calls.
 * Adapted from OpenLoaf-saas hero background.
 */
export function PulsarGrid({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mousePos = useRef({ x: -1, y: -1 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dots: { x: number; y: number }[] = []
    let opacities = new Float32Array(0)
    let radii = new Float32Array(0)
    let frameId: number | null = null
    let time = 0

    const SPACING = 44
    const CONN_DIST = SPACING * 1.55

    let spatialGrid: number[][] | null = null
    let gridCols = 0
    let gridRows = 0

    const setup = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.scale(dpr, dpr)

      dots = []
      for (let x = 0; x <= width; x += SPACING) {
        for (let y = 0; y <= height; y += SPACING) {
          dots.push({ x: x + SPACING / 2, y: y + SPACING / 2 })
        }
      }
      opacities = new Float32Array(dots.length)
      radii = new Float32Array(dots.length)

      gridCols = Math.ceil(width / CONN_DIST) + 1
      gridRows = Math.ceil(height / CONN_DIST) + 1
      spatialGrid = Array.from({ length: gridCols * gridRows }, () => [])
      for (let i = 0; i < dots.length; i++) {
        const gc = Math.floor(dots[i].x / CONN_DIST)
        const gr = Math.floor(dots[i].y / CONN_DIST)
        spatialGrid[gc * gridRows + gr].push(i)
      }

      setReady(true)
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      const t = time * 0.005
      const autoX = width * 0.5 + Math.sin(t * 1.3) * width * 0.28
      const autoY = height * 0.5 + Math.cos(t * 0.71) * height * 0.22

      const hasMouse = mousePos.current.x >= 0
      const mx = hasMouse ? mousePos.current.x : autoX
      const my = hasMouse ? mousePos.current.y : autoY

      const n = dots.length

      for (let i = 0; i < n; i++) {
        const px = dots[i].x
        const py = dots[i].y
        const w1 = Math.sin(
          Math.hypot(px - mx, py - my) * 0.021 - time * 0.037,
        )
        const w2 =
          Math.sin(Math.hypot(px - autoX, py - autoY) * 0.017 - time * 0.028) *
          0.55
        const wave = Math.max(w1, w2)
        opacities[i] = Math.max(0, wave * 0.82)
        radii[i] = 1 + Math.max(0, wave) * 2.4
      }

      if (!spatialGrid) return

      ctx.lineWidth = 0.4

      ctx.strokeStyle = 'rgba(255,204,0,0.12)'
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        if (opacities[i] < 0.12) continue
        const ax = dots[i].x
        const ay = dots[i].y
        const gc = Math.floor(ax / CONN_DIST)
        const gr = Math.floor(ay / CONN_DIST)

        for (let dc = -1; dc <= 1; dc++) {
          const nc = gc + dc
          if (nc < 0 || nc >= gridCols) continue
          for (let dr = -1; dr <= 1; dr++) {
            const nr = gr + dr
            if (nr < 0 || nr >= gridRows) continue
            for (const j of spatialGrid[nc * gridRows + nr]) {
              if (j <= i || opacities[j] < 0.12) continue
              const d = Math.hypot(ax - dots[j].x, ay - dots[j].y)
              if (d > CONN_DIST) continue
              if (Math.min(opacities[i], opacities[j]) < 0.2) continue
              ctx.moveTo(ax, ay)
              ctx.lineTo(dots[j].x, dots[j].y)
            }
          }
        }
      }
      ctx.stroke()

      ctx.strokeStyle = 'rgba(255,204,0,0.28)'
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        if (opacities[i] < 0.55) continue
        const ax = dots[i].x
        const ay = dots[i].y
        const gc = Math.floor(ax / CONN_DIST)
        const gr = Math.floor(ay / CONN_DIST)

        for (let dc = -1; dc <= 1; dc++) {
          const nc = gc + dc
          if (nc < 0 || nc >= gridCols) continue
          for (let dr = -1; dr <= 1; dr++) {
            const nr = gr + dr
            if (nr < 0 || nr >= gridRows) continue
            for (const j of spatialGrid[nc * gridRows + nr]) {
              if (j <= i || opacities[j] < 0.55) continue
              const d = Math.hypot(ax - dots[j].x, ay - dots[j].y)
              if (d > CONN_DIST) continue
              ctx.moveTo(ax, ay)
              ctx.lineTo(dots[j].x, dots[j].y)
            }
          }
        }
      }
      ctx.stroke()

      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        if (opacities[i] > 0.05) continue
        ctx.moveTo(dots[i].x + 0.5, dots[i].y)
        ctx.arc(dots[i].x, dots[i].y, 0.5, 0, Math.PI * 2)
      }
      ctx.fill()

      const dotBuckets = [
        { minOp: 0.05, maxOp: 0.35, style: 'rgba(255,204,0,0.35)' },
        { minOp: 0.35, maxOp: 0.65, style: 'rgba(255,204,0,0.6)' },
        { minOp: 0.65, maxOp: 1.0, style: 'rgba(255,204,0,0.85)' },
      ]
      for (const { minOp, maxOp, style } of dotBuckets) {
        ctx.fillStyle = style
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const op = opacities[i]
          if (op <= minOp || op > maxOp) continue
          ctx.moveTo(dots[i].x + radii[i], dots[i].y)
          ctx.arc(dots[i].x, dots[i].y, radii[i], 0, Math.PI * 2)
        }
        ctx.fill()
      }

      const scanY = ((time * 0.28) % (height + 80)) - 40
      if (scanY > -40 && scanY < height) {
        const g = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 5)
        g.addColorStop(0, 'rgba(255,204,0,0)')
        g.addColorStop(0.6, 'rgba(255,204,0,0.012)')
        g.addColorStop(1, 'rgba(255,204,0,0.04)')
        ctx.fillStyle = g
        ctx.fillRect(0, Math.max(0, scanY - 30), width, 35)
      }

      time++
      frameId = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const handleDocMouseLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) mousePos.current = { x: -1, y: -1 }
    }

    setup()
    animate()

    window.addEventListener('resize', setup)
    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleDocMouseLeave)

    return () => {
      window.removeEventListener('resize', setup)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleDocMouseLeave)
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${className}`}
      style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s ease-in' }}
    />
  )
}
