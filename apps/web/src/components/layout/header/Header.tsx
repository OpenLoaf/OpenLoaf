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

import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import { isElectronEnv } from "@/utils/is-electron-env";
import { useAppState } from "@/hooks/use-app-state";
import { useLayoutState } from "@/hooks/use-layout-state";
import { resolveRightChatState } from "@/hooks/layout-utils";
import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { Button } from "@openloaf/ui/button";

import { PageTitle } from "./PageTitle";

import { Search as SearchDialog } from "@/components/search/Search";

export const Header = () => {
  const activeTab = useAppState();
  const rightChatState = useMemo(
    () => resolveRightChatState(activeTab),
    [activeTab],
  );
  // 中文注释：右侧聊天按钮与主布局共用同一套显隐规则，避免 Header 和 TabLayout 各自解释状态。
  const canToggleChat = rightChatState.canToggle;
  const isChatCollapsed = rightChatState.isCollapsed;
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
      const visible = Array.from(actionsNode.children).some(
        (el) => (el as HTMLElement).offsetWidth > 0,
      );
      setHasActions(visible);
    });
    observer.observe(actionsNode, { childList: true, subtree: true, attributes: true });
    setHasActions(
      Array.from(actionsNode.children).some(
        (el) => (el as HTMLElement).offsetWidth > 0,
      ),
    );
    return () => observer.disconnect();
  }, [actionsNode]);
  const headerTitleExtraRef = useCallback(
    (node: HTMLDivElement | null) => setHeaderTitleExtraTarget(node),
    [setHeaderTitleExtraTarget],
  );
  const searchOpen = useGlobalOverlay((s) => s.searchOpen);
  const setSearchOpen = useGlobalOverlay((s) => s.setSearchOpen);
  const isElectron = isElectronEnv();
  const isMac =
    typeof navigator !== "undefined" &&
    (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));
  const trafficLightsWidth = isElectron && isMac ? "72px" : "0px";


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
      <div className="flex shrink-0 h-(--header-height) items-center pr-2 relative gap-0.5">
        {hasActions && <div className="mx-1 h-5 w-px bg-foreground/20" />}
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
            AI
          </TooltipContent>
        </Tooltip>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
};
