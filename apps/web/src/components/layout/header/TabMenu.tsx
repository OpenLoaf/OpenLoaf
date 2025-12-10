import { X } from "lucide-react";
import { TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";

interface Tab {
  id: string;
  title: string;
  rightPanel: {
    component: string;
    params: Record<string, any>;
  };
  workspaceId: string;
  createNew: boolean;
}

interface TabMenuProps {
  tab: Tab;
  activeTabId: string;
  activeTabRef: React.RefObject<HTMLButtonElement>;
  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  workspaceTabs: Tab[];
}

export const TabMenu = ({ 
  tab, 
  activeTabId, 
  activeTabRef, 
  closeTab, 
  workspaceTabs 
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
          className="h-7 px-1.5 text-xs rounded-md text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none pr-2 relative z-10 min-w-[130px] max-w-[130px] flex items-center justify-between"
        >
          <span className="truncate flex-1">
            {tab.title || "Untitled"}
          </span>
          <span
            className="ml-auto h-6 w-6 transition-opacity opacity-0 group-hover:opacity-100 relative z-10 p-0 cursor-pointer flex items-center justify-center rounded-full hover:bg-background"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            aria-label="Close tab"
            role="button"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </TabsTrigger>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => closeTab(tab.id)}>
          Close
          <ContextMenuShortcut>⌘W</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const tabsToClose = workspaceTabs.filter(
              (t) => t.id !== tab.id
            );
            tabsToClose.forEach((t) => closeTab(t.id));
          }}
          disabled={workspaceTabs.length <= 1}
        >
          Close Others
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            workspaceTabs.forEach((t) => closeTab(t.id));
          }}
        >
          Close All
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};