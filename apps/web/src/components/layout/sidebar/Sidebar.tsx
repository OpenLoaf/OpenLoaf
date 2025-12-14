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
import { Globe } from "lucide-react";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { activeLeftPanel, addPanelDialog } = useTabs();

  const isElectron =
    process.env.NEXT_PUBLIC_ELECTRON === "1" ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron"));

  const dialogsCount = activeLeftPanel?.dialogs?.length ?? 0;
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
            Dialogs (left): {dialogsCount}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addPanelDialog("left", {
                component: "ai-chat",
                params: {},
              });
            }}
          >
            Dialog: AI Chat
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addPanelDialog("left", {
                component: "plant-page",
                params: activePageId ? { pageId: activePageId } : {},
              });
            }}
          >
            Dialog: Plant
          </Button>
          {isElectron && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                addPanelDialog("left", {
                  component: "electron-browser",
                  params: { url: "https://example.com" },
                });
              }}
            >
              <Globe className="mr-2 h-4 w-4" />
              Dialog: Browser
            </Button>
          )}
        </div>
        <SidebarPage />
      </SidebarContent>
    </Sidebar>
  );
};
