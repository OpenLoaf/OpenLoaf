import { Plus } from "lucide-react";
import { Tabs, TabsList } from "@/components/animate-ui/components/radix/tabs";
import { useTabs } from "@/hooks/use_tabs";
import { useWorkspace } from "@/app/page";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { TabMenu } from "./TabMenu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { checkIsRunningInTauri } from "@/utils/tauri";

export const HeaderTabs = () => {
  const {
    activeTabId,
    setActiveTab,
    closeTab,
    addTab,
    getWorkspaceTabs,
    tabs,
    reorderTabs,
    setTabPinned,
  } = useTabs();
  const { workspace: activeWorkspace } = useWorkspace();
  const tabsListRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);
  const [dropIndicatorLeft, setDropIndicatorLeft] = useState<number | null>(
    null
  );
  const [dropPlacement, setDropPlacement] = useState<"before" | "after">(
    "before"
  );

  useEffect(() => {
    setIsTauri(checkIsRunningInTauri());
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isTauri) return;
      if (event.pointerType !== "mouse") return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-no-drag="true"]')) return;

      void getCurrentWindow().startDragging();
    },
    [isTauri]
  );

  // 获取当前工作区的标签列表
  const workspaceTabs = activeWorkspace
    ? getWorkspaceTabs(activeWorkspace.id)
    : [];
  const pinnedTabs = workspaceTabs.filter((tab) => tab.isPin);
  const regularTabs = workspaceTabs.filter((tab) => !tab.isPin);

  // 当工作区激活且没有标签页时，添加默认标签页
  useEffect(() => {
    if (!activeWorkspace) return;

    const actualWorkspaceTabs = tabs.filter(
      (tab) => tab.workspaceId === activeWorkspace.id
    );
    if (actualWorkspaceTabs.length === 0) {
      // 检查是否有默认标签页的引用
      const defaultTabId = `default-tab-${activeWorkspace.id}`;
      addTab({
        id: defaultTabId,
        title: "New Page",
        workspaceId: activeWorkspace.id,
        createNew: true,
      });
    }
  }, [activeWorkspace, tabs, addTab]);

  const handleAddTab = () => {
    if (!activeWorkspace) return;

    addTab({
      id: `page-${Date.now()}`,
      title: "New Page",
      workspaceId: activeWorkspace.id,
      createNew: true,
    });
  };

  const handleTabDrop = (targetTabId: string) => {
    if (!activeWorkspace) return;

    if (!draggingTabId || draggingTabId === targetTabId) {
      setDraggingTabId(null);
      setDropIndicatorLeft(null);
      return;
    }

    reorderTabs(activeWorkspace.id, draggingTabId, targetTabId, dropPlacement);
    setDraggingTabId(null);
    setDropIndicatorLeft(null);
  };

  const handleTabDragStart = (tabId: string) => {
    setDraggingTabId(tabId);
  };

  const handleTabDragOver = (
    event: DragEvent<HTMLButtonElement>,
    _targetTabId: string
  ) => {
    event.preventDefault();
    if (!activeWorkspace || !draggingTabId) return;

    const target = event.currentTarget;
    const tabsList = tabsListRef.current;
    if (!tabsList) return;

    const rect = target.getBoundingClientRect();
    const tabsListRect = tabsList.getBoundingClientRect();
    const targetPinned = target.dataset.pinned === "true";
    const sourcePinned = workspaceTabs.find(
      (tab) => tab.id === draggingTabId
    )?.isPin;

    if (!sourcePinned && targetPinned) {
      const pinnedElements = tabsList.querySelectorAll('[data-pinned="true"]');
      const lastPinned = pinnedElements[
        pinnedElements.length - 1
      ] as HTMLButtonElement | null;
      if (lastPinned) {
        const lastRect = lastPinned.getBoundingClientRect();
        setDropPlacement("before");
        setDropIndicatorLeft(lastRect.right - tabsListRect.left);
      }
      return;
    }

    if (sourcePinned && !targetPinned) {
      const pinnedElements = tabsList.querySelectorAll('[data-pinned="true"]');
      const lastPinned = pinnedElements[
        pinnedElements.length - 1
      ] as HTMLButtonElement | null;
      if (lastPinned) {
        const lastRect = lastPinned.getBoundingClientRect();
        setDropPlacement("after");
        setDropIndicatorLeft(lastRect.right - tabsListRect.left);
      }
      return;
    }

    const isAfter = event.clientX > rect.left + rect.width / 2;

    setDropPlacement(isAfter ? "after" : "before");
    setDropIndicatorLeft(
      isAfter ? rect.right - tabsListRect.left : rect.left - tabsListRect.left
    );
  };

  const handleTabDragEnd = () => {
    setDraggingTabId(null);
    setDropIndicatorLeft(null);
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

  return (
    <Tabs
      value={activeTabId || ""}
      onValueChange={setActiveTab}
      className="flex-1 relative z-10"
    >
      <TabsList
        ref={tabsListRef}
        className="h-[calc(var(--header-height))] bg-sidebar border-sidebar-border rounded-none p-0 relative overflow-hidden gap-1"
      >
        <div
          className="tauri-drag-region absolute inset-0 z-0"
          data-tauri-drag-region
          onPointerDown={handlePointerDown}
        />
        {draggingTabId && dropIndicatorLeft !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-7 w-[2px] bg-primary z-20 transition-[left]"
            style={{ left: dropIndicatorLeft }}
          />
        )}

        {pinnedTabs.map((tab) => (
          <TabMenu
            key={tab.id}
            tab={tab}
            activeTabId={activeTabId}
            activeTabRef={activeTabRef}
            closeTab={closeTab}
            workspaceTabs={workspaceTabs}
            onDragStart={handleTabDragStart}
            onDragOver={handleTabDragOver}
            onDrop={handleTabDrop}
            onDragEnd={handleTabDragEnd}
            isDragging={draggingTabId === tab.id}
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
            onDragStart={handleTabDragStart}
            onDragOver={handleTabDragOver}
            onDrop={handleTabDrop}
            onDragEnd={handleTabDragEnd}
            isDragging={draggingTabId === tab.id}
            isPinned={tab.isPin}
            onTogglePin={handleTogglePin}
          />
        ))}
        {/* 添加plus按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-full mx-2 w-6 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent relative z-10"
          aria-label="Add new tab"
          onClick={handleAddTab}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </TabsList>
    </Tabs>
  );
};
