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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, CopyPlus, FolderDown, FolderOpen, Loader2, MoreHorizontal, PencilLine, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { CANVAS_LIST_TAB_INPUT } from "@openloaf/api/common";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Input } from "@openloaf/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { buildBoardChatTabState } from "../utils/board-chat-tab";
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
import {
  closeFilePreview,
  openFilePreview,
  useFilePreviewStore,
} from "@/components/file/lib/file-preview-store";
import {
  buildBoardFolderUri,
  buildChildUri,
  buildFileUriFromRoot,
  getRelativePathFromUri,
} from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_INDEX_FILE_NAME } from "@/lib/file-name";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { applyProjectShellToTab } from "@/lib/project-shell";
import { trpc, trpcClient } from "@/utils/trpc";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { useProjectStorageRootUri } from "@/hooks/use-project-storage-root-uri";
import { getCachedAccessToken } from "@/lib/saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import i18next from "i18next";
import { isElectronEnv } from "@/utils/is-electron-env";
import { GroupMembersDialog } from "../dialogs/GroupMembersDialog";
import { VideoTrimDialog } from "../dialogs/VideoTrimDialog";

export type BoardCanvasProps = {
  /** External engine instance, optional for integration scenarios. */
  engine?: CanvasEngine;
  /** Node definitions to register on first mount. */
  nodes?: CanvasNodeDefinition<any>[];
  /** Initial elements inserted once when mounted. */
  initialElements?: CanvasElement[];
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
  const projectStorageRootUri = useProjectStorageRootUri();
  // 逻辑：全局画布统一回退到默认项目存储根，不再依赖旧版存储根兼容查询。
  const resolvedRootUri = rootUri?.trim() || projectStorageRootUri;
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
  const resolvedBoardFolderUri = useMemo(() => {
    const source = boardFolderUri?.trim() || "";
    if (!source) return "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source)) return source;
    if (!resolvedRootUri) return "";
    return buildFileUriFromRoot(resolvedRootUri, source);
  }, [boardFolderUri, resolvedRootUri]);
  const boardFolderRelativeUri = useMemo(() => {
    const source = boardFolderUri?.trim() || "";
    if (!source) return "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source)) {
      if (!resolvedRootUri) return "";
      return getRelativePathFromUri(resolvedRootUri, source) ?? "";
    }
    return source;
  }, [boardFolderUri, resolvedRootUri]);
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
  /** Sync snap-to-align setting to engine. */
  useEffect(() => {
    engine.setSnapEnabled(Boolean(basic.boardSnapEnabled));
  }, [engine, basic.boardSnapEnabled]);
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
  const setTitle = useAppView((s) => s.setTitle);
  const currentTabTitle = useAppView((s) => s.title);
  const isActiveTab = true;
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [aiNaming, setAiNaming] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { loggedIn: saasLoggedIn } = useSaasAuth();
  const [saveToProjectOpen, setSaveToProjectOpen] = useState(false);
  const [saveToProjectTargetId, setSaveToProjectTargetId] = useState<string>('');
  const { data: projectListForSave } = useQuery({
    ...trpc.project.listFlat.queryOptions(),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: saveToProjectOpen,
  });
  const [enterGroupId, setEnterGroupId] = useState<string | null>(null);
  const navigate = useAppView((s) => s.navigate);
  const pushStackItem = useLayoutState((s) => s.pushStackItem);
  const inferBoardNameMutation = useMutation(trpc.settings.inferBoardName.mutationOptions());
  const deleteBoardMutation = useMutation(trpc.fs.delete.mutationOptions());
  const duplicateBoardMutation = useMutation(trpc.board.duplicate.mutationOptions({
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: trpc.board.list.queryKey() });
      toast.success(i18next.t('nav:canvasList.duplicateSuccess'));
      if (!resolvedRootUri) return;
      const newBoardFolderUri = buildBoardFolderUri(resolvedRootUri, newBoard.folderUri);
      const newBoardFileUri = buildBoardFolderUri(resolvedRootUri, `${newBoard.folderUri}${BOARD_INDEX_FILE_NAME}`);
      const currentView = useAppView.getState();
      const currentBase = useLayoutState.getState().base;
      const currentProjectShell = resolveProjectModeProjectShell(currentView.projectShell);
      navigate({
        title: newBoard.title,
        icon: "🎨",
        ...buildBoardChatTabState(newBoard.id, projectId),
        leftWidthPercent: 100,
        ...(currentProjectShell && currentProjectShell.projectId === projectId
          ? { projectShell: currentProjectShell }
          : {}),
        base: {
          id: `board:${newBoardFolderUri}`,
          component: "board-viewer",
          params: {
            boardFolderUri: newBoardFolderUri,
            boardFileUri: newBoardFileUri,
            boardId: newBoard.id,
            projectId,
            rootUri: resolvedRootUri,
            __previousBase: currentBase ?? null,
          },
        },
      });
    },
  }));
  const handleDuplicateBoard = useCallback(() => {
    if (!resolvedBoardId || duplicateBoardMutation.isPending) return;
    duplicateBoardMutation.mutate({
      boardId: resolvedBoardId,
      ...(projectId ? { projectId } : {}),
    });
  }, [resolvedBoardId, projectId, duplicateBoardMutation]);
  const handleCopyBoardPath = useCallback(() => {
    if (!boardFolderUri) return;
    const fullPath = boardFolderUri.startsWith("file://")
      ? decodeURIComponent(new URL(boardFolderUri).pathname).replace(/\/$/, "")
      : boardFolderUri.replace(/\/$/, "");
    navigator.clipboard.writeText(fullPath);
    toast.success(i18next.t('nav:canvasList.pathCopied'));
  }, [boardFolderUri]);
  const handleOpenBoardFolder = useCallback(async () => {
    if (isElectronEnv()) {
      if (!resolvedBoardFolderUri) {
        toast.error(tBoard("panelHeader.openBoardFolderMissing"));
        return;
      }
      const result = await window.openloafElectron?.openPath?.({ uri: resolvedBoardFolderUri });
      if (!result?.ok) {
        toast.error(result?.reason ?? tBoard("panelHeader.openBoardFolderFailed"));
      }
      return;
    }

    if (!resolvedRootUri || !boardFolderRelativeUri) {
      toast.error(tBoard("panelHeader.openBoardFolderMissing"));
      return;
    }

    pushStackItem({
      id: `board-folder:${boardFolderRelativeUri}`,
      sourceKey: `board-folder:${boardFolderRelativeUri}`,
      component: "folder-tree-preview",
      title: currentTabTitle || i18next.t("nav:canvasList.untitled"),
      params: {
        rootUri: resolvedRootUri,
        currentUri: boardFolderRelativeUri,
        projectId,
      },
    });
  }, [
    boardFolderRelativeUri,
    currentTabTitle,
    projectId,
    pushStackItem,
    resolvedBoardFolderUri,
    resolvedRootUri,
    tBoard,
  ]);
  const handleRenameOpen = useCallback((open: boolean) => {
    if (open) setRenameValue(currentTabTitle);
    setRenameOpen(open);
  }, [currentTabTitle]);
  const updateBoardMutation = useMutation(
    trpc.board.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.board.pathKey() });
      },
    }),
  );
  const moveToProjectMutation = useMutation(
    trpc.board.moveToProject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.board.pathKey() });
      },
    }),
  );
  const handleRenameConfirm = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      setTitle(trimmed);
      if (resolvedBoardId) {
        await updateBoardMutation.mutateAsync({ boardId: resolvedBoardId, title: trimmed });
      }
    }
    setRenameOpen(false);
  }, [renameValue, setTitle, resolvedBoardId, updateBoardMutation]);
  const handleAiName = useCallback(async () => {
    if (!boardFolderUri) return;
    if (!saasLoggedIn) {
      setLoginOpen(true);
      return;
    }
    setAiNaming(true);
    try {
      const result = await inferBoardNameMutation.mutateAsync({
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
  }, [boardFolderUri, saasLoggedIn, inferBoardNameMutation]);
  const handleDeleteBoard = useCallback(() => {
    if (!boardFolderUri) return;
    if (!confirm(i18next.t('nav:canvasList.confirmDelete'))) return;
    // Derive relative URI from boardFolderUri
    const rootUriBase = resolvedRootUri ?? '';
    const relativeUri = rootUriBase && boardFolderUri.startsWith(rootUriBase)
      ? boardFolderUri.slice(rootUriBase.length).replace(/^\//, '')
      : boardFolderUri;
    deleteBoardMutation.mutate(
      { uri: relativeUri },
      {
        onSuccess: () => {
          const currentView = useAppView.getState();
          const currentBase = useLayoutState.getState().base;
          const previousBase = (currentBase?.params as Record<string, unknown> | undefined)?.__previousBase;
          const currentProjectShell = resolveProjectModeProjectShell(currentView.projectShell);

          // 中文注释：删除当前画布后优先回到原来的项目上下文，其次回到全局画布列表。
          if (currentProjectShell && currentProjectShell.projectId === projectId) {
            applyProjectShellToTab("main", currentProjectShell);
            return;
          }

          if (previousBase && typeof previousBase === "object") {
            currentView.navigate({
              title: i18next.t("nav:smartCanvas"),
              icon: CANVAS_LIST_TAB_INPUT.icon,
              base: previousBase as any,
              leftWidthPercent: useLayoutState.getState().leftWidthPercent,
              rightChatCollapsed: useLayoutState.getState().rightChatCollapsed,
            });
            return;
          }

          currentView.navigate({
            title: i18next.t("nav:smartCanvas"),
            icon: CANVAS_LIST_TAB_INPUT.icon,
            leftWidthPercent: 100,
            rightChatCollapsed: true,
            base: {
              id: CANVAS_LIST_TAB_INPUT.baseId,
              component: CANVAS_LIST_TAB_INPUT.component,
            },
          });
        },
      },
    );
  }, [boardFolderUri, projectId, resolvedRootUri, deleteBoardMutation, navigate]);
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
      if (!boardFolderUri) return;
      // 逻辑：空画布不截图，保持默认渐变预览。
      if (elementCountRef.current === 0) return;
      // 逻辑：顺序执行截图任务，避免并发占用渲染资源。
      thumbnailQueueRef.current = thumbnailQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const target = resolveExportTarget();
          if (!target || !target.isConnected) return;
          // 逻辑：截图前保存当前视口状态，然后适配全部元素以获取完整缩略图。
          const prevState = engine.viewport.getState();
          engine.fitToElements();
          try {
            setBoardExporting(target, true);
            await waitForAnimationFrames(2);
            // 逻辑：动画帧后再检查一次，避免卸载期间截图报错。
            if (!target.isConnected) return;
            const blob = await captureBoardImageBlob(target);
            if (!blob) return;
            const thumbnailBlob = await renderBoardThumbnailBlob(
              blob,
              BOARD_THUMBNAIL_WIDTH,
              BOARD_THUMBNAIL_HEIGHT
            );
            if (!thumbnailBlob) return;
            const contentBase64 = await blobToBase64(thumbnailBlob);
            const uri = buildChildUri(boardFolderUri, BOARD_THUMBNAIL_FILE_NAME);
            await writeThumbnailRef.current({
              projectId,
              uri,
              contentBase64,
            });
            boardModifiedRef.current = false;
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
    [boardFolderUri, projectId, resolveExportTarget, queryClient, engine]
  );

  /** Schedule a thumbnail capture after auto layout. */
  const scheduleAutoLayoutThumbnail = useCallback(() => {
    if (!boardFolderUri) return;
    if (autoLayoutTimerRef.current) {
      window.clearTimeout(autoLayoutTimerRef.current);
    }
    // 逻辑：自动布局结束后延迟 30 秒截取缩略图。
    autoLayoutTimerRef.current = window.setTimeout(() => {
      saveBoardThumbnail("autoLayout");
    }, AUTO_LAYOUT_THUMBNAIL_DELAY);
  }, [boardFolderUri, saveBoardThumbnail]);

  /** Track board modifications via engine subscription. */
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      boardModifiedRef.current = true;
    });
    return unsubscribe;
  }, [engine]);

  /** Initial thumbnail capture: fires once when elements are first loaded from collab sync. */
  const elementCount = snapshot.elements.length;
  useEffect(() => {
    if (elementCount === 0) return;
    if (thumbnailInitDoneRef.current) return;
    if (!boardFolderUri) return;
    thumbnailInitDoneRef.current = true;
    // 逻辑：元素首次从协作层加载完成后截取缩略图，确保预览图反映最新内容。
    saveBoardThumbnail("init");
  }, [elementCount, boardFolderUri, saveBoardThumbnail]);

  /** On unmount (close/back): capture thumbnail if board was modified. */
  useEffect(() => {
    return () => {
      if (autoLayoutTimerRef.current) {
        window.clearTimeout(autoLayoutTimerRef.current);
        autoLayoutTimerRef.current = null;
      }
      if (!boardModifiedRef.current) return;
      if (!boardFolderUri) return;
      if (elementCountRef.current === 0) return;
      const target = resolveExportTarget();
      if (!target || !target.isConnected) return;
      // 逻辑：关闭时直接启动截图，不经过队列也不等待动画帧，
      // html-to-image 会同步克隆 DOM，后续渲染和写盘可异步完成。
      setBoardExporting(target, true);
      captureBoardImageBlob(target)
        .then(async (blob) => {
          setBoardExporting(target, false);
          if (!blob) return;
          const thumbnailBlob = await renderBoardThumbnailBlob(
            blob,
            BOARD_THUMBNAIL_WIDTH,
            BOARD_THUMBNAIL_HEIGHT
          );
          if (!thumbnailBlob) return;
          const contentBase64 = await blobToBase64(thumbnailBlob);
          const uri = buildChildUri(boardFolderUri, BOARD_THUMBNAIL_FILE_NAME);
          await writeThumbnailRef.current({
            projectId,
            uri,
            contentBase64,
          });
          queryClient.invalidateQueries({ queryKey: trpc.board.thumbnails.queryKey() });
        })
        .catch(() => {});
    };
  }, [boardFolderUri, projectId, resolveExportTarget, queryClient]);

  // 逻辑：预览优先使用原图地址，缺失时回退到压缩预览。
  return (
    <>
      {effectiveTarget && snapshot.elements.length > 0 && createPortal(
        <div className="flex items-center justify-end">
          <Dialog open={renameOpen} onOpenChange={handleRenameOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{i18next.t('nav:canvasList.renameTitle')}</DialogTitle>
                <DialogDescription>{i18next.t('nav:canvasList.renameDesc')}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-1.5">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder={tBoard('board.renameCanvasPlaceholder')}
                  className="h-9 flex-1 text-sm shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
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
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 shrink-0 rounded-md shadow-none transition-colors duration-150 ${
                    aiNaming || snapshot.elements.length === 0
                      ? "text-muted-foreground opacity-50"
                      : saasLoggedIn
                        ? "bg-ol-amber/10 text-ol-amber hover:bg-ol-amber/20"
                        : "text-muted-foreground"
                  }`}
                  title={i18next.t('nav:canvasList.aiName')}
                  disabled={aiNaming || snapshot.elements.length === 0}
                  onClick={handleAiName}
                >
                  {aiNaming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-md text-muted-foreground shadow-none transition-colors duration-150"
                  onClick={() => handleRenameOpen(false)}
                >
                  {tBoard('board.cancel')}
                </Button>
                <Button
                  type="button"
                  className="rounded-md bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20 shadow-none transition-colors duration-150"
                  disabled={!renameValue.trim()}
                  onClick={handleRenameConfirm}
                >
                  {i18next.t('nav:save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-md px-2.5 text-xs"
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
              <DropdownMenuItem onClick={() => void handleOpenBoardFolder()}>
                <FolderOpen className="mr-2 size-4" />
                {isElectronEnv()
                  ? tBoard("panelHeader.openInFileSystem")
                  : tBoard("panelHeader.openBoardFolder")}
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
      <Dialog open={saveToProjectOpen} onOpenChange={(open) => {
        setSaveToProjectOpen(open);
        if (!open) setSaveToProjectTargetId('');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{i18next.t('nav:canvasList.selectProject')}</DialogTitle>
            <DialogDescription>{i18next.t('nav:canvasList.selectProjectDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Select value={saveToProjectTargetId} onValueChange={setSaveToProjectTargetId}>
              <SelectTrigger>
                <SelectValue placeholder={i18next.t('nav:canvasList.selectProject')} />
              </SelectTrigger>
              <SelectContent>
                {projectListForSave?.map((p) => (
                  <SelectItem key={p.projectId} value={p.projectId}>
                    {p.icon ? `${p.icon} ` : ''}{p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="rounded-md text-muted-foreground shadow-none transition-colors duration-150"
              >
                {i18next.t('nav:cancel')}
              </Button>
            </DialogClose>
            <Button
              className="rounded-md bg-ol-purple/10 text-ol-purple hover:bg-ol-purple/20 shadow-none transition-colors duration-150"
              disabled={!saveToProjectTargetId || moveToProjectMutation.isPending}
              onClick={async () => {
                if (!saveToProjectTargetId || !resolvedBoardId) {
                  toast.error(i18next.t('nav:canvasList.moveFailed'));
                  setSaveToProjectOpen(false);
                  return;
                }
                try {
                  await moveToProjectMutation.mutateAsync({
                    boardId: resolvedBoardId,
                    targetProjectId: saveToProjectTargetId,
                  });
                  toast.success(i18next.t('nav:canvasList.movedToProject'));
                } catch {
                  toast.error(i18next.t('nav:canvasList.moveFailed'));
                }
                setSaveToProjectOpen(false);
                setSaveToProjectTargetId('');
              }}
            >
              {moveToProjectMutation.isPending
                ? i18next.t('common:loading')
                : i18next.t('nav:save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    <BoardErrorBoundary>
      <BoardProvider
        engine={engine}
        actions={{
          openImagePreview,
          closeImagePreview,
        }}
        fileContext={{
          projectId,
          rootUri: resolvedRootUri,
          boardId: resolvedBoardId || undefined,
          boardFolderUri,
        }}
      >
        <BoardCanvasCollab
          engine={engine}
          initialElements={initialElements}
          projectId={projectId}
          rootUri={resolvedRootUri}
          boardFolderUri={boardFolderUri}
          boardFileUri={boardFileUri}
          onSyncLogChange={setSyncLogState}
        />
        <BoardCanvasInteraction
          engine={engine}
          snapshot={snapshot}
          containerRef={containerRef}
          projectId={projectId}
          rootUri={resolvedRootUri}
          tabId={tabId}
          panelKey={panelKey}
          uiHidden={uiHidden}
          className={className}
          boardFolderUri={boardFolderUri}
          onAutoLayout={scheduleAutoLayoutThumbnail}
          onOpenImagePreview={openImagePreview}
          onEnterGroup={setEnterGroupId}
        >
          <BoardCanvasRender
            engine={engine}
            snapshot={snapshot}
            showUi={showUi}
            showPerfOverlay={showPerfOverlay}
            containerRef={containerRef}
            onSyncLog={syncLogState.canSyncLog ? syncLogState.onSyncLog : undefined}
            onAutoLayout={scheduleAutoLayoutThumbnail}
            onEnterGroup={setEnterGroupId}
          />
        </BoardCanvasInteraction>
        <GroupMembersDialog
          groupId={enterGroupId}
          parentEngine={engine}
          onClose={() => setEnterGroupId(null)}
        />
        <VideoTrimDialog />
      </BoardProvider>
    </BoardErrorBoundary>
    </>
  );
}
