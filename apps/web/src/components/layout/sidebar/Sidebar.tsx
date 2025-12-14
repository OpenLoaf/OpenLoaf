"use client";

import { SidebarPage } from "@/components/layout/sidebar/Page";
import { SidebarWorkspace } from "../../workspace/SidebarWorkspace";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/animate-ui/components/radix/sidebar";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use_tabs";
import {
  makePanelSnapshotKey,
  usePanelSnapshots,
} from "@/hooks/use_panel_snapshots";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { activeTabId, activeLeftPanel, activeLeftWidth } = useTabs();
  const pushSnapshot = usePanelSnapshots((state) => state.pushSnapshot);
  const closeTopSnapshot = usePanelSnapshots((state) => state.closeTopSnapshot);
  const setHiddenAll = usePanelSnapshots((state) => state.setHiddenAll);

  const leftSnapshotKey = activeTabId
    ? makePanelSnapshotKey(activeTabId, "left")
    : null;
  const leftSnapshotState = usePanelSnapshots((state) =>
    leftSnapshotKey ? state.byKey[leftSnapshotKey] : undefined
  );
  const leftSnapshotCount = leftSnapshotState?.layers.length ?? 0;
  const leftHiddenAll = leftSnapshotState?.hiddenAll ?? false;
  const activePageId = (activeLeftPanel?.params as any)?.pageId as
    | string
    | undefined;

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <SidebarHeader>
        <SidebarWorkspace />
      </SidebarHeader>
      <SidebarContent>
        <div className="px-2 py-2 space-y-2">
          <div className="text-xs text-muted-foreground">
            Snapshots (left): {leftSnapshotCount}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!leftSnapshotKey) return;
              pushSnapshot(leftSnapshotKey, {
                component: "ai-chat",
                params: {},
                leftWidth: activeLeftWidth,
              });
            }}
          >
            Snapshot: AI Chat
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!leftSnapshotKey) return;
              pushSnapshot(leftSnapshotKey, {
                component: "plant-page",
                params: activePageId ? { pageId: activePageId } : {},
                leftWidth: activeLeftWidth,
              });
            }}
          >
            Snapshot: Plant
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!leftSnapshotKey || leftSnapshotCount === 0}
              onClick={() => {
                if (!leftSnapshotKey) return;
                closeTopSnapshot(leftSnapshotKey);
              }}
            >
              Close Top
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!leftSnapshotKey || leftSnapshotCount === 0}
              onClick={() => {
                if (!leftSnapshotKey) return;
                setHiddenAll(leftSnapshotKey, !leftHiddenAll);
              }}
            >
              {leftHiddenAll ? "Show" : "Hide"} All
            </Button>
          </div>
        </div>
        <SidebarPage />
      </SidebarContent>
    </Sidebar>
  );
};
