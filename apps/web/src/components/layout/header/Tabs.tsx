import { X, Plus } from "lucide-react";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { useTabs } from "@/hooks/use_tabs";
import { useWorkspace } from "@/hooks/use_workspace";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { TabMenu } from "./TabMenu";

export const HeaderTabs = () => {
  const { activeTabId, setActiveTab, closeTab, addTab, getWorkspaceTabs } =
    useTabs();
  const { activeWorkspace } = useWorkspace();
  const tabsListRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // 获取当前工作区的标签列表
  const workspaceTabs = activeWorkspace
    ? getWorkspaceTabs(activeWorkspace.id)
    : [];

  const handleAddTab = () => {
    if (!activeWorkspace) return;

    addTab({
      id: `page-${Date.now()}`,
      title: "New Page",
      rightPanel: {
        component: "ai-chat",
        params: {},
      },
      workspaceId: activeWorkspace.id,
      createNew: true,
    });
  };

  useEffect(() => {
    const tabsList = tabsListRef.current;
    if (!tabsList) return;

    const updateActiveTabPosition = () => {
      // 查找活跃标签页，使用aria-selected="true"而不是data-state="active"
      const activeTab = tabsList.querySelector(
        '[aria-selected="true"]'
      ) as HTMLButtonElement;
      if (!activeTab) return;

      const rect = activeTab.getBoundingClientRect();
      const tabsListRect = tabsList.getBoundingClientRect();

      // 计算相对位置
      const left = rect.left - tabsListRect.left;
      const width = rect.width;

      // 直接设置样式，不使用CSS变量
      const slider = tabsList.querySelector(".bg-background") as HTMLDivElement;
      if (slider) {
        slider.style.left = `${left}px`;
        slider.style.width = `${width}px`;
        slider.style.height = "28px"; /* h-7 = 28px */
      }
    };

    updateActiveTabPosition();

    // 添加resize监听，确保在窗口大小变化时更新位置
    window.addEventListener("resize", updateActiveTabPosition);
    return () => window.removeEventListener("resize", updateActiveTabPosition);
  }, [activeTabId, workspaceTabs]);

  // 添加快捷键处理，关闭当前标签页
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 检查是否按下了⌘W或Ctrl+W组合键
      if (event.key === "w" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        // 关闭当前活跃的标签页
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, closeTab]);

  return (
    <Tabs
      value={activeTabId || ""}
      onValueChange={setActiveTab}
      className="flex-1"
    >
      <TabsList
        ref={tabsListRef}
        className="h-[calc(var(--header-height))] bg-sidebar border-sidebar-border rounded-none p-0  relative overflow-hidden"
      >
        {/* 滑块元素 */}
        <div
          className="absolute bg-background rounded-md transition-all duration-300 ease-out pointer-events-none z-0"
          style={{
            left: "var(--active-tab-left, 0px)",
            width: "var(--active-tab-width, 0px)",
            top: "50%",
            transform: "translateY(-50%)",
            height: "28px" /* h-7 = 28px */,
          }}
        />

        {workspaceTabs.map((tab) => (
          <TabMenu
            key={tab.id}
            tab={tab}
            activeTabId={activeTabId}
            activeTabRef={activeTabRef}
            closeTab={closeTab}
            workspaceTabs={workspaceTabs}
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
