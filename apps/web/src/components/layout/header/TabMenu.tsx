import { X } from "lucide-react";
import { TabsTrigger } from "@/components/ui/tabs";
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
}: TabMenuProps) => {
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
          aria-grabbed={isDragging}
          className="h-7 px-1.5 text-xs rounded-md text-muted-foreground bg-transparent aria-selected:bg-background aria-selected:text-foreground aria-selected:border-transparent aria-selected:shadow-none pr-2 relative z-10 min-w-[130px] max-w-[130px] flex items-center justify-between"
        >
          <span className="truncate flex-1">{tab.title || "Untitled"}</span>
          <span
            className={`ml-auto h-6 w-6 transition-opacity ${workspaceTabs.length <= 1 ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'} relative z-10 p-0 cursor-pointer flex items-center justify-center rounded-full hover:bg-background`}
            onClick={(e) => {
              e.stopPropagation();
              if (workspaceTabs.length > 1) {
                closeTab(tab.id);
              }
            }}
            aria-label="Close tab"
            role="button"
            style={{ pointerEvents: workspaceTabs.length <= 1 ? 'none' : 'auto' }}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </TabsTrigger>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem 
          onClick={() => {
            if (workspaceTabs.length > 1) {
              closeTab(tab.id);
            }
          }}
          disabled={workspaceTabs.length <= 1}
        >
          Close
          <ContextMenuShortcut>⌘W</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const tabsToClose = workspaceTabs.filter((t) => t.id !== tab.id);
            tabsToClose.forEach((t) => closeTab(t.id));
          }}
          disabled={workspaceTabs.length <= 1}
        >
          Close Others
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (workspaceTabs.length > 1) {
              workspaceTabs.forEach((t) => closeTab(t.id));
            }
          }}
          disabled={workspaceTabs.length <= 1}
        >
          Close All
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
