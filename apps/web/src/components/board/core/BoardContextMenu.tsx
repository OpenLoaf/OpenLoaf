/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import {
  ArrowDown,
  ArrowUp,
  Clipboard,
  Copy,
  Download,
  Film,
  FileText,
  ImagePlus,
  LayoutGrid,
  Lock,
  Maximize2,
  Minimize2,
  RotateCw,
  Scan,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import type { ReactElement, MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import type { CanvasNodeElement } from "../engine/types";

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
  /** Insert text node handler. */
  onInsertText?: () => void;
  /** Insert file handler. */
  onInsertFile?: () => void;
  /** Insert AI image generate node handler. */
  onInsertImageGenerate?: () => void;
  /** Insert AI video generate node handler. */
  onInsertVideoGenerate?: () => void;
  /** Whether insert actions are disabled (e.g. locked). */
  insertDisabled?: boolean;
  /** Context menu trigger handler. */
  onContextMenu?: (event: ReactMouseEvent) => void;
  /** 右键点击到的节点（null 表示空白区域） */
  contextNode?: CanvasNodeElement | null;
  /** 节点操作回调 */
  onNodeDelete?: (nodeId: string) => void;
  onNodeLock?: (nodeId: string, locked: boolean) => void;
  onNodeBringToFront?: (nodeId: string) => void;
  onNodeSendToBack?: (nodeId: string) => void;
  onNodeDuplicate?: (nodeId: string) => void;
  /** Save as handler for image/video nodes. */
  onNodeSaveAs?: (nodeId: string) => void;
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
  onInsertText,
  onInsertFile,
  onInsertImageGenerate,
  onInsertVideoGenerate,
  insertDisabled = false,
  isFullscreen,
  onContextMenu,
  contextNode,
  onNodeDelete,
  onNodeLock,
  onNodeBringToFront,
  onNodeSendToBack,
  onNodeDuplicate,
  onNodeSaveAs,
}: BoardContextMenuProps) {
  const { t } = useTranslation('board');
  const isNodeMenu = Boolean(contextNode);
  const isLocked = contextNode?.locked === true;
  const isSaveableNode = contextNode?.type === "image" || contextNode?.type === "video";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={triggerDisabled} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {isNodeMenu && contextNode ? (
          <>
            {/* 节点右键菜单 */}
            <ContextMenuItem
              icon={Copy}
              onSelect={() => onNodeDuplicate?.(contextNode.id)}
            >
              {t('contextMenu.duplicate')}
            </ContextMenuItem>
            {isSaveableNode ? (
              <ContextMenuItem
                icon={Download}
                onSelect={() => onNodeSaveAs?.(contextNode.id)}
              >
                {t('contextMenu.saveAs')}
              </ContextMenuItem>
            ) : null}
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={ArrowUp}
              onSelect={() => onNodeBringToFront?.(contextNode.id)}
            >
              {t('contextMenu.bringToFront')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={ArrowDown}
              onSelect={() => onNodeSendToBack?.(contextNode.id)}
            >
              {t('contextMenu.sendToBack')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={isLocked ? Unlock : Lock}
              onSelect={() => onNodeLock?.(contextNode.id, !isLocked)}
            >
              {isLocked ? t('contextMenu.unlock') : t('contextMenu.lock')}
            </ContextMenuItem>
            {!isLocked ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  icon={Trash2}
                  onSelect={() => onNodeDelete?.(contextNode.id)}
                  className="text-destructive"
                >
                  {t('contextMenu.delete')}
                </ContextMenuItem>
              </>
            ) : null}
          </>
        ) : (
          <>
            {/* 空白区域右键菜单 */}
            <ContextMenuItem
              icon={Type}
              disabled={insertDisabled}
              onSelect={() => {
                if (insertDisabled) return;
                onInsertText?.();
              }}
            >
              {t('contextMenu.insertText')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={FileText}
              disabled={insertDisabled}
              onSelect={() => {
                if (insertDisabled) return;
                onInsertFile?.();
              }}
            >
              {t('contextMenu.insertFile')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={ImagePlus}
              disabled={insertDisabled}
              onSelect={() => {
                if (insertDisabled) return;
                onInsertImageGenerate?.();
              }}
            >
              {t('contextMenu.aiImageGenerate')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={Film}
              disabled={insertDisabled}
              onSelect={() => {
                if (insertDisabled) return;
                onInsertVideoGenerate?.();
              }}
            >
              {t('contextMenu.aiVideoGenerate')}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              icon={Clipboard}
              disabled={pasteDisabled || !pasteAvailable}
              onSelect={() => {
                if (pasteDisabled || !pasteAvailable) return;
                onPaste();
              }}
            >
              {t('contextMenu.paste')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={isFullscreen ? Minimize2 : Maximize2}
              onSelect={() => {
                onToggleFullscreen();
              }}
            >
              {isFullscreen ? t('contextMenu.exitFullscreen') : t('contextMenu.enterFullscreen')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={Scan}
              onSelect={() => {
                onFitView();
              }}
            >
              {t('contextMenu.maximize')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={LayoutGrid}
              onSelect={() => {
                onAutoLayout();
              }}
            >
              {t('contextMenu.autoLayout')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={RotateCw}
              onSelect={() => {
                onRefresh();
              }}
            >
              {t('contextMenu.reload')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
