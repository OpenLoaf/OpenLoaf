"use client";

import { useState, useEffect } from "react";
import { PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useTabs } from "@/hooks/use_tabs";

import HeaderTabs from "./header-tabs";

export function Header() {
  const { toggleSidebar, open: leftOpen } = useSidebar();
  const { activeTabId, tabs, updateCurrentTabPanels, getShowPanelRightButton } =
    useTabs();
  
  // 使用useState和useEffect来避免hydration mismatch
  const [showPanelRightButton, setShowPanelRightButton] = useState(false);
  
  // 直接从tabs数组中查找当前激活的tab，确保获取最新状态
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  // 获取rightPanel的hidden状态，默认false
  const isRightPanelHidden = activeTab?.rightPanel?.hidden ?? false;
  
  // 在客户端hydration完成后更新状态
  useEffect(() => {
    setShowPanelRightButton(getShowPanelRightButton());
  }, [getShowPanelRightButton, activeTabId, tabs]);

  return (
    <header className="bg-sidebar sticky top-0 z-50 flex w-full items-center justify-between">
      <div
        className={`flex h-(--header-height) items-center pl-2 gap-2 transition-[width] duration-200 ease-linear ${
          leftOpen ? "w-(--sidebar-width)" : "w-11"
        }`}
      >
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
        >
          <PanelLeft
            className={`h-4 w-4 transition-transform duration-200 ${
              !leftOpen ? "rotate-180" : ""
            }`}
          />
        </Button>
      </div>
      <HeaderTabs />
      <div
        className={`flex h-(--header-height) items-center pr-2 gap-2 transition-opacity duration-200 ease-in-out ${
          showPanelRightButton
            ? "opacity-100 visible"
            : "opacity-0 invisible"
        }`}
      >
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={() => {
            // 直接使用当前状态计算新的hidden值
            const currentTab = tabs.find((tab) => tab.id === activeTabId);
            const currentHidden = currentTab?.rightPanel?.hidden ?? false;
            updateCurrentTabPanels({
              rightPanel: { hidden: !currentHidden },
            });
          }}
        >
          <PanelRight
            className={`h-4 w-4 transition-transform duration-200 ${
              isRightPanelHidden ? "rotate-180" : ""
            }`}
          />
        </Button>
      </div>
    </header>
  );
}