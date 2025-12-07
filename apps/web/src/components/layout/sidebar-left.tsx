"use client";

import PageTreeComponent from "@/components/page/tree";

export default function SidebarLeft() {
  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto custom-scroll">
        <PageTreeComponent />
      </div>
      <div className="flex flex-col gap-2 p-2 border-t border-sidebar-border">
        <div className="p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          User info placeholder
        </div>
      </div>
    </div>
  );
}
