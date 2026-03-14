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

import * as React from "react"
import {
  motion,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react"
import { cn } from "@/lib/utils"
import { Chat } from "@/components/ai/Chat"
import { useAppView } from "@/hooks/use-app-view"
import { useLayoutState } from "@/hooks/use-layout-state"
import {
  LEFT_DOCK_MIN_PX,
  resolveRightChatState,
} from "@/hooks/layout-utils"
import { useProjectLayout } from "@/hooks/use-project-layout"
import { useRecordEntityVisit } from "@/hooks/use-record-entity-visit"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import { LeftDock } from "./LeftDock"
import { TabActiveProvider } from "./TabActiveContext"
import { buildBoardChatTabState } from "@/components/board/utils/board-chat-tab"

const RIGHT_CHAT_MIN_PX = 360
const DIVIDER_GAP_PX = 10
const SPRING_CONFIG = { type: "spring", stiffness: 140, damping: 30 }

/** Error boundary for panel render errors. */
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error("[PanelErrorBoundary]", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <button
            type="button"
            className="rounded-md bg-muted px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/80"
            onClick={() => this.setState({ hasError: false })}
          >
            重新加载面板
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Render the right chat panel (single session, no multi-session accordion).
function RightChatPanel() {
  const appView = useAppView()
  const layout = useLayoutState()
  const { recordEntityVisit } = useRecordEntityVisit()
  const { sessions: remoteSessions } = useChatSessions()

  const activeSessionId = appView.chatSessionId
  const hasRemoteActiveSession = React.useMemo(() => {
    if (!activeSessionId) return false
    return remoteSessions.some((session) => session.id === activeSessionId)
  }, [activeSessionId, remoteSessions])

  const boardBaseParams = React.useMemo(
    () =>
      layout.base?.component === "board-viewer"
        ? (layout.base.params as Record<string, unknown> | undefined)
        : undefined,
    [layout.base],
  )
  const boardChatSessionId = React.useMemo(() => {
    const boardId = boardBaseParams?.boardId
    return typeof boardId === "string" ? boardId.trim() : ""
  }, [boardBaseParams])
  const isBoardChatTab = boardChatSessionId.length > 0
  const currentProjectId = React.useMemo(() => {
    const params = appView.chatParams as Record<string, unknown> | undefined
    const pid = boardBaseParams?.projectId ?? params?.projectId
    return typeof pid === "string" ? pid.trim() : ""
  }, [boardBaseParams, appView.chatParams])

  // Sync board chat session
  React.useEffect(() => {
    if (!isBoardChatTab) return

    if (activeSessionId !== boardChatSessionId) {
      appView.setChatSession(boardChatSessionId, true)
    }

    const currentChatParams = appView.chatParams as Record<string, unknown>
    const nextChatParams = buildBoardChatTabState(
      boardChatSessionId,
      currentProjectId || null,
    ).chatParams
    const same =
      Object.keys(nextChatParams).length === Object.keys(currentChatParams).length
      && Object.entries(nextChatParams).every(([key, value]) => currentChatParams[key] === value)

    if (!same) {
      appView.setChatParams(nextChatParams)
    }
  }, [
    activeSessionId,
    boardChatSessionId,
    currentProjectId,
    isBoardChatTab,
    appView,
  ])

  // Record entity visit
  const prevVisitRef = React.useRef<{
    sessionId: string | null
    projectId: string | null
  }>({
    sessionId: null,
    projectId: null,
  })

  React.useEffect(() => {
    const prev = prevVisitRef.current
    const nextSessionId = activeSessionId ?? null
    const nextProjectId = currentProjectId || null
    const sessionChanged = prev.sessionId !== nextSessionId
    const projectChanged = prev.projectId !== nextProjectId

    prevVisitRef.current = {
      sessionId: nextSessionId,
      projectId: nextProjectId,
    }

    if (isBoardChatTab) return
    if (!nextSessionId || !hasRemoteActiveSession) return
    if (!sessionChanged && !projectChanged) return

    recordEntityVisit({
      entityType: "chat",
      entityId: nextSessionId,
      projectId: nextProjectId,
      trigger: "chat-open",
    })
  }, [
    activeSessionId,
    currentProjectId,
    isBoardChatTab,
    hasRemoteActiveSession,
    recordEntityVisit,
  ])

  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col bg-sidebar"
      style={{ minWidth: RIGHT_CHAT_MIN_PX }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col rounded-lg bg-background overflow-hidden">
          <Chat
            className="flex-1 min-h-0"
            fullPage={!layout.base}
            panelKey="chat:main"
            sessionId={activeSessionId}
            loadHistory={true}
            tabId="main"
            {...(appView.chatParams ?? {})}
            active={true}
            onSessionChange={(sessionId, options) => {
              appView.setChatSession(sessionId, options?.loadHistory)
            }}
          />
        </div>
      </div>
    </div>
  )
}

// Render the main layout container (single view, no tab switching).
export function TabLayout() {
  const layout = useLayoutState()
  const base = useLayoutState((s) => s.base)
  const stack = useLayoutState((s) => s.stack)
  const leftWidthPercent = useLayoutState((s) => s.leftWidthPercent)
  const minLeftWidth = useLayoutState((s) => s.minLeftWidth)
  const rightChatCollapsed = useLayoutState((s) => s.rightChatCollapsed)
  const activeStackItemId = useLayoutState((s) => s.activeStackItemId)
  const stackHidden = Boolean(useLayoutState((s) => s.stackHidden))
  const chatParams = useAppView((s) => s.chatParams)
  const projectShell = useAppView((s) => s.projectShell)
  const { recordEntityVisit } = useRecordEntityVisit()
  const reduceMotion = useReducedMotion()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const [minLeftEnabled, setMinLeftEnabled] = React.useState(true)
  const projectVisitRef = React.useRef<{ projectId: string | null }>({ projectId: null })
  const boardVisitRef = React.useRef<{ boardId: string | null }>({ boardId: null })
  const prevLeftVisibleRef = React.useRef<boolean | null>(null)
  const pendingMinLeftEnableRef = React.useRef(false)
  const leftVisibleRef = React.useRef(false)
  const minLeftEnableRafRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    if (typeof window === "undefined") return
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
    const scrollingEl = document.scrollingElement as HTMLElement | null
    if (scrollingEl && scrollingEl.scrollLeft !== 0) scrollingEl.scrollLeft = 0
  }, [])

  const activeBaseParams = React.useMemo(
    () => ((base?.params ?? {}) as Record<string, unknown>),
    [base?.params],
  )
  const activePlantProjectId = React.useMemo(() => {
    if (base?.component !== "plant-page") return ""
    const projectId = activeBaseParams.projectId
    return typeof projectId === "string" ? projectId.trim() : ""
  }, [base?.component, activeBaseParams])
  const activeBoardProjectId = React.useMemo(() => {
    if (base?.component !== "board-viewer") return ""
    const projectId = activeBaseParams.projectId
    return typeof projectId === "string" ? projectId.trim() : ""
  }, [base?.component, activeBaseParams])
  const activeBoardEntityId = React.useMemo(() => {
    if (base?.component !== "board-viewer") return ""
    const boardFolderUri = activeBaseParams.boardFolderUri
    if (typeof boardFolderUri === "string" && boardFolderUri.trim()) {
      const normalized = boardFolderUri.trim().replace(/\/+$/u, "")
      const parts = normalized.split("/").filter(Boolean)
      return parts[parts.length - 1] ?? ""
    }
    const explicitBoardId = activeBaseParams.boardId
    return typeof explicitBoardId === "string" ? explicitBoardId.trim() : ""
  }, [base?.component, activeBaseParams])

  React.useEffect(() => {
    const nextProjectId = activePlantProjectId || null
    const prev = projectVisitRef.current
    const shouldTrack = Boolean(nextProjectId) && prev.projectId !== nextProjectId

    projectVisitRef.current = { projectId: nextProjectId }

    if (!nextProjectId || !shouldTrack) return

    recordEntityVisit({
      entityType: "project",
      entityId: nextProjectId,
      projectId: nextProjectId,
      trigger: "project-open",
    })
  }, [activePlantProjectId, recordEntityVisit])

  React.useEffect(() => {
    const nextBoardId = activeBoardEntityId || null
    const prev = boardVisitRef.current
    const shouldTrack = Boolean(nextBoardId) && prev.boardId !== nextBoardId

    boardVisitRef.current = { boardId: nextBoardId }

    if (!nextBoardId || !shouldTrack) return

    recordEntityVisit({
      entityType: "board",
      entityId: nextBoardId,
      projectId: activeBoardProjectId || null,
      trigger: "board-open",
    })
  }, [activeBoardEntityId, activeBoardProjectId, recordEntityVisit])

  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    let rafId: number | null = null
    let lastWidth = -1
    const observer = new ResizeObserver((entries) => {
      if (draggingRef.current) return
      const entry = entries[0]
      if (!entry) return
      const nextWidth = Math.round(entry.contentRect.width)
      if (nextWidth === lastWidth) return
      lastWidth = nextWidth
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        setContainerWidth(nextWidth)
      })
    })

    observer.observe(container)
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
      observer.disconnect()
    }
  }, [])

  const hasLeftContent =
    Boolean(base) ||
    (!stackHidden && (stack?.length ?? 0) > 0)
  const storedLeftWidthPercent = hasLeftContent ? leftWidthPercent ?? 0 : 0
  const rightChatState = resolveRightChatState({ base, rightChatCollapsed })
  // 中文注释：主布局和 Header 统一使用同一个右侧聊天判定，避免折叠状态被各自解释。
  const isRightCollapsed = rightChatState.isCollapsed

  const effectiveMinLeft = minLeftWidth ?? LEFT_DOCK_MIN_PX

  const isLeftVisible = storedLeftWidthPercent > 0
  const isRightVisible = rightChatState.isVisible

  let targetSplitPercent = 50
  let targetDividerWidth = 0

  if (!isLeftVisible && isRightVisible) {
    targetSplitPercent = 0
    targetDividerWidth = 0
  } else if (isLeftVisible && !isRightVisible) {
    targetSplitPercent = 100
    targetDividerWidth = 0
  } else {
    targetDividerWidth = DIVIDER_GAP_PX
    if (containerWidth > 0) {
      const minLeft = effectiveMinLeft
      const maxLeft = Math.max(minLeft, containerWidth - RIGHT_CHAT_MIN_PX - targetDividerWidth)
      const storedLeftPx = (storedLeftWidthPercent / 100) * containerWidth
      const targetPx = Math.max(minLeft, Math.min(storedLeftPx, maxLeft))
      targetSplitPercent = (targetPx / containerWidth) * 100
    } else {
      targetSplitPercent = 30
    }
  }

  const splitPercent = useSpring(targetSplitPercent, SPRING_CONFIG)

  React.useEffect(() => {
    leftVisibleRef.current = isLeftVisible
  }, [isLeftVisible])

  React.useLayoutEffect(() => {
    const prevLeftVisible = prevLeftVisibleRef.current
    prevLeftVisibleRef.current = isLeftVisible

    if (!isLeftVisible) {
      pendingMinLeftEnableRef.current = false
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current)
        minLeftEnableRafRef.current = null
      }
      if (minLeftEnabled) setMinLeftEnabled(false)
      return
    }

    if (prevLeftVisible === false) {
      if (reduceMotion) {
        pendingMinLeftEnableRef.current = false
        setMinLeftEnabled(true)
      } else {
        pendingMinLeftEnableRef.current = true
        setMinLeftEnabled(false)
      }
      return
    }

    if (prevLeftVisible === null && !minLeftEnabled) {
      setMinLeftEnabled(true)
    }
  }, [isLeftVisible, reduceMotion, minLeftEnabled])

  React.useEffect(() => {
    const handleComplete = () => {
      if (!pendingMinLeftEnableRef.current) return
      pendingMinLeftEnableRef.current = false
      if (!leftVisibleRef.current) return
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current)
      }
      minLeftEnableRafRef.current = requestAnimationFrame(() => {
        minLeftEnableRafRef.current = null
        if (leftVisibleRef.current) setMinLeftEnabled(true)
      })
    }

    const unsubComplete = splitPercent.on("animationComplete", handleComplete)
    const unsubCancel = splitPercent.on("animationCancel", handleComplete)
    return () => {
      unsubComplete()
      unsubCancel()
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current)
        minLeftEnableRafRef.current = null
      }
    }
  }, [splitPercent])

  const initialLayoutDoneRef = React.useRef(false)
  const prevTargetRef = React.useRef(targetSplitPercent)
  React.useEffect(() => {
    if (isDragging) return
    const prev = prevTargetRef.current
    prevTargetRef.current = targetSplitPercent
    // Skip animation when swapping between fully-left and fully-right (0↔100).
    const isFullSwap =
      (prev === 0 && targetSplitPercent === 100) ||
      (prev === 100 && targetSplitPercent === 0)
    if (reduceMotion || !initialLayoutDoneRef.current || isFullSwap) {
      splitPercent.jump(targetSplitPercent)
      if (containerWidth > 0) initialLayoutDoneRef.current = true
      return
    }
    splitPercent.set(targetSplitPercent)
  }, [targetSplitPercent, isDragging, splitPercent, reduceMotion])

  const draggingRef = React.useRef(false)
  React.useEffect(() => {
    draggingRef.current = isDragging
  }, [isDragging])

  const handleDragStart = (e: React.PointerEvent) => {
    if (targetDividerWidth === 0) return
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const relativeX = e.clientX - rect.left

    const minLeft = effectiveMinLeft
    const maxLeft = Math.max(minLeft, rect.width - RIGHT_CHAT_MIN_PX - targetDividerWidth)
    const newLeftPx = Math.max(minLeft, Math.min(relativeX, maxLeft))

    const newPercent = (newLeftPx / rect.width) * 100
    splitPercent.jump(newPercent)
  }

  const handleDragEnd = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)

    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const currentLeftPx = (splitPercent.get() / 100) * rect.width
    const nextPercent = (currentLeftPx / rect.width) * 100
    layout.setLeftWidthPercent(Math.round(nextPercent * 10) / 10)
  }

  // Sync layout preferences to per-project cache
  const activeProjectId = React.useMemo(() => {
    const params = chatParams as Record<string, unknown> | undefined
    const pid = params?.projectId
    return typeof pid === "string" ? pid.trim() : ""
  }, [chatParams])

  React.useEffect(() => {
    if (!activeProjectId) return
    if (!base) return
    useProjectLayout.getState().saveProjectLayout(activeProjectId, {
      rightChatCollapsed: Boolean(rightChatCollapsed),
      leftWidthPercent: leftWidthPercent ?? 0,
    })
  }, [activeProjectId, rightChatCollapsed, leftWidthPercent, base])

  const isDividerHidden = targetDividerWidth === 0

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden bg-sidebar pr-2"
      data-slot="tab-layout"
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerLeave={handleDragEnd}
    >
      <motion.div
        className="relative z-10 flex min-h-0 min-w-0 flex-col rounded-lg bg-background overflow-hidden"
        style={{
          width: useTransform(splitPercent, (v) => `${v}%`),
          minWidth: isLeftVisible && minLeftEnabled ? effectiveMinLeft : 0,
        }}
        animate={{ opacity: isLeftVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        <div
          className="relative h-full w-full min-h-0 min-w-0"
          style={{ pointerEvents: isLeftVisible ? "auto" : "none" }}
        >
          <PanelErrorBoundary>
            <TabActiveProvider active={isLeftVisible}>
              <LeftDock tabId="main" />
            </TabActiveProvider>
          </PanelErrorBoundary>
        </div>
      </motion.div>

      <motion.div
        className={cn(
          "relative z-20 flex shrink-0 items-center justify-center rounded-4xl bg-sidebar touch-none select-none",
          "hover:bg-primary/20 active:bg-primary/30",
          isDragging ? "cursor-col-resize bg-primary/20" : "cursor-col-resize"
        )}
        style={{
          width: targetDividerWidth,
          opacity: isDividerHidden ? 0 : 1,
          pointerEvents: isDividerHidden ? "none" : "auto",
        }}
        onPointerDown={handleDragStart}
      >
        <div className={cn("h-6 w-1 rounded-full bg-muted/70", isDragging && "bg-primary/70")} />
      </motion.div>

      <motion.div
        className={cn("relative z-10 flex flex-col", isRightVisible ? "flex-1 min-w-0" : "w-0 overflow-hidden")}
        animate={{ opacity: isRightVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        <div
          className="relative h-full w-full min-h-0 min-w-0"
          style={{ pointerEvents: isRightVisible ? "auto" : "none" }}
        >
          <PanelErrorBoundary>
            <TabActiveProvider active={isRightVisible}>
              <RightChatPanel />
            </TabActiveProvider>
          </PanelErrorBoundary>
        </div>
      </motion.div>
    </div>
  )
}
