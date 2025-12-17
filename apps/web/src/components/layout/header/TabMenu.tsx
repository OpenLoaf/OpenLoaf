import { X, Bot } from "lucide-react";
import { TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import type { Tab } from "@teatime-ai/api/common";

interface TabMenuProps {
  tab: Tab;
  activeTabId: string | null;
  activeTabRef: React.RefObject<HTMLButtonElement | null>;
  closeTab: (tabId: string) => void;
  workspaceTabs: Tab[];
  onReorderPointerDown?: (
    event: React.PointerEvent<HTMLButtonElement>,
    tabId: string
  ) => void;
  isDragging?: boolean;
  isPinned?: boolean;
  onTogglePin?: (tabId: string, pin: boolean) => void;
}

export const TabMenu = ({
  tab,
  activeTabId,
  activeTabRef,
  closeTab,
  workspaceTabs,
  onReorderPointerDown,
  isDragging = false,
  isPinned = false,
  onTogglePin,
}: TabMenuProps) => {
  const isActive = tab.id === activeTabId;
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
          new CustomEvent("teatime:overlay", {
            detail: { id: `tabmenu:${tab.id}`, open },
          })
        );
      }}
    >
      <ContextMenuTrigger
        asChild
        className="relative inline-flex items-center group"
      >
        <TabsTrigger
          ref={tab.id === activeTabId ? activeTabRef : null}
          value={tab.id}
          data-no-drag="true"
          data-tab-id={tab.id}
          data-pinned={isPinned ? "true" : "false"}
          data-reordering={isDragging ? "true" : "false"}
          onPointerDown={(event) => onReorderPointerDown?.(event, tab.id)}
          className={`h-7 pl-2 pr-7 text-xs gap-0 rounded-md text-muted-foreground bg-transparent aria-selected:bg-background aria-selected:text-foreground aria-selected:border-transparent aria-selected:shadow-none relative z-10 flex items-center max-w-[180px] flex-none w-auto shrink-0 cursor-default active:cursor-grabbing data-[reordering=true]:cursor-grabbing`}
        >
          {tab.icon === "bot" ? (
            <Bot className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
          ) : (
            tab.icon && <span className="mr-1.5 shrink-0">{tab.icon}</span>
          )}
          <span className="min-w-0 flex-1 truncate">{tab.title || "Untitled"}</span>
          {!isPinned && (
            <span
              className={`absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 transition-opacity delay-0 group-hover:delay-300 ${
                workspaceTabs.length <= 1
                  ? "opacity-0"
                  : "opacity-0 group-hover:opacity-100"
              } ${
                isActive
                  ? "group-hover:bg-background hover:bg-background"
                  : "group-hover:bg-sidebar hover:bg-sidebar"
              } z-20 p-0 cursor-pointer flex items-center justify-center rounded-full`}
              onClick={(e) => {
                e.stopPropagation();
                if (workspaceTabs.length > 1) {
                  closeTab(tab.id);
                }
              }}
              aria-label="Close tab"
              role="button"
              style={{
                pointerEvents: workspaceTabs.length <= 1 ? "none" : "auto",
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </TabsTrigger>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => onTogglePin?.(tab.id, !isPinned)}>
          {isPinned ? "Unpin" : "Pin"}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (workspaceTabs.length > 1 && !isPinned) {
              closeTab(tab.id);
            }
          }}
          disabled={workspaceTabs.length <= 1 || isPinned}
        >
          Close
          <ContextMenuShortcut>⌘W</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const tabsToClose = workspaceTabs.filter(
              (t) => t.id !== tab.id && !t.isPin
            );
            tabsToClose.forEach((t) => closeTab(t.id));
          }}
          disabled={workspaceTabs.filter((t) => !t.isPin).length <= 1}
        >
          Close Others
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (workspaceTabs.length > 1) {
              workspaceTabs.forEach((t) => {
                if (!t.isPin) closeTab(t.id);
              });
            }
          }}
          disabled={workspaceTabs.filter((t) => !t.isPin).length === 0}
        >
          Close All
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
