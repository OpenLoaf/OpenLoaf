"use client";

import { LayoutGrid, RotateCw, Clipboard, Maximize2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";

export type BoardContextMenuProps = {
  /** Screen position for the menu. */
  point: { x: number; y: number };
  /** Close handler. */
  onClose: () => void;
  /** Auto layout handler. */
  onAutoLayout: () => void;
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
};

/** Render the board context menu. */
export function BoardContextMenu({
  point,
  onClose,
  onAutoLayout,
  onFitView,
  onRefresh,
  onPaste,
  pasteAvailable,
  pasteDisabled = false,
}: BoardContextMenuProps) {
  return (
    <ContextMenu open onOpenChange={(open) => (open ? undefined : onClose())}>
      <ContextMenuTrigger asChild>
        <span
          data-board-context-menu
          className="fixed z-50 h-1 w-1"
          style={{ left: point.x, top: point.y }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          icon={Maximize2}
          onSelect={() => {
            // 逻辑：右键菜单内触发全屏适配视图。
            onFitView();
            onClose();
          }}
        >
          全屏
        </ContextMenuItem>
        <ContextMenuItem
          icon={LayoutGrid}
          onSelect={() => {
            // 逻辑：右键菜单内自动布局，保持与工具栏行为一致。
            onAutoLayout();
            onClose();
          }}
        >
          自动布局
        </ContextMenuItem>
        <ContextMenuItem
          icon={RotateCw}
          onSelect={() => {
            // 逻辑：右键菜单内刷新视图，避免残留选区显示异常。
            onRefresh();
            onClose();
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
            onClose();
          }}
        >
          粘贴
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
