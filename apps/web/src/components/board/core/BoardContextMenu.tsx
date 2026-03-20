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
  FileText,
  ImagePlus,
  Info,
  LayoutGrid,
  Lock,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Scan,
  Trash2,
  Type,
  Unlock,
  Video,
  ZoomIn,
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
  /** Derive a new node (image/video generation) from source node. */
  onNodeDeriveVideo?: (nodeId: string) => void;
  onNodeDeriveImage?: (nodeId: string) => void;
  /** HD upscale for image nodes. */
  onNodeUpscale?: (nodeId: string) => void;
  /** Download original file for image/video nodes. */
  onNodeDownload?: (nodeId: string) => void;
  /** Open fullscreen preview for image nodes. */
  onNodePreview?: (nodeId: string) => void;
  /** Open video playback for video nodes. */
  onNodePlay?: (nodeId: string) => void;
  /** Open the node inspector panel. */
  onNodeInspect?: (nodeId: string) => void;
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
  onNodeDeriveVideo,
  onNodeDeriveImage,
  onNodeUpscale,
  onNodeDownload,
  onNodePreview,
  onNodePlay,
  onNodeInspect,
}: BoardContextMenuProps) {
  const { t } = useTranslation('board');
  const isNodeMenu = Boolean(contextNode);
  const isLocked = contextNode?.locked === true;
  const nodeType = contextNode?.type;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={triggerDisabled} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {isNodeMenu && contextNode ? (
          <>
            {/* ── 图片节点专属菜单 ── */}
            {nodeType === 'image' ? (
              <>
                <ContextMenuItem
                  icon={Video}
                  onSelect={() => onNodeDeriveVideo?.(contextNode.id)}
                >
                  {t('contextMenu.generateVideo')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={ZoomIn}
                  onSelect={() => onNodeUpscale?.(contextNode.id)}
                >
                  {t('contextMenu.upscale')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  icon={Copy}
                  onSelect={() => onNodeDuplicate?.(contextNode.id)}
                >
                  {t('contextMenu.duplicate')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={Download}
                  onSelect={() => onNodeDownload?.(contextNode.id)}
                >
                  {t('contextMenu.download')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={Maximize2}
                  onSelect={() => onNodePreview?.(contextNode.id)}
                >
                  {t('contextMenu.preview')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  icon={Info}
                  onSelect={() => onNodeInspect?.(contextNode.id)}
                >
                  {t('contextMenu.inspect')}
                </ContextMenuItem>
              </>
            ) : null}

            {/* ── 视频节点专属菜单 ── */}
            {nodeType === 'video' ? (
              <>
                <ContextMenuItem
                  icon={Play}
                  onSelect={() => onNodePlay?.(contextNode.id)}
                >
                  {t('contextMenu.play')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={Download}
                  onSelect={() => onNodeDownload?.(contextNode.id)}
                >
                  {t('contextMenu.download')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  icon={Copy}
                  onSelect={() => onNodeDuplicate?.(contextNode.id)}
                >
                  {t('contextMenu.duplicate')}
                </ContextMenuItem>
              </>
            ) : null}

            {/* ── 文本节点专属菜单 ── */}
            {nodeType === 'text' ? (
              <>
                <ContextMenuItem
                  icon={ImagePlus}
                  onSelect={() => onNodeDeriveImage?.(contextNode.id)}
                >
                  {t('contextMenu.generateImage')}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={Video}
                  onSelect={() => onNodeDeriveVideo?.(contextNode.id)}
                >
                  {t('contextMenu.generateVideo')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  icon={Copy}
                  onSelect={() => onNodeDuplicate?.(contextNode.id)}
                >
                  {t('contextMenu.duplicate')}
                </ContextMenuItem>
              </>
            ) : null}

            {/* ── 通用节点菜单（非 image/video/text 类型） ── */}
            {nodeType !== 'image' && nodeType !== 'video' && nodeType !== 'text' ? (
              <>
                <ContextMenuItem
                  icon={Copy}
                  onSelect={() => onNodeDuplicate?.(contextNode.id)}
                >
                  {t('contextMenu.duplicate')}
                </ContextMenuItem>
              </>
            ) : null}

            {/* ── 所有节点通用底部菜单 ── */}
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
            <ContextMenuSeparator />

            <ContextMenuItem
              icon={Clipboard}
              disabled={pasteDisabled}
              onSelect={() => {
                if (pasteDisabled) return;
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
