/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { CircleX, Pin, PinOff, X } from "lucide-react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from "@openloaf/ui/context-menu";
import type { TabMeta } from "@/hooks/tab-types";
import type { ReactNode } from "react";

interface TabMenuProps {
  tab: TabMeta;
  closeTab: (tabId: string) => void;
  workspaceTabs: TabMeta[];
  isPinned?: boolean;
  onTogglePin?: (tabId: string, pin: boolean) => void;
  children: ReactNode;
}

export const TabMenu = ({
  tab,
  closeTab,
  workspaceTabs,
  isPinned = false,
  onTogglePin,
  children,
}: TabMenuProps) => {
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
          new CustomEvent("openloaf:overlay", {
            detail: { id: `tabmenu:${tab.id}`, open },
          })
        );
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          icon={isPinned ? PinOff : Pin}
          onClick={() => onTogglePin?.(tab.id, !isPinned)}
        >
          {isPinned ? "取消置顶" : "置顶"}
        </ContextMenuItem>
        <ContextMenuItem
          icon={X}
          onClick={() => {
            if (workspaceTabs.length > 1 && !isPinned) {
              closeTab(tab.id);
            }
          }}
          disabled={workspaceTabs.length <= 1 || isPinned}
        >
          关闭
          <ContextMenuShortcut>⌘W</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          icon={CircleX}
          onClick={() => {
            const tabsToClose = workspaceTabs.filter(
              (t) => t.id !== tab.id && !t.isPin
            );
            tabsToClose.forEach((t) => closeTab(t.id));
          }}
          disabled={workspaceTabs.filter((t) => !t.isPin).length <= 1}
        >
          关闭其他
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
