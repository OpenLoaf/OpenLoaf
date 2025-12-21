"use client";

import * as React from "react";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MockWebContentsView = {
  id: number;
  title: string;
  url: string;
};

const MOCK_WEB_CONTENTS_VIEWS: MockWebContentsView[] = [
  { id: 1, title: "Home", url: "https://teatime.local/" },
  { id: 2, title: "Workspace", url: "https://teatime.local/workspace" },
  { id: 3, title: "Settings", url: "https://teatime.local/settings" },
];

/** Renders a tab-like trigger that previews mock WebContentsView entries. */
export const WebContentsViewButton = () => {
  const [open, setOpen] = React.useState(false);
  const viewCount = MOCK_WEB_CONTENTS_VIEWS.length;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          data-no-drag="true"
          role="tab"
          aria-selected={open}
          variant="ghost"
          className={cn(
            "h-7 rounded-md px-3 text-xs font-medium cursor-default",
            "text-muted-foreground bg-transparent hover:bg-sidebar-accent hover:text-foreground",
            "aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-none",
            "data-[state=open]:bg-background data-[state=open]:text-foreground",
          )}
          aria-label="WebContentsView list"
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums">{viewCount}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-no-drag="true"
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 rounded-xl p-2"
      >
        <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
          WebContentsViews（模拟）
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-2" />
        <div className="space-y-1">
          {/* 先做 UI 设计：这里暂不接入 Electron WebContentsView 的真实数据与切换逻辑 */}
          {MOCK_WEB_CONTENTS_VIEWS.map((view) => (
            <DropdownMenuItem
              key={view.id}
              className="rounded-lg"
              onSelect={(event) => {
                // 先做 UI 设计：暂不切换/激活
                event.preventDefault();
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium leading-5">
                  {view.title}
                </div>
                <div className="truncate text-xs text-muted-foreground leading-4">
                  {view.url}
                </div>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                #{view.id}
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
