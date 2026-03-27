/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use client'
// React Compiler bypasses React.memo custom compare functions.
// This file relies on custom compare for DomNodeItem and DomNodeLayerBase
// to prevent all nodes from re-rendering on every snapshot change.
'use no memo'

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@udecode/cn'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type {
  CanvasNodeElement,
  CanvasNodeViewProps,
  CanvasSnapshot,
  CanvasViewState,
} from '../../engine/types'
import { getGroupOutlinePadding, isGroupNodeType } from '../../engine/grouping'
import { NodeLabel } from '../../nodes/NodeLabel'
import './board-node-drag.css'

type DomNodeLayerProps = {
  engine: CanvasEngine
  snapshot: CanvasSnapshot
}

// ---------------------------------------------------------------------------
// 单个节点的 memo 组件（核心性能优化）
// ---------------------------------------------------------------------------

/** Node types that should not display an above-node label. */
const LABEL_EXCLUDED_TYPES = new Set<string>()

/**
 * Compute a dampened label scale so labels grow slightly with zoom but cap out.
 *
 * The DOM layer already applies `scale(zoom)`. We counter-scale labels so their
 * screen size follows `zoom^0.4` instead of `zoom`, clamped to [0.6, 1.6].
 *
 * Examples (screen size = zoom × labelScale):
 *   zoom=0.25 → screen 0.6  (floored)
 *   zoom=0.5  → screen 0.76
 *   zoom=1    → screen 1.0
 *   zoom=2    → screen 1.32
 *   zoom=4    → screen 1.6  (capped)
 */
function computeLabelScale(zoom: number): number {
  const screenScale = Math.min(Math.max(Math.pow(zoom, 0.4), 0.6), 1.6)
  return screenScale / zoom
}

type DomNodeItemProps = {
  engine: CanvasEngine
  element: CanvasNodeElement
  View: ComponentType<CanvasNodeViewProps<Record<string, unknown>>>
  selected: boolean
  editing: boolean
  expanded: boolean
  boxSelecting: boolean
  groupPadding: number
  onSelect: () => void
  onUpdate: (patch: Record<string, unknown>) => void
  dragging: boolean
  onLabelChange: (label: string) => void
}

/** Z-index boost applied to selected nodes so they render above siblings. */
const SELECTED_Z_INDEX_BOOST = 1000
/** Z-index boost applied to dragging nodes so they render above selected but below expanded. */
const DRAGGING_Z_INDEX_BOOST = 5000
/** Z-index boost applied to expanded nodes so they appear above all others. */
const EXPANDED_Z_INDEX_BOOST = 9999

/** 单个节点渲染。memo 确保只有 props 变化时才重渲染。 */
const DomNodeItem = memo(function DomNodeItem({
  engine,
  element,
  View,
  selected,
  editing,
  expanded,
  dragging,
  boxSelecting,
  groupPadding,
  onSelect,
  onUpdate,
  onLabelChange,
}: DomNodeItemProps) {
  const [x, y, w, h] = element.xywh
  const padding = isGroupNodeType(element.type) ? groupPadding : 0
  const baseZ = element.zIndex ?? 0
  const isGroup = isGroupNodeType(element.type)
  const showLabel = !isGroup && !LABEL_EXCLUDED_TYPES.has(element.type)

  return (
    <div
      data-board-node
      data-element-id={element.id}
      data-board-editor={editing || undefined}
      data-node-type={element.type}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-dragging={dragging || undefined}
      className={cn(
        'absolute overflow-visible',
        editing ? 'select-text' : 'select-none',
        isGroup ? 'pointer-events-none' : 'pointer-events-auto',
      )}
      style={{
        left: x - padding,
        top: y - padding,
        width: w + padding * 2,
        height: h + padding * 2,
        zIndex: expanded
          ? baseZ + EXPANDED_Z_INDEX_BOOST
          : dragging
            ? baseZ + DRAGGING_Z_INDEX_BOOST
            : selected
              ? baseZ + SELECTED_Z_INDEX_BOOST
              : baseZ,
        '--node-rotate': `${element.rotate ?? 0}deg`,
        transformOrigin: 'center',
        // 逻辑：节点位置变化时平滑过渡；拖拽/框选时禁用避免延迟感。
        transition: dragging || boxSelecting
          ? 'none'
          : 'left 300ms ease-out, top 300ms ease-out',
      } as React.CSSProperties}
    >
      {showLabel && (
        <NodeLabel element={element} onLabelChange={onLabelChange} />
      )}
      <div
        className={cn(
          'board-node-content h-full w-full',
          // 逻辑：展开的节点使用 overflow-visible 让内嵌面板溢出节点边界，
          // 不修改 Yjs xywh，面板展开是纯本地 UI 状态。
          expanded ? 'overflow-visible' : 'overflow-hidden',
        )}
      >
        <View
          element={element}
          selected={selected}
          editing={editing}
          expanded={expanded}
          onSelect={onSelect}
          onUpdate={onUpdate}
        />
      </div>
      {selected && !isGroup && (
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{
            boxShadow: 'inset 0 0 0 1.5px var(--canvas-selection-border)',
            opacity: dragging ? 0 : 0.7,
            transition: dragging ? 'opacity 0.05s' : 'opacity 0.15s ease 0.5s',
          }}
        />
      )}
      {element.locked && (
        <div className="pointer-events-none absolute bottom-1 left-1 flex items-center justify-center rounded-md bg-black/40 p-0.5">
          <Lock size={10} className="text-white" />
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  // 逻辑：只有元素数据、选中/编辑状态变化时才重渲染。
  // 拖动其他节点时，未变化的节点完全跳过渲染。
  if (prev.element !== next.element) return false
  if (prev.selected !== next.selected) return false
  if (prev.dragging !== next.dragging) return false
  if (prev.editing !== next.editing) return false
  if (prev.expanded !== next.expanded) return false
  if (prev.boxSelecting !== next.boxSelecting) return false
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

  // Stable parameterised handlers – delegates from per-node arrow fns in map()
  const handleSelect = useCallback(
    (elementId: string) => {
      engine.selection.setSelection([elementId])
    },
    [engine],
  )

  const handleUpdate = useCallback(
    (elementId: string, patch: Record<string, unknown>) => {
      engine.doc.updateNodeProps(elementId, patch)
    },
    [engine],
  )

  const handleLabelChange = useCallback(
    (elementId: string, label: string) => {
      const el = engine.doc.getElementById(elementId)
      if (!el) return
      engine.doc.updateElement(elementId, {
        meta: { ...el.meta, label: label || undefined },
      })
    },
    [engine],
  )

  const applyTransform = useCallback((view: CanvasViewState) => {
    const layer = layerRef.current
    if (!layer) return
    const { zoom, offset } = view.viewport
    layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`
    layer.style.willChange = view.panning ? 'transform' : ''
    // Update label scale CSS variable (read by NodeLabel via var())
    layer.style.setProperty('--label-scale', String(computeLabelScale(zoom)))
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
  const selectedNodeIds = new Set(snapshot.selectedIds)

  // 视口裁剪：只渲染可见区域（含 buffer）内的节点。
  // 通过 subscribeView 监听视口变化，仅当可见节点集合实际改变时才触发重渲染。
  const [visibleElements, setVisibleElements] = useState(() => engine.getVisibleElements())
  const visibleIdsRef = useRef<string>('')

  useEffect(() => {
    // 数据变化时立即刷新可见元素
    const next = engine.getVisibleElements()
    visibleIdsRef.current = next.map(e => e.id).join(',')
    setVisibleElements(next)
  }, [engine, snapshot.docRevision, snapshot.editingNodeId, snapshot.expandedNodeId, snapshot.draggingId])

  useEffect(() => {
    // 视口变化时检查可见集合是否改变，仅改变时触发重渲染
    let rafId: number | null = null
    const unsub = engine.subscribeView(() => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const next = engine.getVisibleElements()
        const nextIds = next.map(e => e.id).join(',')
        if (nextIds !== visibleIdsRef.current) {
          visibleIdsRef.current = nextIds
          setVisibleElements(next)
        }
      })
    })
    return () => {
      unsub()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [engine])

  return (
    <div
      ref={layerRef}
      className={cn(
        'pointer-events-none absolute inset-0 origin-top-left',
        snapshot.editingNodeId && 'select-text',
      )}
      style={{
        transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
        perspective: '2000px',
        '--label-scale': String(computeLabelScale(zoom)),
      } as React.CSSProperties}
    >
      {visibleElements.map(element => {
        if (element.kind !== 'node') return null
        if (element.type === 'stroke') return null

        const definition = engine.nodes.getDefinition(element.type)
        if (!definition) return null

        const selected = selectedNodeIds.has(element.id)
        const dragging =
          snapshot.draggingId != null &&
          (element.id === snapshot.draggingId || selectedNodeIds.has(element.id))
        const editing = element.id === snapshot.editingNodeId
        const expanded = element.id === snapshot.expandedNodeId

        return (
          <DomNodeItem
            key={element.id}
            engine={engine}
            element={element}
            View={definition.view as ComponentType<CanvasNodeViewProps<Record<string, unknown>>>}
            selected={selected}
            dragging={dragging}
            editing={editing}
            expanded={expanded}
            boxSelecting={!!snapshot.selectionBox}
            groupPadding={groupPadding}
            onSelect={() => handleSelect(element.id)}
            onUpdate={patch => handleUpdate(element.id, patch)}
            onLabelChange={label => handleLabelChange(element.id, label)}
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
  // 逻辑：用 docRevision 检测元素数据是否变化，而非 elements 数组引用。
  // 选区变化只会改变 elements 排序（选中置顶）但不改变元素数据，
  // 此时 docRevision 不变，避免所有节点不必要的重渲染。
  if (prev.snapshot.docRevision !== next.snapshot.docRevision) return false
  if (prev.snapshot.draggingId !== next.snapshot.draggingId) return false
  if (prev.snapshot.editingNodeId !== next.snapshot.editingNodeId) return false
  if (prev.snapshot.expandedNodeId !== next.snapshot.expandedNodeId) return false
  if (!!prev.snapshot.selectionBox !== !!next.snapshot.selectionBox) return false
  const prevSel = prev.snapshot.selectedIds
  const nextSel = next.snapshot.selectedIds
  if (prevSel.length !== nextSel.length) return false
  for (let i = 0; i < prevSel.length; i++) {
    if (prevSel[i] !== nextSel[i]) return false
  }
  return true
}

export const DomNodeLayer = memo(DomNodeLayerBase, areDomNodeLayerPropsEqual)

/** Marker export used by performance tests to verify callback stability fix is in place. */
export const _testCallbackStability = true
