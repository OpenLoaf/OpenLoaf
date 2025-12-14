"use client";

import { PanelLeft, PanelRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/animate-ui/components/radix/sidebar";
import { useTabs } from "@/hooks/use_tabs";
import { Bot } from "@/components/animate-ui/icons/bot";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { motion } from "motion/react";
import type { CSSProperties } from "react";

import { HeaderTabs } from "./Tabs";
import { ModeToggle } from "./ModeToggle";

export const Header = () => {
  const { toggleSidebar, open: leftOpen } = useSidebar();
  const { activeRightPanel, activeLeftPanel, updateCurrentTabPanels } =
    useTabs();

  const isElectron =
    process.env.NEXT_PUBLIC_ELECTRON === "1" ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron"));
  const isMac =
    typeof navigator !== "undefined" &&
    (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));
  const trafficLightsWidth = isElectron && isMac ? "72px" : "0px";

  // 获取rightPanel的hidden状态，默认false
  const isRightPanelHidden = activeRightPanel?.hidden ?? false;

  // 只有当左侧面板存在且右侧面板也存在时，才显示右侧面板按钮
  const showPanelRightButton = Boolean(activeLeftPanel && activeRightPanel);

  return (
    <header
      className={`bg-sidebar sticky top-0 z-50 grid w-full grid-cols-[auto_1fr_auto] items-center overflow-hidden pl-(--macos-traffic-lights-width) ${
        isElectron ? "electron-drag" : ""
      }`}
      style={
        {
          "--macos-traffic-lights-width": trafficLightsWidth,
        } as CSSProperties
      }
    >
      <div
        className={`flex shrink-0 h-(--header-height) items-center pl-2 pr-2 gap-2 transition-[width] duration-200 ease-linear ${
          leftOpen
            ? "w-[calc(var(--sidebar-width)-var(--macos-traffic-lights-width))] mr-2"
            : "w-[max(3.75rem,calc(3.75rem-var(--macos-traffic-lights-width)))] mr-4"
        }`}
      >
        <Button
          data-no-drag="true"
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
        <Button
          data-no-drag="true"
          className="h-8 w-4"
          variant="ghost"
          size="icon"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-w-0 overflow-hidden">
        <HeaderTabs />
      </div>
      <div className="flex shrink-0 h-(--header-height) items-center pr-2">
        <div data-no-drag="true">
          <ModeToggle />
        </div>
        <Button
          data-no-drag="true"
          className={`h-8 w-8 transition-all duration-200 ease-in-out ${
            showPanelRightButton
              ? "opacity-100 w-8"
              : "opacity-0 w-0 pointer-events-none"
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
          <motion.div
            animate={{
              x: [0, -5, 5, -5, 5, 0],
            }}
            transition={{
              duration: 0.6,
              ease: "easeInOut",
            }}
          >
            {activeRightPanel?.component === "ai-chat" ? (
              <AnimateIcon animate loop loopDelay={3000}>
                <Bot className={`h-4 w-4`} />
              </AnimateIcon>
            ) : (
              <PanelRight
                className={`h-4 w-4 transition-transform duration-200 ${
                  isRightPanelHidden ? "rotate-180" : ""
                }`}
              />
            )}
          </motion.div>
        </Button>
      </div>
    </header>
  );
};
