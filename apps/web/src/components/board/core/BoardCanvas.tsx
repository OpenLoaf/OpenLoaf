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
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FolderDown, Loader2, PencilLine, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
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
  formatScopedProjectPath,
  getRelativePathFromUri,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { trpc } from "@/utils/trpc";
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

/** Scheme matcher for absolute URIs. */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
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
  const resolvedBoardId = useMemo(() => {
    if (boardFolderUri) {
      if (!SCHEME_REGEX.test(boardFolderUri)) {
        return normalizeProjectRelativePath(boardFolderUri);
      }
      if (rootUri) {
        const relativePath = getRelativePathFromUri(rootUri, boardFolderUri);
        if (relativePath) return normalizeProjectRelativePath(relativePath);
      }
    }
    const rawBoardId = boardId?.trim() ?? "";
    if (rawBoardId) {
      if (SCHEME_REGEX.test(rawBoardId)) {
        if (rootUri) {
          const relativePath = getRelativePathFromUri(rootUri, rawBoardId);
          if (relativePath) return normalizeProjectRelativePath(relativePath);
        }
        return projectId ?? "";
      }
      const parsed = parseScopedProjectPath(rawBoardId);
      if (!parsed) return rawBoardId;
      const normalized = formatScopedProjectPath({
        projectId: parsed.projectId,
        currentProjectId: projectId,
        relativePath: parsed.relativePath,
        includeAt: true,
      });
      return normalized || parsed.relativePath;
    }
    return projectId ?? "";
  }, [boardFolderUri, boardId, projectId, rootUri]);
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
  /** Latest snapshot from the engine. */
  const snapshot = useBoardSnapshot(engine);
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
  const inferBoardNameMutation = useMutation(trpc.settings.inferBoardName.mutationOptions());
  const deleteBoardMutation = useMutation(trpc.fs.delete.mutationOptions());
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
    (reason: "close" | "autoLayout") => {
      if (!boardFolderUri) return;
      if (!resolvedWorkspaceId) return;
      // 逻辑：顺序执行截图任务，避免并发占用渲染资源。
      thumbnailQueueRef.current = thumbnailQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const target = resolveExportTarget();
          if (!target) return;
          try {
            setBoardExporting(target, true);
            await waitForAnimationFrames(2);
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
              workspaceId: resolvedWorkspaceId,
              projectId,
              uri,
              contentBase64,
            });
          } catch (error) {
            console.error("Board thumbnail capture failed", reason, error);
          } finally {
            setBoardExporting(target, false);
          }
        });
    },
    [boardFolderUri, projectId, resolveExportTarget, resolvedWorkspaceId]
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

  useEffect(() => {
    return () => {
      if (autoLayoutTimerRef.current) {
        window.clearTimeout(autoLayoutTimerRef.current);
        autoLayoutTimerRef.current = null;
      }
      saveBoardThumbnail("close");
    };
  }, [saveBoardThumbnail]);

  // 逻辑：预览优先使用原图地址，缺失时回退到压缩预览。
  return (
    <>
      {effectiveTarget && snapshot.elements.length > 0 && createPortal(
        <div className="flex items-center justify-end gap-2">
          <Popover open={renameOpen} onOpenChange={handleRenameOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 rounded-full px-3 text-xs bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] hover:text-[#1a73e8] dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70 transition-colors duration-150"
              >
                <PencilLine className="size-3.5" />
                {tBoard('board.renameCanvas')}
              </Button>
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-full px-3 text-xs text-[#5f6368] hover:bg-[#f1f3f4] dark:text-slate-400 dark:hover:bg-[hsl(var(--muted)/0.42)] transition-colors duration-150"
            onClick={() => setSaveToProjectOpen(true)}
          >
            <FolderDown className="size-3.5" />
            {tBoard('board.saveToProject')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-full px-3 text-xs text-destructive hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150"
            onClick={handleDeleteBoard}
          >
            <Trash2 className="size-3.5" />
            {tBoard('board.deleteCanvas')}
          </Button>
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
