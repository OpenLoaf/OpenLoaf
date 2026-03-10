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

import { Component, useCallback, useEffect, useMemo, useRef, useState, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, CopyPlus, FolderDown, Loader2, MoreHorizontal, PencilLine, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Input } from "@openloaf/ui/input";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import { useTabs } from "@/hooks/use-tabs";
import { BoardProvider, type ImagePreviewPayload } from "./BoardProvider";
import { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasElement, CanvasNodeDefinition } from "../engine/types";
import { BoardCanvasInteraction } from "./BoardCanvasInteraction";
import { BoardCanvasCollab } from "./BoardCanvasCollab";
import { BoardCanvasRender } from "./BoardCanvasRender";
import { useBoardSnapshot } from "./useBoardSnapshot";
import { blobToBase64 } from "../utils/base64";
import {
  captureBoardImageBlob,
  setBoardExporting,
  waitForAnimationFrames,
} from "../utils/board-export";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  closeFilePreview,
  openFilePreview,
  useFilePreviewStore,
} from "@/components/file/lib/file-preview-store";
import {
  buildChildUri,
  buildFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_INDEX_FILE_NAME } from "@/lib/file-name";
import { trpc, trpcClient } from "@/utils/trpc";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { getCachedAccessToken } from "@/lib/saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import i18next from "i18next";

export type BoardCanvasProps = {
  /** External engine instance, optional for integration scenarios. */
  engine?: CanvasEngine;
  /** Node definitions to register on first mount. */
  nodes?: CanvasNodeDefinition<any>[];
  /** Initial elements inserted once when mounted. */
  initialElements?: CanvasElement[];
  /** Workspace id for storage isolation. */
  workspaceId?: string;
  /** Project id used for file resolution. */
  projectId?: string;
  /** Project root uri for attachment resolution. */
  rootUri?: string;
  /** Optional board identifier used for storage scoping. */
  boardId?: string;
  /** Board folder uri for attachment storage. */
  boardFolderUri?: string;
  /** Board file URI used for file persistence. */
  boardFileUri?: string;
  /** Tab id for panel refresh behavior. */
  tabId?: string;
  /** Panel key for identifying board instances. */
  panelKey?: string;
  /** Hide interactive overlays when the panel is minimized. */
  uiHidden?: boolean;
  /** Optional container class name. */
  className?: string;
};

/** Error boundary for the board canvas tree. */
class BoardErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[board] render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center p-8 text-sm text-muted-foreground">
          <div className="max-w-md text-center">
            <p className="mb-2 font-medium">{i18next.t('board:board.renderError')}</p>
            <p className="mb-4 text-xs opacity-70">{this.state.error.message}</p>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
              onClick={() => this.setState({ error: null })}
            >
              {i18next.t('board:board.retry')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Board thumbnail file name. */
const BOARD_THUMBNAIL_FILE_NAME = "index.png";
/** Board thumbnail width in pixels. */
const BOARD_THUMBNAIL_WIDTH = 320;
/** Board thumbnail height in pixels. */
const BOARD_THUMBNAIL_HEIGHT = 200;
/** Delay before capturing auto layout thumbnail. */
const AUTO_LAYOUT_THUMBNAIL_DELAY = 30_000;

/** Render a fixed-size thumbnail blob from a source image blob. */
async function renderBoardThumbnailBlob(
  source: Blob,
  width: number,
  height: number
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const url = URL.createObjectURL(source);
  const image = new Image();
  const loadImage = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("thumbnail image load failed"));
  });
  image.decoding = "async";
  image.src = url;
  try {
    await loadImage;
  } finally {
    URL.revokeObjectURL(url);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  // 逻辑：用 cover 缩放填满画布，避免出现黑边。
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/** Render the new board canvas surface and DOM layers. */
export function BoardCanvas({
  engine: externalEngine,
  nodes,
  initialElements,
  workspaceId,
  projectId,
  rootUri,
  boardId,
  boardFolderUri,
  boardFileUri,
  tabId,
  panelKey,
  uiHidden,
  className,
}: BoardCanvasProps) {
  const { workspace } = useWorkspace();
  const resolvedWorkspaceId = workspaceId ?? workspace?.id ?? "";
  const queryClient = useQueryClient();
  // 逻辑：提取画布文件夹名（末段路径），服务端通过 .openloaf/boards/<boardId>/ 前缀还原完整路径。
  // decodeURIComponent 防止 URI 中已编码的中文被 URLSearchParams 双重编码。
  const resolvedBoardId = useMemo(() => {
    const source = boardFolderUri?.trim() || boardId?.trim() || "";
    if (!source) return "";
    const cleaned = source.replace(/\/+$/, "");
    const segment = cleaned.split("/").pop() || "";
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }, [boardFolderUri, boardId]);
  /** Root container element for canvas interactions. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Latest canvas element reference used for exports. */
  const exportTargetRef = useRef<HTMLElement | null>(null);
  /** Engine instance used for rendering and interaction. */
  const engineRef = useRef<CanvasEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = externalEngine ?? new CanvasEngine();
  }
  const engine = externalEngine ?? engineRef.current;
  /** Current board element count (kept in sync for thumbnail guard). */
  const elementCountRef = useRef(0);
  /** Latest snapshot from the engine. */
  const snapshot = useBoardSnapshot(engine);
  elementCountRef.current = snapshot.elements.length;
  const showUi = !uiHidden;
  /** Basic settings for UI toggles. */
  const { basic } = useBasicConfig();
  /** Whether the performance overlay is visible. */
  const showPerfOverlay = Boolean(basic.boardDebugEnabled);
  /** Guard for first-time node registration. */
  const nodesRegisteredRef = useRef(false);
  /** Preview source id for board modal coordination. */
  const previewSourceId = useId();
  const activePreviewSourceId = useFilePreviewStore((state) => state.payload?.sourceId);
  /** Sync callback provided by collaboration layer. */
  const [syncLogState, setSyncLogState] = useState<{
    canSyncLog: boolean;
    onSyncLog?: () => void;
  }>({ canSyncLog: false });
  /** Header action buttons state. */
  const { t: tBoard } = useTranslation('board');
  const headerActionsTarget = useHeaderSlot((s) => s.headerActionsTarget);
  const globalActiveTabId = useTabs((s) => s.activeTabId);
  const setTabTitle = useTabs((s) => s.setTabTitle);
  const currentTabTitle = useTabs((s) => {
    if (!tabId) return '';
    return s.tabs.find((t) => t.id === tabId)?.title ?? '';
  });
  const isActiveTab = !tabId || globalActiveTabId === tabId;
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [aiNaming, setAiNaming] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { loggedIn: saasLoggedIn } = useSaasAuth();
  const [saveToProjectOpen, setSaveToProjectOpen] = useState(false);
  const closeTab = useTabs((s) => s.closeTab);
  const addTab = useTabs((s) => s.addTab);
  const inferBoardNameMutation = useMutation(trpc.settings.inferBoardName.mutationOptions());
  const deleteBoardMutation = useMutation(trpc.fs.delete.mutationOptions());
  const duplicateBoardMutation = useMutation(trpc.board.duplicate.mutationOptions({
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: trpc.board.list.queryKey() });
      toast.success(i18next.t('nav:canvasList.duplicateSuccess'));
      if (!rootUri) return;
      const newBoardFolderUri = buildFileUriFromRoot(rootUri, newBoard.folderUri);
      const newBoardFileUri = buildFileUriFromRoot(rootUri, `${newBoard.folderUri}${BOARD_INDEX_FILE_NAME}`);
      addTab({
        workspaceId: resolvedWorkspaceId,
        createNew: true,
        title: newBoard.title,
        icon: "🎨",
        leftWidthPercent: 100,
        base: {
          id: `board:${newBoardFolderUri}`,
          component: "board-viewer",
          params: {
            boardFolderUri: newBoardFolderUri,
            boardFileUri: newBoardFileUri,
            boardId: newBoard.id,
            projectId,
            rootUri,
          },
        },
      });
    },
  }));
  const handleDuplicateBoard = useCallback(() => {
    if (!resolvedBoardId || !resolvedWorkspaceId || duplicateBoardMutation.isPending) return;
    duplicateBoardMutation.mutate({
      boardId: resolvedBoardId,
      workspaceId: resolvedWorkspaceId,
      ...(projectId ? { projectId } : {}),
    });
  }, [resolvedBoardId, resolvedWorkspaceId, projectId, duplicateBoardMutation]);
  const handleCopyBoardPath = useCallback(() => {
    if (!boardFolderUri) return;
    const fullPath = boardFolderUri.startsWith("file://")
      ? decodeURIComponent(new URL(boardFolderUri).pathname).replace(/\/$/, "")
      : boardFolderUri.replace(/\/$/, "");
    navigator.clipboard.writeText(fullPath);
    toast.success(i18next.t('nav:canvasList.pathCopied'));
  }, [boardFolderUri]);
  const handleRenameOpen = useCallback((open: boolean) => {
    if (open) setRenameValue(currentTabTitle);
    setRenameOpen(open);
  }, [currentTabTitle]);
  const handleRenameConfirm = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && tabId) {
      setTabTitle(tabId, trimmed);
    }
    setRenameOpen(false);
  }, [renameValue, tabId, setTabTitle]);
  const handleAiName = useCallback(async () => {
    if (!boardFolderUri || !resolvedWorkspaceId) return;
    if (!saasLoggedIn) {
      setLoginOpen(true);
      return;
    }
    setAiNaming(true);
    try {
      const result = await inferBoardNameMutation.mutateAsync({
        workspaceId: resolvedWorkspaceId,
        boardFolderUri,
        saasAccessToken: getCachedAccessToken() ?? undefined,
      });
      if (result.title) {
        setRenameValue(result.title);
      } else {
        toast.error(i18next.t('nav:canvasList.aiNameEmpty'));
      }
    } catch {
      toast.error(i18next.t('nav:canvasList.aiNameFailed'));
    } finally {
      setAiNaming(false);
    }
  }, [boardFolderUri, resolvedWorkspaceId, saasLoggedIn, inferBoardNameMutation]);
  const handleDeleteBoard = useCallback(() => {
    if (!boardFolderUri || !resolvedWorkspaceId || !tabId) return;
    if (!confirm(i18next.t('nav:canvasList.confirmDelete'))) return;
    // Derive relative URI from boardFolderUri
    const rootUriBase = workspace?.rootUri ?? '';
    const relativeUri = rootUriBase && boardFolderUri.startsWith(rootUriBase)
      ? boardFolderUri.slice(rootUriBase.length).replace(/^\//, '')
      : boardFolderUri;
    deleteBoardMutation.mutate(
      { workspaceId: resolvedWorkspaceId, uri: relativeUri },
      {
        onSuccess: () => {
          // Close current tab and open a fresh canvas
          closeTab(tabId);
        },
      },
    );
  }, [boardFolderUri, resolvedWorkspaceId, tabId, workspace?.rootUri, deleteBoardMutation, closeTab]);
  // Auto-close login dialog on successful login
  useEffect(() => {
    if (saasLoggedIn && loginOpen) setLoginOpen(false);
  }, [saasLoggedIn, loginOpen]);

  const effectiveTarget = isActiveTab ? headerActionsTarget : null;
  /** Board thumbnail writer mutation. */
  const writeThumbnailMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  /** Latest thumbnail writer callback reference. */
  const writeThumbnailRef = useRef(writeThumbnailMutation.mutateAsync);
  /** Promise queue for sequential thumbnail captures. */
  const thumbnailQueueRef = useRef(Promise.resolve());
  /** Timer id for auto layout thumbnail capture. */
  const autoLayoutTimerRef = useRef<number | null>(null);
  /** Whether the initial thumbnail check has been done. */
  const thumbnailInitDoneRef = useRef(false);
  /** Whether the board has been modified since last thumbnail capture. */
  const boardModifiedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    engine.attach(containerRef.current);
    return () => {
      engine.detach();
    };
  }, [engine]);

  useEffect(() => {
    exportTargetRef.current = containerRef.current;
  }, []);

  useEffect(() => {
    writeThumbnailRef.current = writeThumbnailMutation.mutateAsync;
  }, [writeThumbnailMutation.mutateAsync]);

  if (!nodesRegisteredRef.current && nodes && nodes.length > 0) {
    // 逻辑：在首帧前注册节点定义，避免协作数据先到导致空白渲染。
    engine.registerNodes(nodes);
    nodesRegisteredRef.current = true;
  }

  const openImagePreview = (payload: ImagePreviewPayload) => {
    // 逻辑：画布预览统一走全屏弹窗，避免节点内各自实现。
    const previewUri = payload.originalSrc || payload.previewSrc;
    if (!previewUri) return;
    openFilePreview({
      viewer: "image",
      sourceId: previewSourceId,
      items: [
        {
          uri: previewUri,
          title: payload.fileName || i18next.t('board:board.imagePreview'),
          saveName: payload.fileName,
          mediaType: payload.mimeType,
        },
      ],
      activeIndex: 0,
      showSave: false,
      enableEdit: false,
    });
  };

  const closeImagePreview = () => {
    // 逻辑：仅关闭由画布触发的预览，避免干扰其他弹窗。
    if (activePreviewSourceId !== previewSourceId) return;
    closeFilePreview();
  };

  /** Resolve the current board DOM element for exports. */
  const resolveExportTarget = useCallback(() => {
    if (exportTargetRef.current) return exportTargetRef.current;
    if (!panelKey) return null;
    const selector = `[data-board-canvas][data-board-panel="${panelKey}"]`;
    return document.querySelector(selector) as HTMLElement | null;
  }, [panelKey]);

  /** Capture and persist the current board thumbnail. */
  const saveBoardThumbnail = useCallback(
    (reason: "close" | "autoLayout" | "init") => {
      console.log("[BoardThumbnail] saveBoardThumbnail called", {
        reason,
        boardFolderUri,
        resolvedWorkspaceId,
        elementCount: elementCountRef.current,
      });
      if (!boardFolderUri) return;
      if (!resolvedWorkspaceId) return;
      // 逻辑：空画布不截图，保持默认渐变预览。
      if (elementCountRef.current === 0) {
        console.log("[BoardThumbnail] skipped: elementCount is 0");
        return;
      }
      // 逻辑：顺序执行截图任务，避免并发占用渲染资源。
      thumbnailQueueRef.current = thumbnailQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const target = resolveExportTarget();
          console.log("[BoardThumbnail] queue executing", {
            reason,
            hasTarget: !!target,
            isConnected: target?.isConnected,
          });
          if (!target || !target.isConnected) return;
          // 逻辑：截图前保存当前视口状态，然后适配全部元素以获取完整缩略图。
          const prevState = engine.viewport.getState();
          engine.fitToElements();
          try {
            setBoardExporting(target, true);
            await waitForAnimationFrames(2);
            // 逻辑：动画帧后再检查一次，避免卸载期间截图报错。
            if (!target.isConnected) {
              console.log("[BoardThumbnail] aborted: target disconnected after animation frames");
              return;
            }
            const blob = await captureBoardImageBlob(target);
            console.log("[BoardThumbnail] captured blob", { reason, blobSize: blob?.size });
            if (!blob) return;
            const thumbnailBlob = await renderBoardThumbnailBlob(
              blob,
              BOARD_THUMBNAIL_WIDTH,
              BOARD_THUMBNAIL_HEIGHT
            );
            console.log("[BoardThumbnail] rendered thumbnail", { reason, thumbnailSize: thumbnailBlob?.size });
            if (!thumbnailBlob) return;
            const contentBase64 = await blobToBase64(thumbnailBlob);
            const uri = buildChildUri(boardFolderUri, BOARD_THUMBNAIL_FILE_NAME);
            console.log("[BoardThumbnail] writing thumbnail", { reason, uri, base64Length: contentBase64.length });
            await writeThumbnailRef.current({
              workspaceId: resolvedWorkspaceId,
              projectId,
              uri,
              contentBase64,
            });
            boardModifiedRef.current = false;
            console.log("[BoardThumbnail] thumbnail saved successfully", { reason });
            // 逻辑：截图成功后让画布列表的缩略图缓存失效，返回时能看到最新预览。
            queryClient.invalidateQueries({ queryKey: trpc.board.thumbnails.queryKey() });
          } catch (error) {
            console.error("Board thumbnail capture failed", reason, error);
          } finally {
            setBoardExporting(target, false);
            // 逻辑：非关闭场景下恢复用户原始视口位置，避免截图导致视图跳动。
            if (reason !== "close" && target.isConnected) {
              engine.viewport.setViewport(prevState.zoom, prevState.offset);
            }
          }
        });
    },
    [boardFolderUri, projectId, resolveExportTarget, resolvedWorkspaceId, queryClient, engine]
  );

  /** Schedule a thumbnail capture after auto layout. */
  const scheduleAutoLayoutThumbnail = useCallback(() => {
    if (!boardFolderUri) return;
    if (!resolvedWorkspaceId) return;
    if (autoLayoutTimerRef.current) {
      window.clearTimeout(autoLayoutTimerRef.current);
    }
    // 逻辑：自动布局结束后延迟 30 秒截取缩略图。
    autoLayoutTimerRef.current = window.setTimeout(() => {
      saveBoardThumbnail("autoLayout");
    }, AUTO_LAYOUT_THUMBNAIL_DELAY);
  }, [boardFolderUri, resolvedWorkspaceId, saveBoardThumbnail]);

  /** Track board modifications via engine subscription. */
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      boardModifiedRef.current = true;
    });
    return unsubscribe;
  }, [engine]);

  /** Initial thumbnail capture: when collab syncs, always re-capture to ensure freshness. */
  useEffect(() => {
    console.log("[BoardThumbnail] init effect fired", {
      canSyncLog: syncLogState.canSyncLog,
      initDone: thumbnailInitDoneRef.current,
      boardFolderUri,
      resolvedWorkspaceId,
    });
    if (!syncLogState.canSyncLog) return;
    if (thumbnailInitDoneRef.current) return;
    if (!boardFolderUri || !resolvedWorkspaceId) return;
    thumbnailInitDoneRef.current = true;
    console.log("[BoardThumbnail] calling saveBoardThumbnail('init')");
    // 逻辑：协作同步完成后始终重新截取缩略图，确保预览图反映最新画布内容。
    saveBoardThumbnail("init");
  }, [syncLogState.canSyncLog, boardFolderUri, resolvedWorkspaceId, saveBoardThumbnail]);

  /** On unmount (close/back): capture thumbnail if board was modified. */
  useEffect(() => {
    return () => {
      console.log("[BoardThumbnail] close effect cleanup", {
        boardModified: boardModifiedRef.current,
        boardFolderUri,
        resolvedWorkspaceId,
        elementCount: elementCountRef.current,
      });
      if (autoLayoutTimerRef.current) {
        window.clearTimeout(autoLayoutTimerRef.current);
        autoLayoutTimerRef.current = null;
      }
      if (!boardModifiedRef.current) return;
      if (!boardFolderUri || !resolvedWorkspaceId) return;
      if (elementCountRef.current === 0) return;
      const target = resolveExportTarget();
      console.log("[BoardThumbnail] close: target", { hasTarget: !!target, isConnected: target?.isConnected });
      if (!target || !target.isConnected) return;
      // 逻辑：关闭时直接启动截图，不经过队列也不等待动画帧，
      // html-to-image 会同步克隆 DOM，后续渲染和写盘可异步完成。
      setBoardExporting(target, true);
      captureBoardImageBlob(target)
        .then(async (blob) => {
          setBoardExporting(target, false);
          console.log("[BoardThumbnail] close: captured blob", { blobSize: blob?.size });
          if (!blob) return;
          const thumbnailBlob = await renderBoardThumbnailBlob(
            blob,
            BOARD_THUMBNAIL_WIDTH,
            BOARD_THUMBNAIL_HEIGHT
          );
          if (!thumbnailBlob) return;
          const contentBase64 = await blobToBase64(thumbnailBlob);
          const uri = buildChildUri(boardFolderUri, BOARD_THUMBNAIL_FILE_NAME);
          console.log("[BoardThumbnail] close: writing thumbnail", { uri, base64Length: contentBase64.length });
          await writeThumbnailRef.current({
            workspaceId: resolvedWorkspaceId,
            projectId,
            uri,
            contentBase64,
          });
          console.log("[BoardThumbnail] close: thumbnail saved successfully");
          queryClient.invalidateQueries({ queryKey: trpc.board.thumbnails.queryKey() });
        })
        .catch((err) => {
          console.error("[BoardThumbnail] close: capture failed", err);
        });
    };
  }, [boardFolderUri, projectId, resolvedWorkspaceId, resolveExportTarget, queryClient]);

  // 逻辑：预览优先使用原图地址，缺失时回退到压缩预览。
  return (
    <>
      {effectiveTarget && snapshot.elements.length > 0 && createPortal(
        <div className="flex items-center justify-end">
          <Popover open={renameOpen} onOpenChange={handleRenameOpen}>
            <PopoverTrigger asChild>
              <span className="sr-only" />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder={tBoard('board.renameCanvasPlaceholder')}
                    className="h-8 text-sm flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleRenameConfirm();
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={`h-8 w-8 shrink-0 transition-colors duration-150 ${
                      aiNaming || snapshot.elements.length === 0
                        ? "text-muted-foreground opacity-50"
                        : saasLoggedIn
                          ? "text-amber-500 hover:text-amber-600 hover:border-amber-300 dark:text-amber-400 dark:hover:text-amber-300"
                          : "text-muted-foreground"
                    }`}
                    title={i18next.t('nav:canvasList.aiName')}
                    disabled={aiNaming || snapshot.elements.length === 0}
                    onClick={handleAiName}
                  >
                    {aiNaming ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-full text-xs bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] hover:text-[#1a73e8] dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70 transition-colors duration-150"
                  disabled={!renameValue.trim()}
                  onClick={handleRenameConfirm}
                >
                  {tBoard('board.renameCanvas')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-full px-2.5 text-xs"
              >
                <MoreHorizontal className="size-3.5" />
                {tBoard('board.actions')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleRenameOpen(true)}>
                <PencilLine className="mr-2 size-4" />
                {tBoard('board.renameCanvas')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSaveToProjectOpen(true)}>
                <FolderDown className="mr-2 size-4" />
                {tBoard('board.saveToProject')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicateBoard}>
                <CopyPlus className="mr-2 size-4" />
                {i18next.t('nav:canvasList.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyBoardPath}>
                <Copy className="mr-2 size-4" />
                {i18next.t('nav:canvasList.copyPath')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDeleteBoard}
              >
                <Trash2 className="mr-2 size-4" />
                {tBoard('board.deleteCanvas')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>,
        effectiveTarget
      )}
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <ProjectFileSystemTransferDialog
        open={saveToProjectOpen}
        onOpenChange={setSaveToProjectOpen}
        mode="select"
        selectTarget="folder"
        defaultRootUri={rootUri}
        onSelectTarget={(targetUri: string) => {
          setSaveToProjectOpen(false);
        }}
      />
    <BoardErrorBoundary>
      <BoardProvider
        engine={engine}
        actions={{
          openImagePreview,
          closeImagePreview,
        }}
        fileContext={{
          workspaceId: resolvedWorkspaceId || undefined,
          projectId,
          rootUri,
          boardId: resolvedBoardId || undefined,
          boardFolderUri,
        }}
      >
        <BoardCanvasCollab
          engine={engine}
          initialElements={initialElements}
          workspaceId={resolvedWorkspaceId}
          projectId={projectId}
          rootUri={rootUri}
          boardFolderUri={boardFolderUri}
          boardFileUri={boardFileUri}
          onSyncLogChange={setSyncLogState}
        />
        <BoardCanvasInteraction
          engine={engine}
          snapshot={snapshot}
          containerRef={containerRef}
          projectId={projectId}
          rootUri={rootUri}
          tabId={tabId}
          panelKey={panelKey}
          uiHidden={uiHidden}
          className={className}
          boardFolderUri={boardFolderUri}
          onAutoLayout={scheduleAutoLayoutThumbnail}
          onOpenImagePreview={openImagePreview}
        >
          <BoardCanvasRender
            engine={engine}
            snapshot={snapshot}
            showUi={showUi}
            showPerfOverlay={showPerfOverlay}
            containerRef={containerRef}
            onSyncLog={syncLogState.canSyncLog ? syncLogState.onSyncLog : undefined}
            onAutoLayout={scheduleAutoLayoutThumbnail}
          />
        </BoardCanvasInteraction>
      </BoardProvider>
    </BoardErrorBoundary>
    </>
  );
}
