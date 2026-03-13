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
import { Sparkles } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useAppState } from "@/hooks/use-app-state";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { ProjectSettingsDialog } from "@/components/project/settings/ProjectSettingsDialog";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import { shouldDisableRightChat } from "@/hooks/layout-utils";
import { isElectronEnv } from "@/utils/is-electron-env";

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
  const { t } = useTranslation("nav");
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
    if (!actionsNode) {
      setHasActions(false);
      return;
    }
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

  const isRightChatDisabled = shouldDisableRightChat(activeTab);
  const canToggleChat = Boolean(activeTab?.base) && !isRightChatDisabled;
  const isChatCollapsed = Boolean(activeTab?.rightChatCollapsed);
  const chatShortcut = formatShortcutLabel("Mod+B", isMac);

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
        className="flex shrink-0 h-(--header-height) items-center px-1"
        style={
          {
            width: `calc(var(--sidebar-width) - var(--macos-traffic-lights-width))`,
          } as CSSProperties
        }
      />
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
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <ProjectSettingsDialog />
    </header>
  );
};
