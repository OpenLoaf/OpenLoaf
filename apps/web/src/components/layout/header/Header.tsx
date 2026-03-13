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

import { useTranslation } from "react-i18next";
import { PanelLeft, PanelRight, Settings, Sparkles, Search } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useSidebar } from "@openloaf/ui/sidebar";
import { useAppState } from "@/hooks/use-app-state";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useGlobalOverlay, openSettingsTab } from "@/lib/globalShortcuts";
import { ProjectSettingsDialog } from "@/components/project/settings/ProjectSettingsDialog";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import { isSettingsForegroundPage, shouldDisableRightChat } from "@/hooks/layout-utils";
import { isElectronEnv } from "@/utils/is-electron-env";
import { cn } from "@/lib/utils";
import { isProjectMode } from "@/lib/project-mode";

import { PageTitle } from "./PageTitle";
import { ModeToggle } from "./ModeToggle";
import { Search as SearchDialog } from "@/components/search/Search";

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
  const { t } = useTranslation('nav');
  const { toggleSidebar, open: leftOpen } = useSidebar();
  const setHeaderActionsTarget = useHeaderSlot((s) => s.setHeaderActionsTarget);
  const setHeaderTitleExtraTarget = useHeaderSlot((s) => s.setHeaderTitleExtraTarget);
  const [actionsNode, setActionsNode] = useState<HTMLDivElement | null>(null);
  const headerActionsRef = useCallback(
    (node: HTMLDivElement | null) => {
      setHeaderActionsTarget(node);
      setActionsNode(node);
    },
    [setHeaderActionsTarget],
  );
  const [hasActions, setHasActions] = useState(false);
  useEffect(() => {
    if (!actionsNode) { setHasActions(false); return; }
    const observer = new MutationObserver(() => {
      setHasActions(actionsNode.childElementCount > 0);
    });
    observer.observe(actionsNode, { childList: true });
    setHasActions(actionsNode.childElementCount > 0);
    return () => observer.disconnect();
  }, [actionsNode]);
  const headerTitleExtraRef = useCallback(
    (node: HTMLDivElement | null) => setHeaderTitleExtraTarget(node),
    [setHeaderTitleExtraTarget],
  );
  const activeTab = useAppState();
  const searchOpen = useGlobalOverlay((s) => s.searchOpen);
  const setSearchOpen = useGlobalOverlay((s) => s.setSearchOpen);
  const isElectron = isElectronEnv();
  const isMac =
    typeof navigator !== "undefined" &&
    (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));
  const trafficLightsWidth = isElectron && isMac ? "72px" : "0px";
  const collapsedSidebarWidthClass = isMac
    ? "w-[max(7rem,calc(8rem-var(--macos-traffic-lights-width)))] "
    : "w-[6.5rem] ";

  const isSettingsPageActive = isSettingsForegroundPage(activeTab);
  const projectMode = isProjectMode(activeTab?.projectShell);
  const isRightChatDisabled = shouldDisableRightChat(activeTab);
  const canToggleChat = Boolean(activeTab?.base) && !isRightChatDisabled;
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
        className={`flex shrink-0 h-(--header-height) items-center gap-1 px-1 transition-[width] duration-200 ease-linear ${
          leftOpen
            ? "w-[calc(var(--sidebar-width)-var(--macos-traffic-lights-width))] "
            : collapsedSidebarWidthClass
        }`}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-no-drag="true"
              className="mr-auto h-8 w-8 shrink-0"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
            >
              <PanelLeft
                className={`h-4 w-4 text-ol-purple/70 transition-transform duration-200 ${
                  !leftOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('header.toggleSidebar', { shortcut: sidebarShortcut })}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-no-drag="true"
              className="h-8 w-8 shrink-0"
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('search')} (⌘K)
          </TooltipContent>
        </Tooltip>
        {!projectMode ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-no-drag="true"
                aria-pressed={isSettingsPageActive}
                className={cn(
                  "h-8 w-8 shrink-0",
                  isSettingsPageActive
                    ? "bg-ol-amber-bg text-ol-amber hover:bg-ol-amber-bg-hover"
                    : undefined,
                )}
                variant="ghost"
                size="icon"
                onClick={() => openSettingsTab()}
              >
                <Settings
                  className={cn(
                    "h-4 w-4 text-ol-amber/70",
                    isSettingsPageActive
                      ? "text-ol-amber"
                      : undefined,
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {settingsShortcut ? t('header.openSettingsWithShortcut', { shortcut: settingsShortcut }) : t('header.openSettings')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden pl-1">
        <div className="min-w-0 shrink-0">
          <PageTitle />
        </div>
        <div
          ref={headerTitleExtraRef}
          className="flex shrink-0 items-center"
          data-slot="header-title-extra"
        />
        <div
          ref={headerActionsRef}
          className="flex min-w-0 flex-1 items-center justify-end"
          data-slot="header-actions"
        />
      </div>
      <div className="flex shrink-0 h-(--header-height) items-center pr-2 relative">
        {hasActions && <div className="mx-1 h-5 w-px bg-foreground/20" />}
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
                if (!canToggleChat) return;
                useLayoutState.getState().setRightChatCollapsed(!isChatCollapsed);
              }}
            >
              <div className="animate-[sparkle-float_2.2s_ease-in-out_infinite] hover:animate-none hover:-translate-y-0.5 hover:rotate-[10deg] active:scale-95 active:rotate-0 transition-transform">
                <Sparkles
                  aria-hidden="true"
                  className="h-5 w-5 text-ol-amber"
                  fill="currentColor"
                />
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('header.toggleChatPanel', { shortcut: chatShortcut })}
          </TooltipContent>
        </Tooltip>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <ProjectSettingsDialog />
    </header>
  );
};
