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

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, XIcon } from "lucide-react"
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
  // 逻辑：用自增 key 强制每次打开都完整重建子组件，
  // 确保引擎被正确销毁和重建，避免残留 listener/rAF 导致白屏。
  const openCountRef = useRef(0)
  const prevGroupIdRef = useRef<string | null>(null)
  if (groupId && groupId !== prevGroupIdRef.current) {
    openCountRef.current += 1
  }
  prevGroupIdRef.current = groupId

  if (!groupId) return null

  const groupElement = parentEngine.doc.getElementById(groupId)
  if (!groupElement || groupElement.kind !== "node") return null

  return (
    <GroupMembersDialogInner
      key={`${groupId}-${openCountRef.current}`}
      groupId={groupId}
      parentEngine={parentEngine}
      onClose={onClose}
    />
  )
}

type GroupMembersDialogInnerProps = {
  groupId: string
  parentEngine: CanvasEngine
  onClose: () => void
}

/**
 * Create a sub-engine for editing group members.
 * This is called once per Inner mount and the engine lives until unmount.
 */
function createSubEngine(parentEngine: CanvasEngine, groupId: string) {
  const engine = new CanvasEngine()
  engine.setSingleSelectOnly(true)
  const definitions = parentEngine.nodes.getDefinitions()
  if (definitions.length > 0) {
    engine.registerNodes(definitions)
  }
  return {
    engine,
    initialElements: extractGroupMembers(parentEngine, groupId),
  }
}

/**
 * 内部组件：管理子引擎的完整生命周期。
 * 通过 key 控制 mount/unmount 保证引擎被正确销毁。
 */
function GroupMembersDialogInner({
  groupId,
  parentEngine,
  onClose,
}: GroupMembersDialogInnerProps) {
  const { t } = useTranslation("board")
  // 逻辑：同步创建引擎，避免 useEffect 导致的多帧延迟和 Strict Mode 双重执行问题。
  // useRef 保证只创建一次（React Compiler 可能重新执行 useMemo，但不会重新执行 useRef 初始化器）。
  const engineDataRef = useRef<ReturnType<typeof createSubEngine> | null>(null)
  if (!engineDataRef.current) {
    engineDataRef.current = createSubEngine(parentEngine, groupId)
  }
  const { engine: subEngine, initialElements } = engineDataRef.current

  // 逻辑：组件卸载时销毁子引擎。
  useEffect(() => {
    return () => {
      subEngine.detach()
    }
  }, [subEngine])

  // 逻辑：关闭时将子画布中的改动同步回主引擎。
  const handleClose = useCallback(() => {
    try {
      // 逻辑：先结束子画布中正在进行的编辑（如文本输入），确保最终值已写入 doc。
      subEngine.setEditingNodeId(null)

      const updatedElements = subEngine.doc.getElements()
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
      console.error("[board] group sync failed", err)
    }
    onClose()
  }, [subEngine, parentEngine, groupId, onClose])

  // 逻辑：Escape 键关闭。
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        handleClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleClose])

  // 逻辑：actions 用 useMemo 避免每次渲染重建导致 context 变化。
  const actions = useMemo(() => ({
    openImagePreview: () => {},
    closeImagePreview: () => {},
  }), [])

  return (
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
          <BoardProvider engine={subEngine} actions={actions}>
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
 * 逻辑：初始化引擎（attach + setInitialElements + fitToElements），
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initialElements.length === 0) {
      setLoading(false)
      return
    }

    engine.attach(container)
    engine.setInitialElements(initialElements)
    engine.fitToElements(60)

    // 逻辑：等 fitToElements 完成后再显示内容，避免初始帧位置跳动。
    // 使用 rAF 确保下一帧渲染完成后再隐藏 loading。
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        setLoading(false)
      })
    })

    return () => {
      cancelAnimationFrame(raf)
      engine.detach()
    }
  }, [engine, initialElements])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
    >
      {loading ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-card">
          <Loader2 className="h-5 w-5 animate-spin text-ol-text-auxiliary" />
        </div>
      ) : null}
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
