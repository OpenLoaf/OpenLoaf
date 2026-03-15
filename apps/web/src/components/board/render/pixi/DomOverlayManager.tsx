/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@udecode/cn'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type { CanvasNodeElement, CanvasSnapshot } from '../../engine/types'
import { isGroupNodeType, getGroupOutlinePadding } from '../../engine/grouping'

type DomOverlayManagerProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine
  /** Current snapshot from engine. */
  snapshot: CanvasSnapshot
  /** Callback to hide a PixiJS node by id (set visible=false). */
  onPixiNodeVisibility?: (nodeId: string, visible: boolean) => void
}

/**
 * DOM overlay manager for PixiJS canvas.
 *
 * When a node enters edit mode (snapshot.editingNodeId), this component mounts
 * the existing React view component as a positioned DOM overlay on top of the
 * PixiJS canvas. Rich text (Plate.js), video players, and form inputs cannot
 * run inside WebGL, so this DOM overlay bridges the gap.
 *
 * Lifecycle:
 *   1. editingNodeId changes to a node id
 *   2. Hide the corresponding PixiJS sprite (onPixiNodeVisibility)
 *   3. Mount the React view component at the correct screen position
 *   4. Update position on viewport changes
 *   5. On edit complete (editingNodeId → null): unmount overlay, show PixiJS node
 */
export function DomOverlayManager({
  engine,
  snapshot,
  onPixiNodeVisibility,
}: DomOverlayManagerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const prevEditingIdRef = useRef<string | null>(null)

  const editingId = snapshot.editingNodeId
  const editingElement = editingId
    ? (snapshot.elements.find(
        (el) => el.kind === 'node' && el.id === editingId,
      ) as CanvasNodeElement | undefined) ?? null
    : null

  // 管理 PixiJS 节点的可见性
  useEffect(() => {
    const prevId = prevEditingIdRef.current

    if (prevId && prevId !== editingId) {
      // 之前的编辑节点恢复显示
      onPixiNodeVisibility?.(prevId, true)
    }

    if (editingId) {
      // 当前编辑节点隐藏 PixiJS 渲染
      onPixiNodeVisibility?.(editingId, false)
    }

    prevEditingIdRef.current = editingId
  }, [editingId, onPixiNodeVisibility])

  // 清理：组件卸载时恢复所有隐藏的节点
  useEffect(() => {
    return () => {
      const lastId = prevEditingIdRef.current
      if (lastId) {
        onPixiNodeVisibility?.(lastId, true)
      }
    }
  }, [onPixiNodeVisibility])

  // 视口变化时强制更新 transform
  const [viewRevision, setViewRevision] = useState(0)
  useEffect(() => {
    const unsub = engine.subscribeView(() => {
      setViewRevision((r) => r + 1)
    })
    return unsub
  }, [engine])

  if (!editingElement) return null

  const { zoom, offset } = snapshot.viewport
  const [x, y, w, h] = editingElement.xywh
  const padding = isGroupNodeType(editingElement.type)
    ? getGroupOutlinePadding(zoom)
    : 0

  // 世界坐标 → 屏幕坐标
  const screenX = x * zoom + offset[0] - padding * zoom
  const screenY = y * zoom + offset[1] - padding * zoom
  const screenW = (w + padding * 2) * zoom
  const screenH = (h + padding * 2) * zoom

  const definition = engine.nodes.getDefinition(editingElement.type)
  if (!definition) return null

  const View = definition.view

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <div
        data-board-node
        data-element-id={editingElement.id}
        data-board-editor
        data-node-type={editingElement.type}
        data-selected
        className={cn(
          'absolute select-text',
          isGroupNodeType(editingElement.type) && 'pointer-events-none',
        )}
        style={{
          left: screenX,
          top: screenY,
          width: screenW,
          height: screenH,
          transformOrigin: 'top left',
          transform: editingElement.rotate
            ? `rotate(${editingElement.rotate}deg)`
            : undefined,
          pointerEvents: 'auto',
        }}
      >
        <div
          className="h-full w-full"
          style={{
            // 内容在 zoom 下缩放回世界坐标尺寸，然后由外层的 screenW/H 控制容器大小
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: w + padding * 2,
            height: h + padding * 2,
          }}
        >
          <View
            element={editingElement}
            selected
            editing
            onSelect={() => engine.selection.setSelection([editingElement.id])}
            onUpdate={(patch) =>
              engine.doc.updateNodeProps(editingElement.id, patch)
            }
          />
        </div>
      </div>
    </div>
  )
}
