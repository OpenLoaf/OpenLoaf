/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use client'

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@udecode/cn'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type {
  CanvasNodeElement,
  CanvasSnapshot,
  CanvasViewState,
  CanvasViewportState,
} from '../../engine/types'
import { getGroupOutlinePadding, isGroupNodeType } from '../../engine/grouping'

/** 视口裁剪：屏幕空间外扩 padding（像素） */
const VIEWPORT_CULL_PADDING = 240
/** 启用裁剪的最小节点数 */
const CULLING_NODE_THRESHOLD = 40

type DomNodeLayerProps = {
  engine: CanvasEngine
  snapshot: CanvasSnapshot
}

/**
 * DOM 节点渲染层（混合架构）。
 *
 * 所有节点始终使用 React DOM 组件渲染，保证富文本、视频、表单等完整交互。
 * 整层通过 CSS transform 跟随视口变换（和旧 CanvasDomLayer 一致）。
 * PixiJS 仅负责连线、笔画、选区框等非节点内容。
 */
function DomNodeLayerBase({ engine, snapshot }: DomNodeLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const transformRafRef = useRef<number | null>(null)
  const pendingViewRef = useRef<CanvasViewState | null>(null)

  // 逻辑：通过 rAF 合并多个视口变化为单次 DOM transform 更新。
  const applyTransform = useCallback((view: CanvasViewState) => {
    const layer = layerRef.current
    if (!layer) return
    const { zoom, offset } = view.viewport
    layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`
    layer.style.willChange = view.panning ? 'transform' : ''
  }, [])

  const scheduleTransform = useCallback(
    (view: CanvasViewState) => {
      pendingViewRef.current = view
      if (transformRafRef.current !== null) return
      transformRafRef.current = window.requestAnimationFrame(() => {
        transformRafRef.current = null
        const next = pendingViewRef.current
        if (!next) return
        applyTransform(next)
      })
    },
    [applyTransform],
  )

  useEffect(() => {
    const handleViewChange = () => {
      const next = engine.getViewState()
      scheduleTransform(next)
    }
    handleViewChange()
    const unsub = engine.subscribeView(handleViewChange)
    return () => {
      unsub()
      if (transformRafRef.current !== null) {
        window.cancelAnimationFrame(transformRafRef.current)
        transformRafRef.current = null
      }
    }
  }, [engine, scheduleTransform])

  // 节点元素过滤和渲染
  const { zoom, offset } = snapshot.viewport
  const groupPadding = getGroupOutlinePadding(zoom)
  const selectedNodeIds = new Set(
    snapshot.selectedIds.filter(id => {
      const el = snapshot.elements.find(e => e.id === id)
      return el?.kind === 'node'
    }),
  )
  const draggingGroup =
    snapshot.draggingId !== null &&
    selectedNodeIds.size > 1 &&
    selectedNodeIds.has(snapshot.draggingId)

  const nodeViews: ReactNode[] = []
  snapshot.elements.forEach(element => {
    if (element.kind !== 'node') return
    // 笔画节点由 PixiJS StrokeLayer 渲染，跳过
    if (element.type === 'stroke') return

    const definition = engine.nodes.getDefinition(element.type)
    if (!definition) return

    const View = definition.view
    const [x, y, w, h] = element.xywh
    const selected = selectedNodeIds.has(element.id)
    const isDragging =
      snapshot.draggingId === element.id || (draggingGroup && selected)
    const isEditing = element.id === snapshot.editingNodeId
    const padding = isGroupNodeType(element.type) ? groupPadding : 0

    nodeViews.push(
      <div
        key={element.id}
        data-board-node
        data-element-id={element.id}
        data-board-editor={isEditing || undefined}
        data-node-type={element.type}
        data-selected={selected || undefined}
        className={cn(
          'absolute',
          isEditing ? 'select-text' : 'select-none',
          isGroupNodeType(element.type)
            ? 'pointer-events-none'
            : 'pointer-events-auto',
        )}
        style={{
          left: x - padding,
          top: y - padding,
          width: w + padding * 2,
          height: h + padding * 2,
          zIndex: element.zIndex ?? 0,
          transform: element.rotate
            ? `rotate(${element.rotate}deg)`
            : undefined,
          transformOrigin: 'center',
        }}
      >
        <div className="h-full w-full transition-transform duration-150 ease-out">
          <View
            element={element}
            selected={selected}
            editing={isEditing}
            onSelect={() => engine.selection.setSelection([element.id])}
            onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
          />
        </div>
      </div>,
    )
  })

  return (
    <div
      ref={layerRef}
      className={cn(
        'pointer-events-none absolute inset-0 origin-top-left',
        snapshot.editingNodeId && 'select-text',
      )}
      style={{
        transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
      }}
    >
      {nodeViews}
    </div>
  )
}

function areDomNodeLayerPropsEqual(
  prev: DomNodeLayerProps,
  next: DomNodeLayerProps,
): boolean {
  if (prev.engine !== next.engine) return false
  if (prev.snapshot.elements !== next.snapshot.elements) return false
  if (prev.snapshot.draggingId !== next.snapshot.draggingId) return false
  if (prev.snapshot.editingNodeId !== next.snapshot.editingNodeId) return false
  const prevSel = prev.snapshot.selectedIds
  const nextSel = next.snapshot.selectedIds
  if (prevSel.length !== nextSel.length) return false
  for (let i = 0; i < prevSel.length; i++) {
    if (prevSel[i] !== nextSel[i]) return false
  }
  return true
}

export const DomNodeLayer = memo(DomNodeLayerBase, areDomNodeLayerPropsEqual)
