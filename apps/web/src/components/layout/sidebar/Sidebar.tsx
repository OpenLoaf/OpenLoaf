"use client";

import { SidebarPage } from "@/components/layout/sidebar/Page";
import { SidebarWorkspace } from "../../workspace/SidebarWorkspace";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/animate-ui/components/radix/sidebar";

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
