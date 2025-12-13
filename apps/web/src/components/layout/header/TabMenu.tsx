import { X, Bot } from "lucide-react";
import { TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import type { Tab } from "@/hooks/use_tabs";
import type { DragEvent } from "react";

interface TabMenuProps {
  tab: Tab;
  activeTabId: string | null;
  activeTabRef: React.RefObject<HTMLButtonElement | null>;
  closeTab: (tabId: string) => void;
  workspaceTabs: Tab[];
  onDragStart?: (tabId: string) => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>, tabId: string) => void;
  onDrop?: (tabId: string) => void;
  onDragEnd?: () => void;
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
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false,
  isPinned = false,
  onTogglePin,
}: TabMenuProps) => {
  const isActive = tab.id === activeTabId;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        className="relative inline-flex items-center group"
      >
        <TabsTrigger
          ref={tab.id === activeTabId ? activeTabRef : null}
          value={tab.id}
          draggable
          data-no-drag="true"
          data-pinned={isPinned ? "true" : "false"}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            onDragStart?.(tab.id);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            onDragOver?.(event, tab.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDrop?.(tab.id);
          }}
          onDragEnd={onDragEnd}
          className={`h-7 pl-1.5 pr-3.5 text-xs gap-0 rounded-md text-muted-foreground bg-transparent aria-selected:bg-background aria-selected:text-foreground aria-selected:border-transparent aria-selected:shadow-none relative z-10 flex items-center max-w-[200px]`}
        >
          {tab.icon === "bot" ? (
            <Bot className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
          ) : (
            tab.icon && <span className="mr-1.5 shrink-0">{tab.icon}</span>
          )}
          <span className="truncate w-full">{tab.title || "Untitled"}</span>
          {!isPinned && (
            <span
              className={`absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 transition-opacity ${
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
