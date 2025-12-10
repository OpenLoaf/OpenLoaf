"use client";

import { SidebarPage } from "@/components/layout/sidebar/Page";
import { SidebarWorkspace } from "./Workspace";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <SidebarHeader>
        <SidebarWorkspace />
      </SidebarHeader>
      <SidebarContent>
        <SidebarPage />
      </SidebarContent>
    </Sidebar>
  );
};
