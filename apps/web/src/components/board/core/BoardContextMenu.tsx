"use client";

import { LayoutGrid, RotateCw, Clipboard, Maximize2, Minimize2, Scan } from "lucide-react";
import type { ReactElement, MouseEvent as ReactMouseEvent } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";

export type BoardContextMenuProps = {
  /** Trigger element for the context menu. */
  children: ReactElement;
  /** Whether the trigger is disabled. */
  triggerDisabled?: boolean;
  /** Auto layout handler. */
  onAutoLayout: () => void;
  /** Fullscreen toggle handler. */
  onToggleFullscreen: () => void;
  /** Whether the board is in fullscreen mode. */
  isFullscreen: boolean;
  /** Fit view handler. */
  onFitView: () => void;
  /** Refresh handler. */
  onRefresh: () => void;
  /** Paste handler. */
  onPaste: () => void;
  /** Whether paste action is available. */
  pasteAvailable: boolean;
  /** Whether paste action is disabled. */
  pasteDisabled?: boolean;
  /** Context menu trigger handler. */
  onContextMenu?: (event: ReactMouseEvent) => void;
};

/** Render the board context menu. */
export function BoardContextMenu({
  children,
  triggerDisabled = false,
  onAutoLayout,
  onToggleFullscreen,
  onFitView,
  onRefresh,
  onPaste,
  pasteAvailable,
  pasteDisabled = false,
  isFullscreen,
  onContextMenu,
}: BoardContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={triggerDisabled} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          icon={isFullscreen ? Minimize2 : Maximize2}
          onSelect={() => {
            // 逻辑：右键菜单内切换左右面板，进入/退出全屏。
            onToggleFullscreen();
          }}
        >
          {isFullscreen ? "退出全屏" : "全屏显示"}
        </ContextMenuItem>
        <ContextMenuItem
          icon={Scan}
          onSelect={() => {
            // 逻辑：右键菜单内最大化视图，仅调整画布视野。
            onFitView();
          }}
        >
          最大化视图
        </ContextMenuItem>
        <ContextMenuItem
          icon={LayoutGrid}
          onSelect={() => {
            // 逻辑：右键菜单内自动布局，保持与工具栏行为一致。
            onAutoLayout();
          }}
        >
          自动布局
        </ContextMenuItem>
        <ContextMenuItem
          icon={RotateCw}
          onSelect={() => {
            // 逻辑：右键菜单内刷新视图，避免残留选区显示异常。
            onRefresh();
          }}
        >
          重新加载
        </ContextMenuItem>
        <ContextMenuItem
          icon={Clipboard}
          disabled={pasteDisabled || !pasteAvailable}
          onSelect={() => {
            // 逻辑：优先走 ContextMenu 选择，避免被画布捕获 click。
            if (pasteDisabled || !pasteAvailable) return;
            onPaste();
          }}
        >
          粘贴
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
