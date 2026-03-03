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

import * as React from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openloaf/ui/alert-dialog";
import { useTabs } from "@/hooks/use-tabs";
import { useOpenSessionIds } from "@/hooks/use-open-session-ids";
import { useWorkspaceChatSessions } from "@/hooks/use-chat-sessions";
import SessionList from "@/components/ai/session/SessionList";
import type { Session } from "@/components/ai/session/SessionItem";

interface HeaderChatHistoryProps {
  workspaceId: string;
}

export function HeaderChatHistory({ workspaceId }: HeaderChatHistoryProps) {
  const { t } = useTranslation("nav");
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [menuLock, setMenuLock] = React.useState(false);
  const [alertOpen, setAlertOpen] = React.useState(false);
  const pendingRef = React.useRef<{
    tabId: string;
    sessionId: string;
  } | null>(null);

  const activeTabId = useTabs((s) => s.activeTabId);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const setActiveTabSession = useTabs((s) => s.setActiveTabSession);
  const addTab = useTabs((s) => s.addTab);

  const { openSessionIds, sessionToTabId } = useOpenSessionIds(workspaceId);
  const { sessions, isLoading } = useWorkspaceChatSessions({ workspaceId });

  // 当前 Tab 中所有的 session id
  const currentTabSessionIds = React.useMemo(() => {
    const tab = useTabs.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return new Set<string>();
    const ids =
      Array.isArray(tab.chatSessionIds) && tab.chatSessionIds.length > 0
        ? tab.chatSessionIds
        : [tab.chatSessionId];
    return new Set(ids.filter((id) => typeof id === "string" && id));
  }, [activeTabId]);

  const handleSelect = React.useCallback(
    (session: Session) => {
      const sessionId = session.id;
      const ownerTabId = sessionToTabId.get(sessionId);

      // 场景 1：会话在当前 Tab 中
      if (activeTabId && currentTabSessionIds.has(sessionId)) {
        setActiveTabSession(activeTabId, sessionId, { loadHistory: true });
        setPopoverOpen(false);
        return;
      }

      // 场景 2：会话在其他 Tab 中 → 弹确认
      if (ownerTabId && ownerTabId !== activeTabId) {
        pendingRef.current = { tabId: ownerTabId, sessionId };
        setPopoverOpen(false);
        setAlertOpen(true);
        return;
      }

      // 场景 3：会话未打开 → 新建 Tab
      const matched = sessions.find((s) => s.id === sessionId);
      addTab({
        workspaceId,
        chatSessionId: sessionId,
        chatLoadHistory: true,
        chatParams: matched?.projectId ? { projectId: matched.projectId } : undefined,
      });
      setPopoverOpen(false);
    },
    [
      activeTabId,
      currentTabSessionIds,
      sessionToTabId,
      sessions,
      workspaceId,
      setActiveTabSession,
      addTab,
    ],
  );

  const handleConfirmSwitch = React.useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    setActiveTab(pending.tabId);
    setActiveTabSession(pending.tabId, pending.sessionId, { loadHistory: true });
    pendingRef.current = null;
    setAlertOpen(false);
  }, [setActiveTab, setActiveTabSession]);

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          if (!open && menuLock) return;
          setPopoverOpen(open);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                data-no-drag="true"
                className="h-8 w-8 shrink-0"
                variant="ghost"
                size="icon"
              >
                <History className="h-4 w-4 text-sky-700/70 dark:text-sky-300/70" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t("header.chatHistory")}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          className="w-72 p-0"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <SessionList
            externalSessions={sessions}
            externalLoading={isLoading}
            openSessionIds={openSessionIds}
            onSelect={handleSelect}
            onMenuOpenChange={setMenuLock}
            className="max-h-80"
          />
        </PopoverContent>
      </Popover>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.sessionAlreadyOpen")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("header.sessionAlreadyOpenDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingRef.current = null;
              }}
            >
              {t("header.stayHere")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSwitch}>
              {t("header.switchTab")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
