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
import { TextNodeRecommendButtons } from '../../nodes/TextNodeRecommendButtons'

type DomNodeLayerProps = {
  engine: CanvasEngine
  snapshot: CanvasSnapshot
}

// ---------------------------------------------------------------------------
// 单个节点的 memo 组件（核心性能优化）
// ---------------------------------------------------------------------------

/** Node types that should not display an above-node label. */
const LABEL_EXCLUDED_TYPES = new Set(['loading'])

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
  onLabelChange: (label: string) => void
}

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
        zIndex: expanded ? baseZ + EXPANDED_Z_INDEX_BOOST : baseZ,
        transform: element.rotate
          ? `rotate(${element.rotate}deg)`
          : undefined,
        transformOrigin: 'center',
      }}
    >
      {showLabel && (
        <NodeLabel element={element} onLabelChange={onLabelChange} />
      )}
      <div
        className={cn(
          'h-full w-full',
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
      {element.locked && (
        <div className="pointer-events-none absolute top-0 right-0 flex items-center justify-center rounded-bl-md bg-black/40 p-0.5">
          <Lock size={10} className="text-white" />
        </div>
      )}
      {element.type === 'text' && selected && !boxSelecting && (
        <TextNodeRecommendButtons engine={engine} element={element} />
      )}
    </div>
  )
}, (prev, next) => {
  // 逻辑：只有元素数据、选中/编辑状态变化时才重渲染。
  // 拖动其他节点时，未变化的节点完全跳过渲染。
  if (prev.element !== next.element) return false
  if (prev.selected !== next.selected) return false
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
        '--label-scale': String(computeLabelScale(zoom)),
      } as React.CSSProperties}
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
            engine={engine}
            element={element}
            View={definition.view as ComponentType<CanvasNodeViewProps<Record<string, unknown>>>}
            selected={selected}
            editing={editing}
            expanded={expanded}
            boxSelecting={!!snapshot.selectionBox}
            groupPadding={groupPadding}
            onSelect={() => engine.selection.setSelection([element.id])}
            onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
            onLabelChange={label => {
              engine.doc.updateElement(element.id, {
                meta: { ...element.meta, label: label || undefined },
              })
            }}
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
