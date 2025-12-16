import { Plus } from "lucide-react";
import { Tabs, TabsList } from "@/components/animate-ui/components/radix/tabs";
import { useTabs } from "@/hooks/use_tabs";
import { DEFAULT_TAB_INFO } from "@teatime-ai/api/types/tabs";
import { useWorkspace } from "@/app/page";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { TabMenu } from "./TabMenu";

export const HeaderTabs = () => {
  const activeTabId = useTabs((s) => s.activeTabId);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const closeTab = useTabs((s) => s.closeTab);
  const addTab = useTabs((s) => s.addTab);
  const getWorkspaceTabs = useTabs((s) => s.getWorkspaceTabs);
  const tabs = useTabs((s) => s.tabs);
  const reorderTabs = useTabs((s) => s.reorderTabs);
  const setTabPinned = useTabs((s) => s.setTabPinned);
  const { workspace: activeWorkspace } = useWorkspace();
  const activeWorkspaceIdRef = useRef<string | null>(null);
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

  // 当工作区激活且没有标签页时，添加默认标签页
  useEffect(() => {
    if (!activeWorkspace) return;

    const actualWorkspaceTabs = tabs.filter(
      (tab) => tab.workspaceId === activeWorkspace.id
    );
    if (actualWorkspaceTabs.length === 0) {
      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        resourceId: `default:${activeWorkspace.id}`,
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
      setActiveTab(workspaceTabs[0]!.id);
    }
  }, [activeTabId, activeWorkspace, setActiveTab, workspaceTabs]);

  useEffect(() => {
    return () => {
      if (swapRafRef.current) cancelAnimationFrame(swapRafRef.current);
    };
  }, []);

  const handleAddTab = () => {
    if (!activeWorkspace) return;

    addTab({
      workspaceId: activeWorkspace.id,
      createNew: true,
      title: DEFAULT_TAB_INFO.title,
      icon: DEFAULT_TAB_INFO.icon,
    });
  };

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

  // 添加快捷键处理，关闭当前标签页
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 检查是否按下了⌘W或Ctrl+W组合键
      if (event.key === "w" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        // 关闭当前活跃的标签页，但确保不是最后一个标签页
        if (activeTabId && workspaceTabs.length > 1) {
          closeTab(activeTabId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, closeTab, workspaceTabs]);

  useEffect(() => {
    if (!activeTabRef.current) return;
    activeTabRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  return (
    <Tabs
      value={activeTabId || ""}
      onValueChange={setActiveTab}
      className="relative z-10 w-full min-w-0"
    >
      <TabsList
        className="h-[calc(var(--header-height))] w-full min-w-0 bg-sidebar border-sidebar-border rounded-none p-0 relative overflow-hidden flex items-center justify-start"
      >
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
            className="relative flex w-max items-center gap-1 [&_[data-slot=tabs-highlight-item]]:flex-none"
            onClickCapture={(event) => {
              if (pointerSessionRef.current?.didReorder) {
                event.preventDefault();
                event.stopPropagation();
                pointerSessionRef.current.didReorder = false;
              }
            }}
          >
            {pinnedTabs.map((tab) => (
              <TabMenu
                key={tab.id}
                tab={tab}
                activeTabId={activeTabId}
                activeTabRef={activeTabRef}
                closeTab={closeTab}
                workspaceTabs={workspaceTabs}
                onReorderPointerDown={handleReorderPointerDown}
                isDragging={reorderingTabId === tab.id}
                isPinned={tab.isPin}
                onTogglePin={handleTogglePin}
              />
            ))}
            {pinnedTabs.length > 0 && regularTabs.length > 0 && (
              <div
                className="h-7 w-px bg-sidebar-border ml-1 mr-2 select-none"
                aria-hidden
              />
            )}
            {regularTabs.map((tab) => (
              <TabMenu
                key={tab.id}
                tab={tab}
                activeTabId={activeTabId}
                activeTabRef={activeTabRef}
                closeTab={closeTab}
                workspaceTabs={workspaceTabs}
                onReorderPointerDown={handleReorderPointerDown}
                isDragging={reorderingTabId === tab.id}
                isPinned={tab.isPin}
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        </div>
        {/* 添加plus按钮 */}
        <Button
          data-no-drag="true"
          variant="ghost"
          size="icon"
          className="h-full mx-2 w-6 shrink-0 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent relative z-10"
          aria-label="Add new tab"
          onClick={handleAddTab}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </TabsList>
    </Tabs>
  );
};
