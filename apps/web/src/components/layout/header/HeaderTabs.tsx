import { Bot, Globe, Plus, X } from "lucide-react";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { useTabs } from "@/hooks/use-tabs";
import { DEFAULT_TAB_INFO, type Tab } from "@tenas-ai/api/common";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { TabMenu } from "./HeaderTabMenu";

/** Format a shortcut string for tooltip display. */
function formatShortcutLabel(shortcut: string, isMac: boolean): string {
  const alternatives = shortcut
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
  const joiner = isMac ? "" : "+";

  const formatPart = (part: string) => {
    const normalized = part.toLowerCase();
    if (normalized === "mod") return isMac ? "⌘" : "Ctrl";
    if (normalized === "cmd") return "⌘";
    if (normalized === "ctrl") return "Ctrl";
    if (normalized === "alt") return isMac ? "⌥" : "Alt";
    if (normalized === "shift") return isMac ? "⇧" : "Shift";
    if (/^[a-z]$/i.test(part)) return part.toUpperCase();
    return part;
  };

  return alternatives
    .map((alt) =>
      alt
        .split("+")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((part) => formatPart(part))
        .join(joiner),
    )
    .join(" / ");
}

export const HeaderTabs = () => {
  const activeTabId = useTabs((s) => s.activeTabId);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const closeTab = useTabs((s) => s.closeTab);
  const addTab = useTabs((s) => s.addTab);
  const getWorkspaceTabs = useTabs((s) => s.getWorkspaceTabs);
  const tabs = useTabs((s) => s.tabs);
  const reorderTabs = useTabs((s) => s.reorderTabs);
  const setTabPinned = useTabs((s) => s.setTabPinned);
  const chatStatusByTabId = useTabs((s) => s.chatStatusByTabId);
  const dictationStatusByTabId = useTabs((s) => s.dictationStatusByTabId);
  const { workspace: activeWorkspace } = useWorkspace();
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const seededWorkspaceRef = useRef<Record<string, boolean>>({});
  const tabsScrollViewportRef = useRef<HTMLDivElement>(null);
  const tabsScrollContentRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const [reorderingTabId, setReorderingTabId] = useState<string | null>(null);
  const reorderingTabIdRef = useRef<string | null>(null);
  const workspaceTabsRef = useRef<
    Array<{ id: string; isPin?: boolean | undefined }>
  >([]);
  const pointerSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    didReorder: boolean;
  } | null>(null);
  const cursorRestoreRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
  const swapRafRef = useRef<number | null>(null);
  const lastSwapKeyRef = useRef<string | null>(null);
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    [],
  );
  const newTabShortcut = formatShortcutLabel("Mod+0", isMac);

  // 获取当前工作区的标签列表
  const workspaceTabs = activeWorkspace
    ? getWorkspaceTabs(activeWorkspace.id)
    : [];
  activeWorkspaceIdRef.current = activeWorkspace?.id ?? null;
  workspaceTabsRef.current = workspaceTabs.map((t) => ({
    id: t.id,
    isPin: t.isPin,
  }));
  const pinnedTabs = workspaceTabs.filter((tab) => tab.isPin);
  const regularTabs = workspaceTabs.filter((tab) => !tab.isPin);
  const allTabs = useMemo(
    () => [...pinnedTabs, ...regularTabs],
    [pinnedTabs, regularTabs]
  );
  const shouldShowSeparator = pinnedTabs.length > 0 && regularTabs.length > 0;
  const firstRegularTabId = regularTabs[0]?.id ?? null;

  // 当工作区激活且没有标签页时，添加默认标签页
  useEffect(() => {
    if (!activeWorkspace) return;

    const actualWorkspaceTabs = tabs.filter(
      (tab) => tab.workspaceId === activeWorkspace.id
    );
    if (actualWorkspaceTabs.length > 0) {
      seededWorkspaceRef.current[activeWorkspace.id] = true;
      return;
    }
    if (seededWorkspaceRef.current[activeWorkspace.id]) return;
    seededWorkspaceRef.current[activeWorkspace.id] = true;
    if (actualWorkspaceTabs.length === 0) {
      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: DEFAULT_TAB_INFO.title,
        icon: DEFAULT_TAB_INFO.icon,
      });
    }
  }, [activeWorkspace, tabs, addTab]);

  useEffect(() => {
    if (!activeWorkspace) return;
    if (workspaceTabs.length === 0) return;
    const inWorkspace = activeTabId
      ? workspaceTabs.some((tab) => tab.id === activeTabId)
      : false;
    if (!inWorkspace) {
      startTransition(() => {
        setActiveTab(workspaceTabs[0]!.id);
      });
    }
  }, [activeTabId, activeWorkspace, setActiveTab, workspaceTabs]);

  useEffect(() => {
    return () => {
      if (swapRafRef.current) cancelAnimationFrame(swapRafRef.current);
    };
  }, []);

  const handleAddTab = useCallback(() => {
    if (!activeWorkspace) return;

    addTab({
      workspaceId: activeWorkspace.id,
      createNew: true,
      title: DEFAULT_TAB_INFO.title,
      icon: DEFAULT_TAB_INFO.icon,
    });
  }, [activeWorkspace, addTab]);

  const clearPointerSession = () => {
    pointerSessionRef.current = null;
    reorderingTabIdRef.current = null;
    setReorderingTabId(null);
    if (cursorRestoreRef.current) {
      document.body.style.cursor = cursorRestoreRef.current.cursor;
      document.body.style.userSelect = cursorRestoreRef.current.userSelect;
      cursorRestoreRef.current = null;
    }
  };

  const handleReorderPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    tabId: string
  ) => {
    if (event.button !== 0) return;
    if (!activeWorkspaceIdRef.current) return;

    pointerSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      didReorder: false,
    };

    reorderingTabIdRef.current = tabId;
    setReorderingTabId(tabId);

    // Keep cursor as grabbing for the whole pointer session (even when leaving the tab).
    cursorRestoreRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const session = pointerSessionRef.current;
      if (!session) return;
      if (moveEvent.pointerId !== session.pointerId) return;

      const dx = moveEvent.clientX - session.startX;
      const dy = moveEvent.clientY - session.startY;

      const threshold = 4;
      if (!session.didReorder && Math.hypot(dx, dy) < threshold) {
        session.lastX = moveEvent.clientX;
        return;
      }

      const viewport = tabsScrollViewportRef.current;
      if (viewport) {
        const viewportRect = viewport.getBoundingClientRect();
        const edge = 24;
        if (moveEvent.clientX < viewportRect.left + edge) {
          viewport.scrollLeft -= 12;
        } else if (moveEvent.clientX > viewportRect.right - edge) {
          viewport.scrollLeft += 12;
        }
      }

      if (swapRafRef.current) return;
      swapRafRef.current = requestAnimationFrame(() => {
        swapRafRef.current = null;
        const workspaceId = activeWorkspaceIdRef.current;
        const sourceTabId = reorderingTabIdRef.current;
        if (!workspaceId || !sourceTabId) return;

        const currentTabs = workspaceTabsRef.current;
        const sourceIndex = currentTabs.findIndex((t) => t.id === sourceTabId);
        if (sourceIndex === -1) return;

        const direction =
          moveEvent.clientX > session.lastX ? "right" : "left";
        session.lastX = moveEvent.clientX;

        const neighborIndex =
          direction === "right" ? sourceIndex + 1 : sourceIndex - 1;
        const neighbor = currentTabs[neighborIndex];
        if (!neighbor) return;

        const sourcePinned = currentTabs[sourceIndex]?.isPin ?? false;
        const neighborPinned = neighbor.isPin ?? false;
        if (sourcePinned !== neighborPinned) return;

        const neighborEl =
          tabsScrollContentRef.current?.querySelector<HTMLElement>(
            `[data-tab-id="${neighbor.id}"]`
          );
        if (!neighborEl) return;

        const rect = neighborEl.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const crossed =
          direction === "right" ? moveEvent.clientX > midX : moveEvent.clientX < midX;
        if (!crossed) return;

        const placement = direction === "right" ? "after" : "before";
        const swapKey = `${workspaceId}:${sourceTabId}:${neighbor.id}:${placement}`;
        if (lastSwapKeyRef.current === swapKey) return;
        lastSwapKeyRef.current = swapKey;

        session.didReorder = true;
        reorderTabs(workspaceId, sourceTabId, neighbor.id, placement);
      });
    };

    const onPointerUpOrCancel = (upEvent: PointerEvent) => {
      const session = pointerSessionRef.current;
      if (!session) return;
      if (upEvent.pointerId !== session.pointerId) return;

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUpOrCancel);
      window.removeEventListener("pointercancel", onPointerUpOrCancel);
      clearPointerSession();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUpOrCancel);
    window.addEventListener("pointercancel", onPointerUpOrCancel);
  };

  const handleTogglePin = (tabId: string, pin: boolean) => {
    setTabPinned(tabId, pin);
  };

  /** Render tab content for the animated tabs. */
  const renderTab = useCallback(
    (tab: Tab, isActive: boolean) => {
      const hasBrowserWindow =
        Array.isArray(tab.stack) &&
        tab.stack.some((s) => s.component === "electron-browser-window");
      const isPinned = Boolean(tab.isPin);

      return (
        <>
          {tab.icon === "bot" ? (
            <Bot className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
          ) : (
            tab.icon && <span className="mr-1.5 shrink-0">{tab.icon}</span>
          )}
          <span className="min-w-0 flex-1 truncate">
            {tab.title || "Untitled"}
          </span>
          {hasBrowserWindow ? (
            <Globe className="ml-1 size-3 shrink-0 text-muted-foreground/80" />
          ) : null}
          {!isPinned && (
            <span
              className={`absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 transition-opacity delay-0 group-hover:delay-300 ${
                workspaceTabs.length <= 1
                  ? "opacity-0"
                  : "opacity-0 group-hover:opacity-100"
              } ${
                isActive
                  ? "group-hover:bg-background hover:bg-background"
                  : "group-hover:bg-sidebar hover:bg-sidebar"
              } z-20 p-0 cursor-pointer flex items-center justify-center rounded-full`}
              onClick={(event) => {
                event.stopPropagation();
                if (workspaceTabs.length > 1) {
                  closeTab(tab.id);
                }
              }}
              aria-label="Close tab"
              role="button"
              style={{
                pointerEvents: workspaceTabs.length <= 1 ? "none" : "auto",
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </>
      );
    },
    [closeTab, workspaceTabs]
  );

  useEffect(() => {
    const viewport = tabsScrollViewportRef.current;
    const activeEl = activeTabRef.current;
    if (!viewport || !activeEl) return;

    const viewportRect = viewport.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const padding = 12;

    const leftEdge = viewportRect.left + padding;
    const rightEdge = viewportRect.right - padding;

    if (activeRect.left < leftEdge) {
      viewport.scrollLeft -= Math.ceil(leftEdge - activeRect.left);
      return;
    }

    if (activeRect.right > rightEdge) {
      viewport.scrollLeft += Math.ceil(activeRect.right - rightEdge);
    }
  }, [activeTabId]);

  return (
    <div className="relative z-10 w-full min-w-0">
      <div className="h-[calc(var(--header-height))] w-full min-w-0 bg-sidebar border-sidebar-border rounded-none p-0 relative overflow-hidden flex items-center justify-start">
        <div
          ref={tabsScrollViewportRef}
          className="relative z-10 flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide"
          onWheel={(event) => {
            const viewport = tabsScrollViewportRef.current;
            if (!viewport) return;

            const canScroll = viewport.scrollWidth > viewport.clientWidth;
            if (!canScroll) return;
            if (event.shiftKey) return;

            const { deltaX, deltaY } = event;
            if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

            viewport.scrollLeft += deltaY;
            event.preventDefault();
          }}
        >
          <div
            ref={tabsScrollContentRef}
            className="relative flex w-max items-center gap-1"
            onClickCapture={(event) => {
              if (pointerSessionRef.current?.didReorder) {
                event.preventDefault();
                event.stopPropagation();
                pointerSessionRef.current.didReorder = false;
              }
            }}
          >
            <AnimatedTabs
              tabs={allTabs}
              value={activeTabId || ""}
              onValueChange={(nextTabId) => {
                startTransition(() => {
                  setActiveTab(nextTabId);
                });
              }}
              tabClassName="h-7 pl-2 pr-7 text-xs gap-0 rounded-md bg-transparent relative z-10 flex items-center max-w-[180px] flex-none w-auto shrink-0 cursor-default active:cursor-grabbing data-[reordering=true]:cursor-grabbing border border-transparent group"
              tabActiveClassName="text-foreground bg-background"
              tabInactiveClassName="text-muted-foreground"
              renderTab={renderTab}
              getTabProps={(tab, isActive) => {
                const chatStatus = chatStatusByTabId[tab.id];
                const isDictating = Boolean(dictationStatusByTabId[tab.id]);
                // 中文注释：与 ChatInput 一致，submitted/streaming 都算 SSE 正在加载。
                const showThinkingBorder =
                  chatStatus === "submitted" ||
                  chatStatus === "streaming" ||
                  isDictating;
                const thinkingBorderStyle = showThinkingBorder
                  ? ({
                      // Tab 上的彩虹边框只需要“外框”，内部填充保持与当前区域一致，避免未激活 Tab 看起来像“被选中”。
                      ["--tenas-thinking-border-fill" as any]: isActive
                        ? "var(--color-background)"
                        : "var(--color-sidebar)",
                    } as CSSProperties)
                  : undefined;

                return {
                  ref: tab.id === activeTabId ? activeTabRef : undefined,
                  "data-no-drag": "true",
                  "data-tab-id": tab.id,
                  "data-pinned": tab.isPin ? "true" : "false",
                  "data-reordering":
                    reorderingTabId === tab.id ? "true" : "false",
                  onPointerDown: (event) => {
                    handleReorderPointerDown(event, tab.id);
                  },
                  style: thinkingBorderStyle,
                  className: showThinkingBorder
                    ? "tenas-thinking-border tenas-thinking-border-on"
                    : undefined,
                };
              }}
              wrapTab={(tab, button) => {
                const menu = (
                  <TabMenu
                    tab={tab}
                    closeTab={closeTab}
                    workspaceTabs={workspaceTabs}
                    isPinned={tab.isPin}
                    onTogglePin={handleTogglePin}
                  >
                    {button}
                  </TabMenu>
                );

                if (shouldShowSeparator && tab.id === firstRegularTabId) {
                  return (
                    <>
                      <div
                        className="h-7 w-px bg-sidebar-border ml-1 mr-2 select-none"
                        aria-hidden
                      />
                      {menu}
                    </>
                  );
                }

                return menu;
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-no-drag="true"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                  aria-label="Add new tab"
                  onClick={handleAddTab}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                新建标签页 ({newTabShortcut})
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
