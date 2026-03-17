/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { XIcon } from "lucide-react"
import { CanvasEngine } from "../engine/CanvasEngine"
import type {
  CanvasElement,
  CanvasNodeElement,
} from "../engine/types"
import { isGroupNodeType } from "../engine/grouping"
import { BoardProvider } from "../core/BoardProvider"
import { BoardCanvasRender } from "../core/BoardCanvasRender"
import { useBoardSnapshot } from "../core/useBoardSnapshot"

type GroupMembersDialogProps = {
  /** Group node id, null to close. */
  groupId: string | null
  /** Parent canvas engine (source of truth). */
  parentEngine: CanvasEngine
  /** Close handler. */
  onClose: () => void
}

/**
 * Extract group member elements from the parent engine, deep-cloned
 * and stripped of group metadata so they behave as independent nodes.
 * Excludes nested group nodes (only extracts leaf content nodes).
 */
function extractGroupMembers(
  parentEngine: CanvasEngine,
  groupId: string,
): CanvasElement[] {
  const memberIds = parentEngine.getGroupMemberIds(groupId)
  const elements: CanvasElement[] = []
  for (const id of memberIds) {
    const el = parentEngine.doc.getElementById(id)
    if (!el || el.kind !== "node") continue
    // 逻辑：跳过嵌套组节点，只提取叶子内容节点。
    if (isGroupNodeType(el.type)) continue
    const cloned: CanvasNodeElement = {
      ...el,
      props: { ...el.props },
      meta: el.meta ? { ...el.meta } : undefined,
    }
    if (cloned.meta) {
      delete (cloned.meta as Record<string, unknown>).groupId
    }
    elements.push(cloned)
  }
  return elements
}

/**
 * Dialog showing a sub-canvas view of group members.
 *
 * 逻辑：不使用 Radix Dialog（Portal），因为 React 19 + React Compiler
 * 环境下 Portal 内组件的 effects 不会被 flush，导致子画布空白。
 * 改为直接在 React 树中渲染固定定位覆盖层。
 */
export function GroupMembersDialog({
  groupId,
  parentEngine,
  onClose,
}: GroupMembersDialogProps) {
  const { t } = useTranslation("board")
  // 逻辑：用 ref 持有子引擎实例，避免 useMemo 内设置 ref 的副作用问题
  // （React 19 + React Compiler 可能重新执行 useMemo 工厂函数，导致创建新空引擎覆盖已有数据）。
  const subEngineRef = useRef<CanvasEngine | null>(null)
  const initialElementsRef = useRef<CanvasElement[]>([])
  // 逻辑：用 state 触发首次渲染，useEffect 内创建引擎保证只执行一次。
  const [ready, setReady] = useState(false)
  const prevGroupIdRef = useRef<string | null>(null)

  // 逻辑：groupId 变化时创建/销毁子引擎。useEffect 保证只在 mount/groupId 变化时执行，
  // 避免 React Compiler 重新执行 useMemo 导致引擎被重建。
  useEffect(() => {
    if (!groupId) {
      subEngineRef.current = null
      initialElementsRef.current = []
      setReady(false)
      prevGroupIdRef.current = null
      return
    }
    // 逻辑：相同 groupId 不重复创建。
    if (groupId === prevGroupIdRef.current && subEngineRef.current) return
    prevGroupIdRef.current = groupId

    const engine = new CanvasEngine()
    // 逻辑：子画布禁用多选和框选，避免选区边框闪烁问题。
    engine.setSingleSelectOnly(true)
    const definitions = parentEngine.nodes.getDefinitions()
    if (definitions.length > 0) {
      engine.registerNodes(definitions)
    }
    subEngineRef.current = engine
    initialElementsRef.current = extractGroupMembers(parentEngine, groupId)
    setReady(true)
  }, [groupId, parentEngine])

  // 逻辑：关闭时将子画布中的改动同步回主引擎。
  const handleClose = useCallback(() => {
    const engine = subEngineRef.current
    if (engine && groupId) {
      try {
        // 逻辑：先结束子画布中正在进行的编辑（如文本输入），确保最终值已写入 doc。
        engine.setEditingNodeId(null)

        const updatedElements = engine.doc.getElements()
        const updatedMap = new Map(updatedElements.map(el => [el.id, el]))
        const memberIds = parentEngine.getGroupMemberIds(groupId)

        let syncedCount = 0
        parentEngine.doc.transact(() => {
          for (const memberId of memberIds) {
            const updated = updatedMap.get(memberId)
            if (!updated || updated.kind !== "node") continue
            const original = parentEngine.doc.getElementById(memberId)
            if (!original || original.kind !== "node") continue
            parentEngine.doc.updateElement(memberId, {
              xywh: updated.xywh,
              rotate: updated.rotate,
              opacity: updated.opacity,
              zIndex: updated.zIndex,
            })
            parentEngine.doc.updateNodeProps(memberId, updated.props)
            syncedCount++
          }
          parentEngine.refreshGroupBounds(groupId)
        })
        if (syncedCount > 0) {
          parentEngine.commitHistory()
          parentEngine.refreshView()
        }
      } catch (err) {
        // 逻辑：PixiJS 异步销毁可能导致残留回调访问已释放对象，安全忽略。
        console.error("[board] group sync failed", err)
      }
    }
    // 逻辑：不在此处调用 detach()，由 GroupCanvasRenderLayer 的 useEffect cleanup 统一处理，
    // 避免引擎 detach 后 PixiJS ticker 仍在运行导致渲染已释放的资源。
    onClose()
  }, [parentEngine, groupId, onClose])

  // 逻辑：Escape 键关闭。
  useEffect(() => {
    if (!groupId) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        handleClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [groupId, handleClose])

  const subEngine = subEngineRef.current
  if (!groupId || !subEngine || !ready) return null

  const groupElement = parentEngine.doc.getElementById(groupId)
  if (!groupElement || groupElement.kind !== "node") return null

  const initialElements = initialElementsRef.current

  return (
    // 逻辑：不使用 Radix Dialog Portal，直接渲染固定定位覆盖层，
    // 确保 React effects 正常 flush（Portal 内 effects 不 flush 是已知兼容性问题）。
    // 逻辑：阻止子画布的交互事件冒泡到主画布，避免两个引擎同时处理导致无限更新循环。
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/20 animate-in fade-in-0 duration-200"
        onClick={handleClose}
      />
      {/* Content */}
      <div className="bg-card absolute top-[50%] left-[50%] z-50 flex h-[80vh] max-h-[80vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 rounded-lg border p-0 shadow-none animate-in fade-in-0 zoom-in-95 duration-200 sm:max-w-5xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-ol-divider px-4 py-3">
          <div className="flex flex-col gap-1 text-left">
            <h2 className="text-base font-semibold leading-none">
              {t("groupNode.groupDialog.editTitle")}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-md opacity-70 transition-opacity hover:opacity-100"
            onClick={handleClose}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {/* Canvas area */}
        <div className="relative min-h-0 flex-1">
          <BoardProvider
            engine={subEngine}
            actions={{
              openImagePreview: () => {},
              closeImagePreview: () => {},
            }}
          >
            <GroupCanvasRenderLayer
              engine={subEngine}
              initialElements={initialElements}
            />
          </BoardProvider>
        </div>
      </div>
    </div>
  )
}

/**
 * 子画布渲染层。
 * 逻辑：初始化引擎（attach + setInitialElements + endInitialLoad + fitToElements），
 * 因为不在 Portal 中，useEffect 正常执行。
 */
function GroupCanvasRenderLayer({
  engine,
  initialElements,
}: {
  engine: CanvasEngine
  initialElements: CanvasElement[]
}) {
  const snapshot = useBoardSnapshot(engine)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dummyContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initialElements.length === 0) return

    engine.attach(container)
    engine.setInitialElements(initialElements)

    // 逻辑：等待布局稳定后自适应内容。
    engine.fitToElements(60)

    return () => {
      engine.detach()
    }
  }, [engine, initialElements])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
    >
      <BoardCanvasRender
        engine={engine}
        snapshot={snapshot}
        showUi
        showPerfOverlay={false}
        containerRef={dummyContainerRef}
        minimal
      />
    </div>
  )
}
