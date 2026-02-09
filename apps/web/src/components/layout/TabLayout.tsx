"use client";

import * as React from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chat } from "@/components/chat/Chat";
import { ChatSessionBarItem } from "@/components/chat/session/ChatSessionBar";
import { useTabs, LEFT_DOCK_MIN_PX } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabView } from "@/hooks/use-tab-view";
import { createChatSessionId } from "@/lib/chat-session-id";
import { useChatRuntime, type ChatStatus } from "@/hooks/use-chat-runtime";
import { invalidateChatSessions, useChatSessions } from "@/hooks/use-chat-sessions";
import { useSessionTitles } from "@/hooks/use-session-titles";
import { LeftDock } from "./LeftDock";
import type { TabMeta } from "@/hooks/tab-types";
import { Button } from "@tenas-ai/ui/button";
import { Input } from "@tenas-ai/ui/input";
import { Label } from "@tenas-ai/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { toast } from "sonner";
import {
  bindPanelHost,
  hasPanel,
  renderPanel,
  setPanelActive,
  syncPanelTabs,
} from "@/lib/panel-runtime";

const RIGHT_CHAT_MIN_PX = 360;
const DIVIDER_GAP_PX = 10;
const SPRING_CONFIG = { type: "spring", stiffness: 140, damping: 30 };
const PANEL_SWITCH_DELAY_MS = 180;

/** Session item in multi-session accordion. */
type SessionListItem = {
  sessionId: string;
  title: string;
  index: number;
};
type SessionIndicator = {
  hasUnread?: boolean;
  lastSeenAt?: number;
  lastUpdatedAt?: number;
};

// Render the right chat panel for a tab.
function RightChatPanel({ tabId }: { tabId: string }) {
  const tab = useTabView(tabId);
  const addTabSession = useTabs((s) => s.addTabSession);
  const removeTabSession = useTabs((s) => s.removeTabSession);
  const setActiveTabSession = useTabs((s) => s.setActiveTabSession);
  const moveTabSession = useTabs((s) => s.moveTabSession);
  const setTabSessionTitles = useTabs((s) => s.setTabSessionTitles);
  const { sessions: remoteSessions } = useChatSessions({ tabId });
  useSessionTitles({ tabId, sessions: remoteSessions });
  const chatStatusBySessionId = useChatRuntime((s) => s.chatStatusBySessionId);
  const [sessionIndicators, setSessionIndicators] = React.useState<
    Record<string, SessionIndicator>
  >({});
  const prevSessionStatusRef = React.useRef<Record<string, ChatStatus | null | undefined>>({});
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameSessionId, setRenameSessionId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");

  const activeSessionId = tab?.chatSessionId;
  const activeSessionUpdatedAt = React.useMemo(() => {
    if (!activeSessionId) return undefined;
    const match = remoteSessions.find((session) => session.id === activeSessionId);
    if (!match) return undefined;
    return new Date(match.updatedAt).getTime();
  }, [activeSessionId, remoteSessions]);
  const sessionIds = React.useMemo(() => {
    if (!tab) return [];
    const ids =
      Array.isArray(tab.chatSessionIds) && tab.chatSessionIds.length > 0
        ? tab.chatSessionIds
        : tab.chatSessionId
          ? [tab.chatSessionId]
          : [];
    return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  }, [tab]);
  const sessionList = React.useMemo<SessionListItem[]>(() => {
    const titleMap = tab?.chatSessionTitles ?? {};
    return sessionIds.map((sessionId, index) => {
      const title = titleMap[sessionId];
      return { sessionId, title: title?.trim() || "新对话", index };
    });
  }, [sessionIds, tab?.chatSessionTitles]);
  const handleSessionChange = React.useCallback(
    (sessionId: string, options?: { loadHistory?: boolean; replaceCurrent?: boolean }) => {
      if (!tabId) return;
      setActiveTabSession(tabId, sessionId, options);
    },
    [setActiveTabSession, tabId],
  );

  // 清理不存在的会话状态
  React.useEffect(() => {
    if (sessionIds.length === 0) return;
    setSessionIndicators((prev) => {
      const validIds = new Set(sessionIds);
      const next = Object.fromEntries(
        Object.entries(prev).filter(([id]) => validIds.has(id))
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [sessionIds]);

  // 记录活跃会话已读时间（使用服务端 updatedAt，避免客户端/服务端时钟偏差）
  React.useEffect(() => {
    if (!activeSessionId) return;
    setSessionIndicators((prev) => {
      const current = prev[activeSessionId] ?? {};
      const nextSeenAt =
        typeof activeSessionUpdatedAt === "number" ? activeSessionUpdatedAt : Date.now();
      if (current.lastSeenAt === nextSeenAt && current.hasUnread === false) {
        return prev;
      }
      return {
        ...prev,
        [activeSessionId]: {
          ...current,
          lastSeenAt: nextSeenAt,
          hasUnread: false,
        },
      };
    });
  }, [activeSessionId, activeSessionUpdatedAt]);

  // 根据远端更新时间推断未读与 streaming 完成
  React.useEffect(() => {
    if (remoteSessions.length === 0) return;
    setSessionIndicators((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const session of remoteSessions) {
        const updatedAtMs = new Date(session.updatedAt).getTime();
        const current = next[session.id] ?? {};
        if (current.lastUpdatedAt !== updatedAtMs) {
          next[session.id] = {
            ...current,
            lastUpdatedAt: updatedAtMs,
          };
          changed = true;
        }
        if (session.id !== activeSessionId) {
          const lastSeenAt = current.lastSeenAt ?? 0;
          if (updatedAtMs > lastSeenAt && current.hasUnread !== true) {
            next[session.id] = {
              ...next[session.id],
              hasUnread: true,
            };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [activeSessionId, remoteSessions]);

  // 基于流状态完成时标记未读，避免依赖列表刷新。
  React.useEffect(() => {
    const prevStatuses = prevSessionStatusRef.current;
    const nextStatuses = chatStatusBySessionId;
    prevSessionStatusRef.current = nextStatuses;

    let changed = false;
    setSessionIndicators((prev) => {
      let next = prev;
      for (const [sessionId, status] of Object.entries(nextStatuses)) {
        const prevStatus = prevStatuses[sessionId];
        const wasStreaming =
          prevStatus === "submitted" || prevStatus === "streaming";
        const isStreaming = status === "submitted" || status === "streaming";
        if (!wasStreaming || isStreaming) continue;
        if (sessionId === activeSessionId) continue;
        const current = next[sessionId] ?? {};
        if (current.hasUnread === true) continue;
        if (next === prev) next = { ...prev };
        next[sessionId] = {
          ...current,
          hasUnread: true,
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeSessionId, chatStatusBySessionId]);

  // 新建会话
  const handleNewSession = React.useCallback(() => {
    const newId = createChatSessionId();
    addTabSession(tabId, newId);
  }, [addTabSession, tabId]);

  // 选择会话
  const handleSelectSession = React.useCallback(
    (id: string) => {
      handleSessionChange(id, { loadHistory: true });
    },
    [handleSessionChange]
  );

  // 移除会话（从本地列表移除，不删除服务端数据）
  const handleRemoveSession = React.useCallback(
    (id: string) => {
      removeTabSession(tabId, id);
      setSessionIndicators((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [removeTabSession, tabId]
  );
  const handleCloseActiveSession = React.useCallback(() => {
    if (!activeSessionId) return;
    handleRemoveSession(activeSessionId);
  }, [activeSessionId, handleRemoveSession]);

  const updateSession = useMutation({
    ...(trpc.chatsession.updateOneChatSession.mutationOptions() as any),
    onSuccess: () => {
      invalidateChatSessions(queryClient);
    },
  });

  const openRenameDialog = React.useCallback((session: SessionListItem) => {
    setRenameSessionId(session.sessionId);
    setRenameValue(session.title);
    setRenameOpen(true);
  }, []);

  const handleRenameConfirm = React.useCallback(async () => {
    const sessionId = renameSessionId;
    const title = renameValue.trim();
    if (!sessionId || !title) return;
    try {
      await updateSession.mutateAsync({
        where: { id: sessionId },
        data: { title, isUserRename: true },
      } as any);
      if (tabId) setTabSessionTitles(tabId, { [sessionId]: title });
      toast.success("重命名成功");
      setRenameOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重命名失败";
      toast.error(message);
    }
  }, [renameSessionId, renameValue, setTabSessionTitles, tabId, updateSession]);


  const showNewSessionButton = sessionList.length > 0;
  const showCloseSessionButton = sessionList.length > 1;
  const showSessionIndex = sessionList.length > 1;
  const activeIndex = sessionList.findIndex((s) => s.sessionId === activeSessionId);
  const useAccordion = sessionList.length > 1 && activeIndex >= 0;
  const sessionsAbove = useAccordion ? sessionList.slice(0, activeIndex) : [];
  const sessionsBelow = useAccordion ? sessionList.slice(activeIndex + 1) : [];
  const resolvedActiveSessionId =
    activeSessionId ?? sessionList[0]?.sessionId ?? "";
  const renderSessionItem = React.useCallback(
    (session: SessionListItem) => {
      const canMoveUp = session.index > 0;
      const canMoveDown = session.index < sessionList.length - 1;
      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="w-full">
              <ChatSessionBarItem
                sessionId={session.sessionId}
                title={session.title}
                index={session.index}
                showIndex={showSessionIndex}
                onSelect={() => handleSelectSession(session.sessionId)}
                onRemove={() => handleRemoveSession(session.sessionId)}
                isStreaming={
                  chatStatusBySessionId[session.sessionId] === "submitted" ||
                  chatStatusBySessionId[session.sessionId] === "streaming"
                }
                hasUnread={Boolean(sessionIndicators[session.sessionId]?.hasUnread)}
                className="rounded-lg bg-background"
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem icon={PencilLine} onSelect={() => openRenameDialog(session)}>
              重命名
            </ContextMenuItem>
            <ContextMenuItem
              icon={ArrowUp}
              disabled={!canMoveUp}
              onSelect={() => moveTabSession(tabId, session.sessionId, "up")}
            >
              上移
            </ContextMenuItem>
            <ContextMenuItem
              icon={ArrowDown}
              disabled={!canMoveDown}
              onSelect={() => moveTabSession(tabId, session.sessionId, "down")}
            >
              下移
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem icon={Trash2} onSelect={() => handleRemoveSession(session.sessionId)}>
              关闭
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    },
    [
      chatStatusBySessionId,
      handleRemoveSession,
      handleSelectSession,
      moveTabSession,
      openRenameDialog,
      sessionIndicators,
      sessionList.length,
      showSessionIndex,
      tabId,
    ]
  );
  // Render the pinned new-session bar.
  const newSessionBar = (
    <button
      type="button"
      className={cn(
        "group flex h-8 w-full items-center gap-1 rounded-lg bg-background px-2",
        "text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      )}
      onClick={handleNewSession}
    >
      <Plus size={14} className="shrink-0" />
      <span className="truncate">新建会话</span>
      </button>
  );
  const renderSessionStack = () => (
    <div className="relative flex min-h-0 flex-1 flex-col rounded-lg bg-background overflow-hidden">
      {sessionList.map((session) => {
        const isActive = session.sessionId === resolvedActiveSessionId;
        const shouldLoadHistory = isActive ? Boolean(tab?.chatLoadHistory) : false;
        return (
          <div
            key={session.sessionId}
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              isActive ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            aria-hidden={isActive ? undefined : true}
          >
            <Chat
              className="flex-1 min-h-0"
              panelKey={`chat:${tab?.id ?? ""}`}
              sessionId={session.sessionId}
              loadHistory={shouldLoadHistory}
              tabId={tab?.id}
              {...(tab?.chatParams ?? {})}
              onSessionChange={handleSessionChange}
              onNewSession={showNewSessionButton ? handleNewSession : undefined}
              onCloseSession={
                showCloseSessionButton && isActive
                  ? handleCloseActiveSession
                  : undefined
              }
              active={isActive}
            />
          </div>
        );
      })}
    </div>
  );

  if (!tab) return null;

  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col bg-sidebar"
      style={{ minWidth: RIGHT_CHAT_MIN_PX }}
    >
      {useAccordion ? (
        <LayoutGroup>
          <div className="flex min-h-0 flex-1 flex-col">
            {newSessionBar}
            <div className="shrink-0 h-[6px] bg-sidebar" />
            <AnimatePresence mode="popLayout">
              {sessionsAbove.map((session) => (
                <React.Fragment key={session.sessionId}>
                  {renderSessionItem(session)}
                  <div className="shrink-0 h-[6px] bg-sidebar" />
                </React.Fragment>
              ))}
            </AnimatePresence>

            {renderSessionStack()}

            <AnimatePresence mode="popLayout">
              {sessionsBelow.map((session) => (
                <React.Fragment key={session.sessionId}>
                  <div className="shrink-0 h-[6px] bg-sidebar" />
                  {renderSessionItem(session)}
                </React.Fragment>
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {newSessionBar}
          <div className="shrink-0 h-[6px] bg-sidebar" />
          {renderSessionStack()}
        </div>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>请输入新的会话名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="session-rename" className="text-right">
                名称
              </Label>
              <Input
                id="session-rename"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRenameConfirm();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button onClick={handleRenameConfirm} disabled={updateSession.isPending}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// Render the main tab layout container.
export function TabLayout({
  tabs,
  activeTabId,
}: {
  tabs: TabMeta[];
  activeTabId: string;
}) {
  const activeTab = useTabView(activeTabId);
  const stackHidden = Boolean(activeTab?.stackHidden);
  const setTabLeftWidthPercent = useTabRuntime((s) => s.setTabLeftWidthPercent);
  // 逻辑：按 MotionConfig / 系统偏好关闭侧边栏切换动画。
  const reduceMotion = useReducedMotion();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const leftHostRef = React.useRef<HTMLDivElement>(null);
  const rightHostRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [minLeftEnabled, setMinLeftEnabled] = React.useState(true);
  const activeTabIdRef = React.useRef<string | null>(null);
  const mountTimerRef = React.useRef<number | null>(null);
  const switchTokenRef = React.useRef(0);
  const prevLeftVisibleRef = React.useRef<boolean | null>(null);
  const pendingMinLeftEnableRef = React.useRef(false);
  const leftVisibleRef = React.useRef(false);
  const minLeftEnableRafRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    bindPanelHost("left", leftHostRef.current);
    bindPanelHost("right", rightHostRef.current);
    return () => {
      bindPanelHost("left", null);
      bindPanelHost("right", null);
    };
  }, []);

  React.useEffect(() => {
    const tabIds = tabs.map((tab) => tab.id);
    syncPanelTabs("left", tabIds);
    syncPanelTabs("right", tabIds);
  }, [tabs]);

  React.useEffect(() => {
    const prevTabId = activeTabIdRef.current;
    if (prevTabId && prevTabId !== activeTabId) {
      setPanelActive("left", prevTabId, false);
      setPanelActive("right", prevTabId, false);
    }

    activeTabIdRef.current = activeTabId;

    if (mountTimerRef.current) {
      window.clearTimeout(mountTimerRef.current);
    }

    if (!activeTabId) return;

    switchTokenRef.current += 1;
    const token = switchTokenRef.current;
    const delay = reduceMotion || !prevTabId ? 0 : PANEL_SWITCH_DELAY_MS;

    mountTimerRef.current = window.setTimeout(() => {
      if (switchTokenRef.current !== token) return;
      // 中文注释：延迟挂载活跃 tab，避开切换动画期的主线程峰值。
      if (!hasPanel("left", activeTabId)) {
        renderPanel("left", activeTabId, <LeftDock tabId={activeTabId} />, true);
      } else {
        setPanelActive("left", activeTabId, true);
      }

      if (!hasPanel("right", activeTabId)) {
        renderPanel("right", activeTabId, <RightChatPanel tabId={activeTabId} />, true);
      } else {
        setPanelActive("right", activeTabId, true);
      }
    }, delay);

    return () => {
      if (mountTimerRef.current) {
        window.clearTimeout(mountTimerRef.current);
        mountTimerRef.current = null;
      }
    };
  }, [activeTabId, reduceMotion]);

  React.useLayoutEffect(() => {
    // App should never horizontally scroll; prevent focus/scrollIntoView from shifting the page.
    if (typeof window === "undefined") return;
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    const scrollingEl = document.scrollingElement as HTMLElement | null;
    if (scrollingEl && scrollingEl.scrollLeft !== 0) scrollingEl.scrollLeft = 0;
  }, [activeTabId]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 通过 rAF 节流 + 数值去抖，避免 ResizeObserver 回调内同步 setState 引发布局循环
    let rafId: number | null = null;
    let lastWidth = -1;
    const observer = new ResizeObserver((entries) => {
      // 拖拽时跳过，避免容器内部频繁重排触发循环通知
      if (draggingRef.current) return;
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      if (nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      if (rafId !== null) return; // 同一帧只更新一次
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setContainerWidth(nextWidth);
      });
    });

    observer.observe(container);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      observer.disconnect();
    };
  }, []);

  const hasLeftContent =
    Boolean(activeTab?.base) ||
    (!stackHidden && (activeTab?.stack?.length ?? 0) > 0);
  const storedLeftWidthPercent = hasLeftContent ? activeTab?.leftWidthPercent ?? 0 : 0;
  const isRightCollapsed = Boolean(activeTab?.base) && Boolean(activeTab?.rightChatCollapsed);

  const effectiveMinLeft = activeTab?.minLeftWidth ?? LEFT_DOCK_MIN_PX;

  const isLeftVisible = storedLeftWidthPercent > 0;
  const isRightVisible = !isRightCollapsed;

  let targetSplitPercent = 50;
  let targetDividerWidth = 0;

  if (!isLeftVisible && isRightVisible) {
    // Mode C: Right Only (Left hidden)
    targetSplitPercent = 0;
    targetDividerWidth = 0;
  } else if (isLeftVisible && !isRightVisible) {
    // Mode B: Left Only (Right hidden)
    targetSplitPercent = 100;
    targetDividerWidth = 0;
  } else {
    // Mode A: Both visible
    targetDividerWidth = DIVIDER_GAP_PX;
    if (containerWidth > 0) {
      const minLeft = effectiveMinLeft;
      const maxLeft = Math.max(minLeft, containerWidth - RIGHT_CHAT_MIN_PX - targetDividerWidth);

      const storedLeftPx = (storedLeftWidthPercent / 100) * maxLeft;
      const targetPx = Math.max(minLeft, Math.min(storedLeftPx, maxLeft));
      targetSplitPercent = (targetPx / containerWidth) * 100;
    } else {
      targetSplitPercent = 30;
    }
  }

  const splitPercent = useSpring(targetSplitPercent, SPRING_CONFIG);

  React.useEffect(() => {
    leftVisibleRef.current = isLeftVisible;
  }, [isLeftVisible]);

  // 中文注释：左侧从隐藏切到显示时先关闭 minWidth，让宽度从 0 动画到目标，动画完成后再恢复 minWidth，避免 30% 闪动。
  React.useLayoutEffect(() => {
    const prevLeftVisible = prevLeftVisibleRef.current;
    prevLeftVisibleRef.current = isLeftVisible;

    if (!isLeftVisible) {
      pendingMinLeftEnableRef.current = false;
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current);
        minLeftEnableRafRef.current = null;
      }
      if (minLeftEnabled) setMinLeftEnabled(false);
      return;
    }

    if (prevLeftVisible === false) {
      if (reduceMotion) {
        pendingMinLeftEnableRef.current = false;
        setMinLeftEnabled(true);
      } else {
        pendingMinLeftEnableRef.current = true;
        setMinLeftEnabled(false);
      }
      return;
    }

    if (prevLeftVisible === null && !minLeftEnabled) {
      setMinLeftEnabled(true);
    }
  }, [isLeftVisible, reduceMotion, minLeftEnabled]);

  React.useEffect(() => {
    // Enable min width after the split animation settles.
    const handleComplete = () => {
      if (!pendingMinLeftEnableRef.current) return;
      pendingMinLeftEnableRef.current = false;
      if (!leftVisibleRef.current) return;
      // 中文注释：动画完成后下一帧再开启 minWidth，避开 ResizeObserver 循环警告。
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current);
      }
      minLeftEnableRafRef.current = requestAnimationFrame(() => {
        minLeftEnableRafRef.current = null;
        if (leftVisibleRef.current) setMinLeftEnabled(true);
      });
    };

    const unsubComplete = splitPercent.on("animationComplete", handleComplete);
    const unsubCancel = splitPercent.on("animationCancel", handleComplete);
    return () => {
      unsubComplete();
      unsubCancel();
      if (minLeftEnableRafRef.current !== null) {
        cancelAnimationFrame(minLeftEnableRafRef.current);
        minLeftEnableRafRef.current = null;
      }
    };
  }, [splitPercent]);

  React.useEffect(() => {
    if (isDragging) return;
    if (reduceMotion) {
      splitPercent.jump(targetSplitPercent);
      return;
    }
    splitPercent.set(targetSplitPercent);
  }, [targetSplitPercent, isDragging, splitPercent, reduceMotion]);

  // 拖拽状态写入 ref，供 ResizeObserver 回调读取，避免闭包状态过期
  const draggingRef = React.useRef(false);
  React.useEffect(() => {
    draggingRef.current = isDragging;
  }, [isDragging]);

  // Handle the start of the resize drag.
  const handleDragStart = (e: React.PointerEvent) => {
    if (targetDividerWidth === 0) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  // Handle the resize drag move.
  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;

    const minLeft = effectiveMinLeft;
    const maxLeft = Math.max(minLeft, rect.width - RIGHT_CHAT_MIN_PX - targetDividerWidth);
    const newLeftPx = Math.max(minLeft, Math.min(relativeX, maxLeft));

    const newPercent = (newLeftPx / rect.width) * 100;
    splitPercent.jump(newPercent);
  };

  // Handle the end of the resize drag.
  const handleDragEnd = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    const container = containerRef.current;
    if (!container || !activeTabId) return;

    const rect = container.getBoundingClientRect();
    const minLeft = effectiveMinLeft;
    const maxLeft = Math.max(minLeft, rect.width - RIGHT_CHAT_MIN_PX - targetDividerWidth);
    const currentLeftPx = (splitPercent.get() / 100) * rect.width;
    const nextPercentOfMax = (currentLeftPx / maxLeft) * 100;
    setTabLeftWidthPercent(activeTabId, Math.round(nextPercentOfMax * 10) / 10);
  };

  const isDividerHidden = targetDividerWidth === 0;

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
        <div ref={leftHostRef} className="relative h-full w-full min-h-0 min-w-0" />
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
        className="flex-1 min-w-0 relative z-10 flex flex-col"
        animate={{ opacity: isRightVisible ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
        }
      >
        <div ref={rightHostRef} className="relative h-full w-full min-h-0 min-w-0" />
      </motion.div>
    </div>
  );
}
