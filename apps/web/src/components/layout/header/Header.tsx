/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { PanelLeft, PanelRight, Settings, Sparkles } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useSidebar } from "@openloaf/ui/sidebar";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabView } from "@/hooks/use-tab-view";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { openSettingsTab } from "@/lib/globalShortcuts";
import { isElectronEnv } from "@/utils/is-electron-env";

import { HeaderTabs } from "./HeaderTabs";
import { ModeToggle } from "./ModeToggle";

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
  const activeTab = useTabView(activeTabId ?? undefined);
  const setTabRightChatCollapsed = useTabRuntime((s) => s.setTabRightChatCollapsed);

  const isElectron = isElectronEnv();
  const isMac =
    typeof navigator !== "undefined" &&
    (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));
  const trafficLightsWidth = isElectron && isMac ? "72px" : "0px";
  const collapsedSidebarWidthClass = isMac
    ? "w-[max(5rem,calc(6rem-var(--macos-traffic-lights-width)))] "
    : "w-[4.5rem] ";

  const canToggleChat = Boolean(activeTab?.base);
  const isChatCollapsed = Boolean(activeTab?.rightChatCollapsed);
  const sidebarShortcut = formatShortcutLabel("Mod+Shift+B", isMac);
  const chatShortcut = formatShortcutLabel("Mod+B", isMac);
  const settingsShortcut =
    isElectron && isMac ? formatShortcutLabel("Cmd+,", isMac) : "";

  return (
    <header
      data-slot="app-header"
      className={`bg-sidebar sticky top-0 z-50 grid w-full grid-cols-[auto_1fr_auto] items-center overflow-hidden pl-(--macos-traffic-lights-width) pr-(--titlebar-controls-width) ${
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
            : collapsedSidebarWidthClass
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
                  y: [0, -1.5, 0],
                  rotate: [0, -4, 4, 0],
                }}
                transition={{
                  duration: 2.2,
                  ease: "easeInOut",
                  repeat: Number.POSITIVE_INFINITY,
                }}
                whileHover={{ y: -2, rotate: 10 }}
                whileTap={{ scale: 0.95, rotate: 0 }}
              >
                {/* <PanelRight
                  className={`h-4 w-4 transition-transform duration-200 ${
                    isChatCollapsed ? "rotate-180" : ""
                  }`}
                /> */}
                <Sparkles
                  aria-hidden="true"
                  className="h-5 w-5 text-amber-500 transition-transform duration-200 ease-out hover:rotate-8"
                  fill="currentColor"
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
