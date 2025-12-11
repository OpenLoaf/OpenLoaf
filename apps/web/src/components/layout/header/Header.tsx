"use client";

import { useState, useEffect } from "react";
import { PanelLeft, PanelRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useTabs } from "@/hooks/use_tabs";

import { HeaderTabs } from "./Tabs";
import { ModeToggle } from "./ModeToggle";

export const Header = () => {
  const { toggleSidebar, open: leftOpen } = useSidebar();
  const { activeRightPanel, activeLeftPanel, updateCurrentTabPanels } =
    useTabs();

  // 获取rightPanel的hidden状态，默认false
  const isRightPanelHidden = activeRightPanel?.hidden ?? false;

  // 只有当左侧面板存在且右侧面板也存在时，才显示右侧面板按钮
  const showPanelRightButton = Boolean(activeLeftPanel && activeRightPanel);

  return (
    <header className="bg-sidebar sticky top-0 z-50 flex w-full items-center justify-between">
      <div
        className={`flex h-(--header-height) items-center pl-2 pr-2 gap-2 transition-[width] duration-200 ease-linear ${
          leftOpen ? "w-(--sidebar-width) mr-2" : "w-15 mr-4"
        }`}
      >
        <Button
          className="h-8 w-4 ml-1"
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
        <div className="flex-1"></div>
        <Button className="h-8 w-4" variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      <HeaderTabs />
      <div className="flex h-(--header-height) items-center pr-2 gap-2">
        <ModeToggle />
        <Button
          className={`h-8 w-8 transition-opacity duration-200 ease-in-out ${
            showPanelRightButton ? "opacity-100 visible" : "opacity-0 invisible"
          }`}
          variant="ghost"
          size="icon"
          onClick={() => {
            // 直接使用activeRightPanel的hidden状态计算新值
            updateCurrentTabPanels({
              rightPanel: { hidden: !isRightPanelHidden },
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
};
