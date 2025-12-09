import { X, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabs } from "@/hooks/use_tabs";
import { useWorkspace } from "@/hooks/use_workspace";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

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
      const activeTab = tabsList.querySelector(
        '[data-state="active"]'
      ) as HTMLButtonElement;
      if (!activeTab) return;

      const rect = activeTab.getBoundingClientRect();
      const tabsListRect = tabsList.getBoundingClientRect();

      tabsList.style.setProperty(
        "--active-tab-left",
        `${rect.left - tabsListRect.left}px`
      );
      tabsList.style.setProperty("--active-tab-width", `${rect.width}px`);
      tabsList.style.setProperty(
        "--active-tab-top",
        `${rect.top - tabsListRect.top}px`
      );
      tabsList.style.setProperty("--active-tab-height", `${rect.height}px`);
    };

    updateActiveTabPosition();

    // 添加resize监听，确保在窗口大小变化时更新位置
    window.addEventListener("resize", updateActiveTabPosition);
    return () => window.removeEventListener("resize", updateActiveTabPosition);
  }, [activeTabId, workspaceTabs]);

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
          className="absolute bg-background rounded-md transition-all duration-300 ease-out pointer-events-none"
          style={{
            left: "var(--active-tab-left, 0px)",
            width: "var(--active-tab-width, 0px)",
            top: "var(--active-tab-top, 0px)",
            height: "var(--active-tab-height, 100%)",
          }}
        />

        {workspaceTabs.map((tab) => (
          <div key={tab.id} className="relative inline-flex items-center group">
            <TabsTrigger
              ref={tab.id === activeTabId ? activeTabRef : null}
              value={tab.id}
              className="h-7 px-1.5 text-xs rounded-md text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none pr-2 relative z-10 min-w-[130px] max-w-[130px] flex items-center justify-between"
            >
              <span className="truncate flex-1">{tab.title || "Untitled"}</span>
              <span
                className="ml-auto h-6 w-6 transition-opacity opacity-0 group-hover:opacity-100 relative z-10 p-0 cursor-pointer flex items-center justify-center rounded-full hover:bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label="Close tab"
                role="button"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </TabsTrigger>
          </div>
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
