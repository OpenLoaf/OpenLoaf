"use client";

import { PanelLeft, PanelRight, Settings } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { useSidebar } from "@tenas-ai/ui/sidebar";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { openSettingsTab } from "@/lib/globalShortcuts";

import { HeaderTabs } from "./HeaderTabs";
import { ModeToggle } from "./ModeToggle";
import { StackDockMenuButton } from "./StackDockMenuButton";

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

export const Header = () => {
  const { toggleSidebar, open: leftOpen } = useSidebar();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeTab = useTabs((s) =>
    s.activeTabId ? s.tabs.find((t) => t.id === s.activeTabId) : undefined,
  );
  const setTabRightChatCollapsed = useTabs((s) => s.setTabRightChatCollapsed);

  const isElectron =
    process.env.NEXT_PUBLIC_ELECTRON === "1" ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron"));
  const isMac =
    typeof navigator !== "undefined" &&
    (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));
  const trafficLightsWidth = isElectron && isMac ? "72px" : "0px";

  const canToggleChat = Boolean(activeTab?.base);
  const isChatCollapsed = Boolean(activeTab?.rightChatCollapsed);
  const sidebarShortcut = formatShortcutLabel("Mod+Shift+B", isMac);
  const chatShortcut = formatShortcutLabel("Mod+B", isMac);
  const settingsShortcut =
    isElectron && isMac ? formatShortcutLabel("Cmd+,", isMac) : "";

  return (
    <header
      data-slot="app-header"
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
        className={`flex shrink-0 h-(--header-height) items-center transition-[width] duration-200 ease-linear ${
          leftOpen
            ? "w-[calc(var(--sidebar-width)-var(--macos-traffic-lights-width))] "
            : "w-[max(5rem,calc(6rem-var(--macos-traffic-lights-width)))] "
        }`}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-no-drag="true"
              className="ml-1 h-8 w-8 shrink-0"
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
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            切换侧边栏 ({sidebarShortcut})
          </TooltipContent>
        </Tooltip>
        <div className="flex-1"></div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-no-drag="true"
              className="h-8 w-8 shrink-0"
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!workspaceId) return;
                openSettingsTab(workspaceId);
              }}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {settingsShortcut ? `打开设置 (${settingsShortcut})` : "打开设置"}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden pl-1">
        <div className="min-w-0 flex-1 overflow-hidden">
          <HeaderTabs />
        </div>
      </div>
      <div className="flex shrink-0 h-(--header-height) items-center pr-2 relative">
        {/* 用于 stack 最小化动画的吸附目标。 */}
        <span
          aria-hidden="true"
          data-stack-dock-button="true"
          className="pointer-events-none absolute left-0 top-1/2 h-8 w-8 -translate-y-1/2 opacity-0"
        />
        <div data-no-drag="true">
          <StackDockMenuButton />
        </div>
        <div data-no-drag="true">
          <ModeToggle />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-no-drag="true"
              className={`h-8 w-8 transition-all duration-200 ease-in-out ${
                canToggleChat
                  ? "opacity-100 w-8"
                  : "opacity-0 w-0 pointer-events-none"
              }`}
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!activeTabId) return;
                setTabRightChatCollapsed(activeTabId, !isChatCollapsed);
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
                {/* <PanelRight
                  className={`h-4 w-4 transition-transform duration-200 ${
                    isChatCollapsed ? "rotate-180" : ""
                  }`}
                /> */}
                <img
                  src="/head_s.png"
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5 object-contain scale-[1.03] transition-transform duration-200 ease-out hover:rotate-8"
                />
              </motion.div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            切换聊天面板 ({chatShortcut})
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};
