/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use client'

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from 'react'
import { cn } from '@udecode/cn'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type {
  CanvasNodeElement,
  CanvasNodeViewProps,
  CanvasSnapshot,
  CanvasViewState,
} from '../../engine/types'
import { getGroupOutlinePadding, isGroupNodeType } from '../../engine/grouping'

type DomNodeLayerProps = {
  engine: CanvasEngine
  snapshot: CanvasSnapshot
}

// ---------------------------------------------------------------------------
// 单个节点的 memo 组件（核心性能优化）
// ---------------------------------------------------------------------------

type DomNodeItemProps = {
  element: CanvasNodeElement
  View: ComponentType<CanvasNodeViewProps<Record<string, unknown>>>
  selected: boolean
  editing: boolean
  expanded: boolean
  groupPadding: number
  onSelect: () => void
  onUpdate: (patch: Record<string, unknown>) => void
}

/** Z-index boost applied to expanded nodes so they appear above all others. */
const EXPANDED_Z_INDEX_BOOST = 9999

/** 单个节点渲染。memo 确保只有 props 变化时才重渲染。 */
const DomNodeItem = memo(function DomNodeItem({
  element,
  View,
  selected,
  editing,
  expanded,
  groupPadding,
  onSelect,
  onUpdate,
}: DomNodeItemProps) {
  const [x, y, w, h] = element.xywh
  const padding = isGroupNodeType(element.type) ? groupPadding : 0
  const baseZ = element.zIndex ?? 0

  return (
    <div
      data-board-node
      data-element-id={element.id}
      data-board-editor={editing || undefined}
      data-node-type={element.type}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      className={cn(
        'absolute',
        editing ? 'select-text' : 'select-none',
        isGroupNodeType(element.type)
          ? 'pointer-events-none'
          : 'pointer-events-auto',
        // 逻辑：展开的节点使用 overflow-visible 让内嵌面板溢出节点边界，
        // 不修改 Yjs xywh，面板展开是纯本地 UI 状态。
        expanded ? 'overflow-visible' : 'overflow-hidden',
      )}
      style={{
        left: x - padding,
        top: y - padding,
        width: w + padding * 2,
        height: h + padding * 2,
        zIndex: expanded ? baseZ + EXPANDED_Z_INDEX_BOOST : baseZ,
        transform: element.rotate
          ? `rotate(${element.rotate}deg)`
          : undefined,
        transformOrigin: 'center',
      }}
    >
      <div className="h-full w-full">
        <View
          element={element}
          selected={selected}
          editing={editing}
          expanded={expanded}
          onSelect={onSelect}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  )
}, (prev, next) => {
  // 逻辑：只有元素数据、选中/编辑状态变化时才重渲染。
  // 拖动其他节点时，未变化的节点完全跳过渲染。
  if (prev.element !== next.element) return false
  if (prev.selected !== next.selected) return false
  if (prev.editing !== next.editing) return false
  if (prev.expanded !== next.expanded) return false
  if (prev.groupPadding !== next.groupPadding) return false
  return true
})

// ---------------------------------------------------------------------------
// DOM 节点层
// ---------------------------------------------------------------------------

/**
 * DOM 节点渲染层（混合架构）。
 *
 * 所有节点始终使用 React DOM 组件渲染，保证富文本、视频、表单等完整交互。
 * 整层通过 CSS transform 跟随视口变换。
 *
 * 性能优化：每个节点包装为 memo 组件，拖动时只有位置变化的节点重渲染，
 * 其他节点完全跳过 React 协调。
 */
function DomNodeLayerBase({ engine, snapshot }: DomNodeLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const transformRafRef = useRef<number | null>(null)
  const pendingViewRef = useRef<CanvasViewState | null>(null)

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

  const { zoom, offset } = snapshot.viewport
  const groupPadding = getGroupOutlinePadding(zoom)
  const selectedNodeIds = new Set(
    snapshot.selectedIds.filter(id => {
      const el = snapshot.elements.find(e => e.id === id)
      return el?.kind === 'node'
    }),
  )

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
      {snapshot.elements.map(element => {
        if (element.kind !== 'node') return null
        if (element.type === 'stroke') return null

        const definition = engine.nodes.getDefinition(element.type)
        if (!definition) return null

        const selected = selectedNodeIds.has(element.id)
        const editing = element.id === snapshot.editingNodeId
        const expanded = element.id === snapshot.expandedNodeId

        return (
          <DomNodeItem
            key={element.id}
            element={element}
            View={definition.view as ComponentType<CanvasNodeViewProps<Record<string, unknown>>>}
            selected={selected}
            editing={editing}
            expanded={expanded}
            groupPadding={groupPadding}
            onSelect={() => engine.selection.setSelection([element.id])}
            onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
          />
        )
      })}
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
  if (prev.snapshot.expandedNodeId !== next.snapshot.expandedNodeId) return false
  const prevSel = prev.snapshot.selectedIds
  const nextSel = next.snapshot.selectedIds
  if (prevSel.length !== nextSel.length) return false
  for (let i = 0; i < prevSel.length; i++) {
    if (prevSel[i] !== nextSel[i]) return false
  }
  return true
}

export const DomNodeLayer = memo(DomNodeLayerBase, areDomNodeLayerPropsEqual)
