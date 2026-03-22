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
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@udecode/cn";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type {
  CanvasConnectorEnd,
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { getClipboardInsertPayload } from "../engine/clipboard";
import { isBoardUiTarget } from "../utils/dom";
import { toScreenPoint } from "../utils/coordinates";
import { readImageDragPayload } from "@/lib/image/drag";
import {
  FILE_DRAG_URI_MIME,
  FILE_DRAG_URIS_MIME,
} from "@openloaf/ui/openloaf/drag-drop-types";
import {
  fetchBlobFromUri,
  getBoardPreviewEndpoint,
  getPreviewEndpoint,
  resolveFileName,
} from "@/lib/image/uri";
import { getStackedImageRect } from "../utils/image-insert";
import type { ImagePreviewPayload, BoardFileContext } from "./BoardProvider";
import { useBoardContext } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";
import {
  fitSize,
  isVideoFile,
  isAudioFile,
  isImageFile,
  saveBoardAssetFile,
  buildVideoPosterFromFile,
  getAudioDuration,
  resolveViewerType,
} from "../utils/board-asset";
import { GroupedNodePicker } from "./GroupedNodePicker";
import {
  computeOutputTemplates,
  computeInputTemplates,
  type TemplateGroup,
  type TemplateItem,
} from "../engine/dynamic-templates";
import {
  openLinkInStack as openLinkInStackAction,
  resolveLinkTitle,
} from "../nodes/lib/link-actions";
import type { ImageNodeProps } from "../nodes/ImageNode";
import type { VideoNodeProps } from "../nodes/VideoNode";
import type { LinkNodeProps } from "../nodes/LinkNode";
import { deriveNode, avoidNodeCollisions } from "../utils/derive-node";
import { submitUpscale } from "../services/upscale-generate";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import {
  resolveDirectionalStackPlacement,
  type StackPlacementDirection,
} from "../utils/output-placement";
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "./boardFilePath";
import { buildLinkNodePayloadFromUrl } from "../utils/link";
import { isVideoPlatformUrl, probeVideoUrl } from "../utils/video-url";
import { resolveServerUrl } from "@/utils/server-url";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BoardContextMenu } from "./BoardContextMenu";
import { useOptionalSidebar } from "@openloaf/ui/sidebar";
import {
  emitSidebarOpenRequest,
  getLeftSidebarOpen,
} from "@/lib/sidebar-state";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/TextNode";
import { isGroupNodeType } from "../engine/grouping";
import {
  ProjectFilePickerDialog,
} from "@/components/project/filesystem/components/ProjectFilePickerDialog";
import { trpcClient } from "@/utils/trpc";
import {
  getRelativePathFromUri,
} from "@/components/project/filesystem/utils/file-system-utils";
import { VersionStackDeleteDialog } from "../dialogs/VersionStackDeleteDialog";

const EDITABLE_NODE_TYPES = new Set([
  "text",
]);
const DEFAULT_VIDEO_WIDTH = 16;
const DEFAULT_VIDEO_HEIGHT = 9;
const DEFAULT_VIDEO_NODE_MAX = 420;
const DEFAULT_AUDIO_NODE_WIDTH = 320;
const DEFAULT_AUDIO_NODE_HEIGHT = 120;
const DEFAULT_FILE_NODE_WIDTH = 260;
const DEFAULT_FILE_NODE_HEIGHT = 80;
const CONNECTOR_TEMPLATE_SIDE_GAP = 60;
const CONNECTOR_TEMPLATE_STACK_GAP = 16;
/** Cursor assets for board drawing tools. */
const PEN_CURSOR_DOWN_URL = "/board/brush-cursor.svg";
const PEN_CURSOR_UP_URL = "/board/brush-cursor-up.svg";
const HIGHLIGHTER_CURSOR_DOWN_URL = "/board/highlighter-cursor.svg";
const HIGHLIGHTER_CURSOR_UP_URL = "/board/highlighter-cursor-up.svg";
const ERASER_CURSOR_DOWN_URL = "/board/eraser-cursor.svg";
const ERASER_CURSOR_UP_URL = "/board/eraser-cursor-up.svg";
/** Cursor hotspots aligned to tool tips. */
const PEN_CURSOR_HOTSPOT: [number, number] = [18, 4];
const HIGHLIGHTER_CURSOR_HOTSPOT: [number, number] = [14, 8];
const ERASER_CURSOR_HOTSPOT: [number, number] = [22, 46];
/** Cursor SVG text cache keyed by URL. */
const CURSOR_SVG_CACHE = new Map<string, string>();
/** Cursor SVG load promises keyed by URL. */
const CURSOR_SVG_LOADING = new Map<string, Promise<void>>();
/** Colored cursor data URL cache keyed by url/color/hotspot. */
const CURSOR_DATA_CACHE = new Map<string, string>();

type ClipboardPastePayload = {
  images: File[];
  url?: string;
};

/** Resolve the preferred placement direction for a connector-created node. */
function resolveConnectorDropDirection(
  source: CanvasConnectorEnd,
  sourceRect: [number, number, number, number],
  point: CanvasPoint,
): StackPlacementDirection {
  if ("elementId" in source) {
    const anchorId = source.anchorId;
    if (
      anchorId === "left" ||
      anchorId === "right" ||
      anchorId === "top" ||
      anchorId === "bottom"
    ) {
      return anchorId;
    }
  }
  const [x, y, w, h] = sourceRect;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const deltaX = point[0] - centerX;
  const deltaY = point[1] - centerY;
  // 逻辑：没有显式锚点时按拖拽主方向推断，保证新节点仍落在期望象限。
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX < 0 ? "left" : "right";
  }
  return deltaY < 0 ? "top" : "bottom";
}

/** Collect outbound target node bounds for a source node. */
function collectOutboundTargetRects(
  engine: CanvasEngine,
  sourceElementId: string,
): Array<[number, number, number, number]> {
  return engine.doc
    .getElements()
    .reduce<Array<[number, number, number, number]>>((nodes, item) => {
      if (item.kind !== "connector") return nodes;
      if (
        !("elementId" in item.source) ||
        item.source.elementId !== sourceElementId
      ) {
        return nodes;
      }
      if (!("elementId" in item.target)) return nodes;
      const targetElement = engine.doc.getElementById(item.target.elementId);
      if (!targetElement || targetElement.kind !== "node") return nodes;
      return [...nodes, targetElement.xywh];
    }, []);
}

// Logs clipboard data for paste diagnostics.
const logPasteClipboardPayload = (event: ClipboardEvent) => {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  const files = Array.from(clipboardData.files ?? []);
  const items = Array.from(clipboardData.items ?? []);
  const textPlain = clipboardData.getData("text/plain") ?? "";
  const textHtml = clipboardData.getData("text/html") ?? "";
  const textUriList = clipboardData.getData("text/uri-list") ?? "";
  const previewLimit = 240;
  const textPlainPreview =
    textPlain.length > previewLimit
      ? `${textPlain.slice(0, previewLimit)}...`
      : textPlain;
  const textHtmlPreview =
    textHtml.length > previewLimit
      ? `${textHtml.slice(0, previewLimit)}...`
      : textHtml;
  const textUriListPreview =
    textUriList.length > previewLimit
      ? `${textUriList.slice(0, previewLimit)}...`
      : textUriList;
  // 逻辑：打印剪贴板内容，便于定位 Paste 粘贴格式。
  console.info("[board] paste payload", {
    types: Array.from(clipboardData.types ?? []),
    items: items.map((item) => item.type),
    files: files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    textPlain: textPlainPreview,
    textPlainLength: textPlain.length,
    textHtml: textHtmlPreview,
    textHtmlLength: textHtml.length,
    textUriList: textUriListPreview,
    textUriListLength: textUriList.length,
  });
};

/** Resolve the download URL and file name for an image or video node. */
function resolveNodeFileInfo(
  node: CanvasNodeElement,
  fileContext?: BoardFileContext,
): { href: string; fileName: string } | null {
  if (node.type === "image") {
    const props = node.props as import("../nodes/ImageNode").ImageNodeProps;
    const originalSrc = (props.originalSrc ?? "").trim();
    if (!originalSrc) return null;
    let href: string;
    if (fileContext?.boardId && isBoardRelativePath(originalSrc)) {
      href = getBoardPreviewEndpoint(originalSrc, {
        boardId: fileContext.boardId,
        projectId: fileContext.projectId,
      });
    } else {
      const scope = resolveBoardFolderScope(fileContext);
      const projectPath = resolveProjectPathFromBoardUri({
        uri: originalSrc,
        boardFolderScope: scope,
        currentProjectId: fileContext?.projectId,
        rootUri: fileContext?.rootUri,
      });
      href = projectPath
        ? getPreviewEndpoint(projectPath, { projectId: fileContext?.projectId })
        : originalSrc;
    }
    if (!href) return null;
    return { href, fileName: props.fileName || "image.png" };
  }
  if (node.type === "video") {
    const props = node.props as import("../nodes/VideoNode").VideoNodeProps;
    const sourcePath = (props.sourcePath ?? "").trim();
    if (!sourcePath) return null;
    let href: string;
    if (fileContext?.boardId && isBoardRelativePath(sourcePath)) {
      href = getBoardPreviewEndpoint(sourcePath, {
        boardId: fileContext.boardId,
        projectId: fileContext.projectId,
      });
    } else {
      const scope = resolveBoardFolderScope(fileContext);
      const projectPath = resolveProjectPathFromBoardUri({
        uri: sourcePath,
        boardFolderScope: scope,
        currentProjectId: fileContext?.projectId,
        rootUri: fileContext?.rootUri,
      });
      href = projectPath
        ? getPreviewEndpoint(projectPath, { projectId: fileContext?.projectId })
        : sourcePath;
    }
    if (!href) return null;
    return { href, fileName: props.fileName || sourcePath.split("/").pop() || "video.mp4" };
  }
  return null;
}

/** Save a node file to disk via native file dialog or browser download. */
async function saveNodeToComputer(
  node: CanvasNodeElement,
  fileContext?: BoardFileContext,
) {
  const info = resolveNodeFileInfo(node, fileContext);
  if (!info) return;
  const { href, fileName } = info;
  const saveFile = window.openloafElectron?.saveFile;
  if (saveFile) {
    try {
      const response = await fetch(href);
      if (!response.ok) return;
      const buffer = await response.arrayBuffer();
      const contentBase64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
      );
      const extension = fileName.split(".").pop() || "bin";
      await saveFile({
        contentBase64,
        suggestedName: fileName,
        filters: [{ name: "File", extensions: [extension] }],
      });
      return;
    } catch {
      // Fall through to browser download.
    }
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noreferrer";
  link.click();
}

/** Resolve a pasteable payload from the system clipboard. */
async function readClipboardPayload(): Promise<ClipboardPastePayload | null> {
  const images: File[] = [];
  let url: string | undefined;

  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (!type.startsWith("image/")) continue;
          const blob = await item.getType(type);
          const extension = type.split("/")[1]?.replace("+xml", "") || "png";
          const file = new File(
            [blob],
            `clipboard-${Date.now()}.${extension}`,
            {
              type,
            },
          );
          images.push(file);
        }
      }
    } catch {
      // 逻辑：读取权限不足时忽略，回退到文本检测。
    }
  }

  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed && !/[\r\n]/.test(trimmed) && /^https?:\/\//i.test(trimmed)) {
        url = trimmed;
      }
    } catch {
      // 逻辑：读取失败时忽略，仅使用已解析的图片。
    }
  }

  if (images.length === 0 && !url) return null;
  return { images, url };
}

/** Build a fallback cursor string for a static SVG url. */
function buildCursorFallback(
  url: string,
  hotspot: [number, number],
  fallback: string,
): string {
  return `url("${url}") ${hotspot[0]} ${hotspot[1]}, ${fallback}`;
}

/** Load and cache cursor SVG text. */
function loadCursorSvg(url: string): Promise<void> {
  if (CURSOR_SVG_CACHE.has(url)) return Promise.resolve();
  const inflight = CURSOR_SVG_LOADING.get(url);
  if (inflight) return inflight;
  const request = fetch(url)
    .then((res) => (res.ok ? res.text() : ""))
    .then((text) => {
      if (!text) return;
      CURSOR_SVG_CACHE.set(url, text);
    })
    .catch(() => {});
  CURSOR_SVG_LOADING.set(url, request);
  return request;
}

/** Inject a color style into the root svg tag. */
function injectSvgColor(svg: string, color: string): string {
  if (svg.includes('style="')) {
    return svg.replace(/<svg([^>]*?)style="([^"]*)"/, (match, attrs, style) => {
      return `<svg${attrs}style="${style}; color: ${color};"`;
    });
  }
  return svg.replace(/<svg([^>]*?)>/, `<svg$1 style="color: ${color};">`);
}

/** Build a data-url cursor string using the provided color. */
function buildColoredCursor(
  url: string,
  svg: string,
  color: string,
  hotspot: [number, number],
  fallback: string,
): string {
  const cacheKey = `${url}|${color}|${hotspot[0]}|${hotspot[1]}|${fallback}`;
  const cached = CURSOR_DATA_CACHE.get(cacheKey);
  if (cached) return cached;
  const coloredSvg = injectSvgColor(svg, color);
  const encoded = encodeURIComponent(coloredSvg);
  const cursor = `url("data:image/svg+xml;utf8,${encoded}") ${hotspot[0]} ${hotspot[1]}, ${fallback}`;
  CURSOR_DATA_CACHE.set(cacheKey, cursor);
  return cursor;
}

/** Resolve a colored cursor string when SVG text is available. */
function resolveColoredCursor(
  url: string,
  color: string,
  hotspot: [number, number],
  fallback: string,
): string {
  const svg = CURSOR_SVG_CACHE.get(url);
  if (!svg) return buildCursorFallback(url, hotspot, fallback);
  return buildColoredCursor(url, svg, color, hotspot, fallback);
}

type BoardCanvasInteractionProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot for current scene. */
  snapshot: CanvasSnapshot;
  /** Container ref for pointer calculations. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Project id for file resolution. */
  projectId?: string;
  /** Project root uri for file resolution. */
  rootUri?: string;
  /** Tab id for panel refresh behavior. */
  tabId?: string;
  /** Panel key for identifying board instances. */
  panelKey?: string;
  /** Hide interactive overlays when the panel is minimized. */
  uiHidden?: boolean;
  /** Optional container class name. */
  className?: string;
  /** Board folder uri for attachment resolution. */
  boardFolderUri?: string;
  /** Auto layout callback for thumbnail capture. */
  onAutoLayout?: () => void;
  /** Rendered canvas layers. */
  children?: ReactNode;
  /** Handler for image preview. */
  onOpenImagePreview: (payload: ImagePreviewPayload) => void;
  /** Enter group editing dialog. */
  onEnterGroup?: (groupId: string) => void;
};

/** Handle board interactions and pointer events. */
export function BoardCanvasInteraction({
  engine,
  snapshot,
  containerRef,
  projectId,
  rootUri,
  tabId,
  panelKey,
  uiHidden,
  className,
  boardFolderUri,
  onAutoLayout,
  children,
  onOpenImagePreview,
  onEnterGroup,
}: BoardCanvasInteractionProps) {
  const { t } = useTranslation('project');
  const { fileContext } = useBoardContext();
  const showUi = !uiHidden;
  const rightChatCollapsed = useLayoutState(
    (state) => state.rightChatCollapsed ?? false,
  );
  const sidebar = useOptionalSidebar();
  const isMobile = sidebar?.isMobile ?? false;
  const open = sidebar?.open ?? false;
  const openMobile = sidebar?.openMobile ?? false;
  const leftOpenFallback = getLeftSidebarOpen();
  const leftOpen = sidebar
    ? isMobile
      ? openMobile
      : open
    : (leftOpenFallback ?? false);
  const setOpen = sidebar?.setOpen;
  const setOpenMobile = sidebar?.setOpenMobile;
  const penColor = engine.getPenSettings().color;
  const highlighterColor = engine.getHighlighterSettings().color;
  /** Last pointer location inside the canvas, in world coordinates. */
  const lastPointerWorldRef = useRef<CanvasPoint | null>(null);
  /** Current cursor state applied to the canvas container. */
  const cursorRef = useRef<string>("default");
  /** Whether the primary pointer is pressed. */
  const isPointerDownRef = useRef(false);
  /** Last right-click location inside the canvas, in world coordinates. */
  const lastContextMenuWorldRef = useRef<CanvasPoint | null>(null);
  /** 右键点击到的节点（null 表示空白区域） */
  const [contextNode, setContextNode] = useState<CanvasNodeElement | null>(null);
  /** 另存为 Dialog 状态 */
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsNode, setSaveAsNode] = useState<CanvasNodeElement | null>(null);
  /** 版本堆叠删除确认对话状态 */
  const [versionDeleteOpen, setVersionDeleteOpen] = useState(false);
  const [versionDeleteIds, setVersionDeleteIds] = useState<string[]>([]);
  const [versionDeleteCount, setVersionDeleteCount] = useState(0);
  /** Latest cursor applier used by async loaders. */
  const applyCursorRef = useRef<() => void>(() => {});
  /** Track wheel gesture target to avoid mid-gesture handoff. */
  const wheelGestureRef = useRef<{
    mode: "canvas" | "scroll" | null;
    ts: number;
  }>({
    mode: null,
    ts: 0,
  });
  /** Panel ref used for outside-click detection. */
  const nodePickerRef = useRef<HTMLDivElement | null>(null);
  /** Latest snapshot ref for cursor changes. */
  const latestSnapshotRef = useRef(snapshot);
  const [pasteAvailable, setPasteAvailable] = useState(false);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  // 逻辑：拦截含版本堆叠节点的删除，弹出确认对话让用户选择删除范围。
  useEffect(() => {
    engine.deleteInterceptor = (selectionIds) => {
      // 计算选中堆叠节点中最大版本数（用于对话描述）。
      let maxCount = 0
      for (const id of selectionIds) {
        const el = engine.doc.getElementById(id)
        if (!el || el.kind !== 'node') continue
        const vs = (el as CanvasNodeElement).props?.versionStack as
          | { entries: unknown[] }
          | undefined
        const count = vs?.entries?.length ?? 0
        if (count > maxCount) maxCount = count
      }
      if (maxCount <= 1) return false
      setVersionDeleteIds(selectionIds)
      setVersionDeleteCount(maxCount)
      setVersionDeleteOpen(true)
      return true
    }
    return () => {
      engine.deleteInterceptor = null
    }
  }, [engine])

  /** Fit view for context menu. */
  const handleFitView = useCallback(() => {
    engine.fitToElements();
  }, [engine]);

  const isFullscreen = !leftOpen && rightChatCollapsed;

  /** Toggle board fullscreen via sidebars. */
  const handleToggleFullscreen = useCallback(() => {
    if (!tabId) return;
    const shouldCollapse = leftOpen || !rightChatCollapsed;
    // 逻辑：任一侧可见时进入专注模式，收起左右栏；否则恢复显示。
    const nextLeftOpen = !shouldCollapse;
    if (sidebar) {
      if (isMobile) {
        setOpenMobile?.(nextLeftOpen);
      } else {
        setOpen?.(nextLeftOpen);
      }
    } else {
      emitSidebarOpenRequest(nextLeftOpen);
    }
    useLayoutState.getState().setRightChatCollapsed(shouldCollapse);
    if (panelKey) {
      useLayoutState
        .getState()
        .setStackItemParams(panelKey, { __boardFull: shouldCollapse });
    }
  }, [
    isMobile,
    leftOpen,
    panelKey,
    rightChatCollapsed,
    setOpen,
    setOpenMobile,
    sidebar,
    tabId,
  ]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!showUi) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    lastPointerWorldRef.current = engine.screenToWorld([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
  };

  const resolveCursor = () => {
    const currentSnapshot = latestSnapshotRef.current;
    const viewState = engine.getViewState();
    const isPointerDown = isPointerDownRef.current;
    if (currentSnapshot.pendingInsert) return "crosshair";
    if (currentSnapshot.activeToolId === "hand") {
      return viewState.panning ? "grabbing" : "grab";
    }
    if (currentSnapshot.draggingId) return "grabbing";
    // 逻辑：画笔类工具使用带颜色的光标，保持与当前颜色一致。
    if (currentSnapshot.activeToolId === "pen") {
      return resolveColoredCursor(
        isPointerDown ? PEN_CURSOR_DOWN_URL : PEN_CURSOR_UP_URL,
        penColor,
        PEN_CURSOR_HOTSPOT,
        "crosshair",
      );
    }
    if (currentSnapshot.activeToolId === "highlighter") {
      return resolveColoredCursor(
        isPointerDown ? HIGHLIGHTER_CURSOR_DOWN_URL : HIGHLIGHTER_CURSOR_UP_URL,
        highlighterColor,
        HIGHLIGHTER_CURSOR_HOTSPOT,
        "crosshair",
      );
    }
    if (currentSnapshot.activeToolId === "eraser") {
      return buildCursorFallback(
        isPointerDown ? ERASER_CURSOR_DOWN_URL : ERASER_CURSOR_UP_URL,
        ERASER_CURSOR_HOTSPOT,
        "auto",
      );
    }
    return "default";
  };

  const updatePasteAvailability = useCallback(async () => {
    const hasInternalClipboard = engine.hasClipboard();
    const payload = await readClipboardPayload();
    setPasteAvailable(Boolean(payload) || hasInternalClipboard);
  }, [engine]);

  const applyCursor = () => {
    const nextCursor = resolveCursor();
    if (cursorRef.current === nextCursor) return;
    cursorRef.current = nextCursor;
    const container = containerRef.current;
    if (!container) return;
    // 逻辑：直接更新 DOM 光标，避免视图变化触发全量渲染。
    container.style.cursor = nextCursor;
  };
  applyCursorRef.current = applyCursor;

  useEffect(() => {
    applyCursor();
  }, [
    snapshot.activeToolId,
    snapshot.draggingId,
    snapshot.pendingInsert,
    penColor,
    highlighterColor,
  ]);

  useEffect(() => {
    let active = true;
    const preload = async () => {
      // 逻辑：提前加载光标资源，避免首次切换时闪烁。
      await Promise.all([
        loadCursorSvg(PEN_CURSOR_DOWN_URL),
        loadCursorSvg(PEN_CURSOR_UP_URL),
        loadCursorSvg(HIGHLIGHTER_CURSOR_DOWN_URL),
        loadCursorSvg(HIGHLIGHTER_CURSOR_UP_URL),
      ]);
      if (active) applyCursorRef.current();
    };
    void preload();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = engine.subscribeView(() => {
      applyCursor();
    });
    return () => {
      unsubscribe();
    };
  }, [engine]);

  // 逻辑：同步视口变换到画布点阵背景，使点阵跟随平移和缩放。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const applyDotTransform = () => {
      const { zoom, offset } = engine.getViewState().viewport;
      const gap = zoom * 24;
      container.style.backgroundSize = `${gap}px ${gap}px`;
      container.style.backgroundPosition = `${offset[0]}px ${offset[1]}px`;
    };
    applyDotTransform();
    const unsubscribe = engine.subscribeView(applyDotTransform);
    return () => unsubscribe();
  }, [engine]);

  useEffect(() => {
    if (!showUi) return;
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      if (engine.isLocked()) return;
      const container = containerRef.current;
      if (!container) return;
      const activeElement = document.activeElement;
      if (!activeElement || !container.contains(activeElement)) return;
      logPasteClipboardPayload(event);
      const payloads = getClipboardInsertPayload(event);
      if (!payloads || payloads.length === 0) return;
      const imagePayloads = payloads.filter(
        (
          payload,
        ): payload is Extract<(typeof payloads)[number], { kind: "image" }> =>
          payload.kind === "image",
      );
      if (imagePayloads.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const center =
          lastPointerWorldRef.current ?? engine.getViewportCenterWorld();
        void insertImageFilesAtPoint(
          imagePayloads.map((payload) => payload.file),
          center,
        );
        return;
      }
      const urlPayload = payloads.find(
        (payload): payload is Extract<(typeof payloads)[number], { kind: "url" }> =>
          payload.kind === "url",
      );
      if (urlPayload) {
        event.preventDefault();
        event.stopPropagation();
        const center =
          lastPointerWorldRef.current ?? engine.getViewportCenterWorld();
        if (isVideoPlatformUrl(urlPayload.url)) {
          void insertVideoFromUrl(urlPayload.url, center);
        } else {
          void probeVideoUrl(urlPayload.url).then((isVideo) => {
            if (isVideo) {
              void insertVideoFromUrl(urlPayload.url, center);
            } else {
              const linkPayload = buildLinkNodePayloadFromUrl(urlPayload.url);
              const [width, height] = linkPayload.size;
              engine.addNodeElement("link", linkPayload.props, [
                center[0] - width / 2,
                center[1] - height / 2,
                width,
                height,
              ]);
            }
          });
        }
      }
    };
    document.addEventListener("paste", handleGlobalPaste, { capture: true });
    return () => {
      document.removeEventListener("paste", handleGlobalPaste, {
        capture: true,
      });
    };
  }, [engine, showUi]);

  useEffect(() => {
    if (!showUi) return;
    const container = containerRef.current;
    if (!container) return;
    const handleWheelCapture = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // 逻辑：节点工具栏区域的滚轮事件不交给画布处理。
      if (target.closest("[data-node-toolbar]")) {
        return;
      }
      const scrollTarget = target.closest(
        "[data-board-scroll]",
      ) as HTMLElement | null;
      const now = performance.now();
      if (!scrollTarget) {
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        // 逻辑：缩放手势统一交给画布处理。
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      const isScrollable =
        scrollTarget.scrollHeight > scrollTarget.clientHeight ||
        scrollTarget.scrollWidth > scrollTarget.clientWidth;
      if (!isScrollable) {
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      const lastGesture = wheelGestureRef.current;
      const withinGesture = now - lastGesture.ts < 160;
      const mode = withinGesture ? lastGesture.mode : "scroll";
      if (mode === "canvas") {
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      wheelGestureRef.current = { mode: "scroll", ts: now };
      // 逻辑：滚动区域内的滚轮不驱动画布。
      event.stopPropagation();
    };
    container.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: true,
    });
    return () => {
      container.removeEventListener("wheel", handleWheelCapture, {
        capture: true,
        passive: true,
      } as EventListenerOptions);
    };
  }, [showUi]);

  useEffect(() => {
    if (!showUi) return;
    const handlePointerUp = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      applyCursorRef.current();
    };
    const handleWindowBlur = () => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      applyCursorRef.current();
    };
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [showUi]);

  useEffect(() => {
    if (!snapshot.editingNodeId) return;
    const exists = snapshot.elements.some(
      (element) => element.id === snapshot.editingNodeId,
    );
    if (!exists) {
      // 逻辑：编辑节点被删除时清理编辑态。
      engine.setEditingNodeId(null);
    }
  }, [engine, snapshot.editingNodeId, snapshot.elements]);

  useEffect(() => {
    if (!snapshot.connectorDrop) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      const panel = nodePickerRef.current;
      if (!panel || !target) return;
      if (panel.contains(target)) return;
      // 逻辑：点击面板外部时关闭，不创建节点。
      engine.setConnectorDrop(null);
      // 逻辑：关闭面板时同步清理草稿连线。
      engine.setConnectorDraft(null);
      engine.setConnectorHover(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
    };
  }, [engine, snapshot.connectorDrop]);

  const insertImageFilesAtPoint = async (
    files: File[],
    center: CanvasPoint,
  ) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    for (const [index, file] of imageFiles.entries()) {
      const payload = await engine.buildImagePayloadFromFile(file);
      const rect = getStackedImageRect(center, payload.size, index);
      // 逻辑：批量插入图片时错位堆叠，避免完全重叠。
      engine.addNodeElement("image", payload.props, rect);
    }
  };

  const handlePasteFromContextMenu = async () => {
    if (engine.isLocked()) return;
    const payload = await readClipboardPayload();
    const pastePoint =
      lastContextMenuWorldRef.current ??
      lastPointerWorldRef.current ??
      engine.getViewportCenterWorld();
    if (payload?.images.length) {
      await insertImageFilesAtPoint(payload.images, pastePoint);
      return;
    }
    if (payload?.url) {
      await insertUrlAtPoint(payload.url, pastePoint);
      return;
    }
    if (engine.hasClipboard()) {
      engine.pasteClipboard();
    }
  };

  /** Trigger auto layout behavior consistent with toolbar. */
  const handleAutoLayout = () => {
    engine.autoLayoutBoard();
    // 逻辑：自动布局后通知上层调度缩略图截取。
    onAutoLayout?.();
  };

  /** Refresh the board panel to match header refresh behavior. */
  const handlePanelRefresh = () => {
    if (tabId && panelKey) {
      // 逻辑：通过 __refreshKey 触发 panel remount，保持与右上角刷新一致。
      useLayoutState
        .getState()
        .setStackItemParams(panelKey, { __refreshKey: Date.now() });
      return;
    }
    engine.refreshView();
  };

  /** Insert a text node at the last right-click position. */
  const handleInsertTextFromContextMenu = useCallback(() => {
    if (engine.isLocked()) return;
    const point =
      lastContextMenuWorldRef.current ??
      lastPointerWorldRef.current ??
      engine.getViewportCenterWorld();
    const w = 200;
    const h = TEXT_NODE_DEFAULT_HEIGHT;
    engine.addNodeElement("text", { autoFocus: true }, [
      point[0] - w / 2,
      point[1] - h / 2,
      w,
      h,
    ]);
  }, [engine]);

  /** Open the file picker via custom event (handled by BoardToolbar). */
  const handleInsertFileFromContextMenu = useCallback(() => {
    if (engine.isLocked()) return;
    const container = engine.getContainer();
    if (!container) return;
    container.dispatchEvent(
      new CustomEvent("openloaf:board-open-file-picker", { bubbles: true }),
    );
  }, [engine]);

  const handleCanvasDragOver = (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    const typeList = Array.from(types);
    const hasFiles = typeList.includes("Files");
    const hasUri = typeList.includes(FILE_DRAG_URI_MIME);
    if (!hasFiles && !hasUri && !readImageDragPayload(event.dataTransfer))
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  /** Insert video files at a canvas point: save to board assets, capture poster, add nodes. */
  const insertVideoFilesAtPoint = async (
    files: File[],
    center: CanvasPoint,
  ) => {
    const bfUri = fileContext?.boardFolderUri ?? boardFolderUri;
    if (!bfUri) return;
    const videoFiles = files.filter(isVideoFile);
    if (videoFiles.length === 0) return;
    for (const [index, file] of videoFiles.entries()) {
      try {
        const relativePath = await saveBoardAssetFile({
          file,
          fallbackName: "video.mp4",
          projectId: fileContext?.projectId,
          boardFolderUri: bfUri,
        });
        if (!relativePath) continue;
        const poster = await buildVideoPosterFromFile(file);
        const naturalWidth = poster?.width ?? DEFAULT_VIDEO_WIDTH;
        const naturalHeight = poster?.height ?? DEFAULT_VIDEO_HEIGHT;
        const [nodeWidth, nodeHeight] = fitSize(
          naturalWidth,
          naturalHeight,
          DEFAULT_VIDEO_NODE_MAX,
        );
        // 逻辑：多视频拖放时依次偏移，避免完全重叠。
        const offset = index * 20;
        engine.addNodeElement(
          "video",
          {
            sourcePath: relativePath,
            fileName: file.name,
            posterPath: poster?.posterSrc || undefined,
            naturalWidth,
            naturalHeight,
          },
          [
            center[0] - nodeWidth / 2 + offset,
            center[1] - nodeHeight / 2 + offset,
            nodeWidth,
            nodeHeight,
          ],
        );
      } catch {
        // 逻辑：单个视频保存失败不阻塞其他视频的插入。
      }
    }
  };

  /** Insert a video from a platform URL: create loading node and start server-side download. */
  const insertVideoFromUrl = async (url: string, center: CanvasPoint) => {
    const bfUri = fileContext?.boardFolderUri ?? boardFolderUri;
    const w = DEFAULT_VIDEO_NODE_MAX;
    const h = Math.round(w * (9 / 16));

    const baseUrl = resolveServerUrl();
    const prefix = baseUrl || "";

    try {
      const startRes = await fetch(`${prefix}/media/video-download/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          boardFolderUri: bfUri,
          projectId: fileContext?.projectId,
          boardId: fileContext?.boardId,
        }),
      });
      const startJson = await startRes.json();
      if (!startJson.success || !startJson.data?.taskId) {
        throw new Error(startJson.error || "Failed to start download");
      }

      engine.addNodeElement(
        "loading",
        {
          taskId: startJson.data.taskId,
          taskType: "video_download",
          promptText: url,
          projectId: fileContext?.projectId || "",
          saveDir: bfUri ? `${bfUri}/asset` : "",
        },
        [center[0] - w / 2, center[1] - h / 2, w, h],
      );
    } catch {
      // 逻辑：下载启动失败时回退为普通链接节点。
      const linkPayload = buildLinkNodePayloadFromUrl(url);
      const [lw, lh] = linkPayload.size;
      engine.addNodeElement("link", linkPayload.props, [
        center[0] - lw / 2,
        center[1] - lh / 2,
        lw,
        lh,
      ]);
    }
  };

  /** Insert a URL at a canvas point: known video platforms go to download, others get probed, fallback to link. */
  const insertUrlAtPoint = async (url: string, center: CanvasPoint) => {
    if (isVideoPlatformUrl(url)) {
      await insertVideoFromUrl(url, center);
      return;
    }
    // 逻辑：未知平台异步探测，能提取视频信息就下载，否则创建链接节点。
    const isVideo = await probeVideoUrl(url);
    if (isVideo) {
      await insertVideoFromUrl(url, center);
    } else {
      const linkPayload = buildLinkNodePayloadFromUrl(url);
      const [width, height] = linkPayload.size;
      engine.addNodeElement("link", linkPayload.props, [
        center[0] - width / 2,
        center[1] - height / 2,
        width,
        height,
      ]);
    }
  };

  /** Insert audio files at a canvas point: save to board assets, get duration, add nodes. */
  const insertAudioFilesAtPoint = async (
    files: File[],
    center: CanvasPoint,
  ) => {
    const bfUri = fileContext?.boardFolderUri ?? boardFolderUri;
    if (!bfUri) return;
    const audioFiles = files.filter(isAudioFile);
    if (audioFiles.length === 0) return;
    for (const [index, file] of audioFiles.entries()) {
      try {
        const relativePath = await saveBoardAssetFile({
          file,
          fallbackName: "audio.mp3",
          projectId: fileContext?.projectId,
          boardFolderUri: bfUri,
        });
        if (!relativePath) continue;
        const duration = await getAudioDuration(file);
        const offset = index * 20;
        engine.addNodeElement(
          "audio",
          {
            sourcePath: relativePath,
            fileName: file.name,
            duration: duration ?? undefined,
            mimeType: file.type || undefined,
          },
          [
            center[0] - DEFAULT_AUDIO_NODE_WIDTH / 2 + offset,
            center[1] - DEFAULT_AUDIO_NODE_HEIGHT / 2 + offset,
            DEFAULT_AUDIO_NODE_WIDTH,
            DEFAULT_AUDIO_NODE_HEIGHT,
          ],
        );
      } catch {
        // 逻辑：单个音频保存失败不阻塞其他音频的插入。
      }
    }
  };

  /** Insert generic file attachments at a canvas point. */
  const insertFileAttachmentsAtPoint = async (
    files: File[],
    center: CanvasPoint,
  ) => {
    const bfUri = fileContext?.boardFolderUri ?? boardFolderUri;
    if (!bfUri) return;
    if (files.length === 0) return;
    for (const [index, file] of files.entries()) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const relativePath = await saveBoardAssetFile({
          file,
          fallbackName: `file.${ext || "bin"}`,
          projectId: fileContext?.projectId,
          boardFolderUri: bfUri,
        });
        if (!relativePath) continue;
        const viewerType = resolveViewerType(ext);
        const offset = index * 20;
        engine.addNodeElement(
          "file-attachment",
          {
            sourcePath: relativePath,
            fileName: file.name,
            extension: ext,
            viewerType,
            fileSize: file.size || undefined,
          },
          [
            center[0] - DEFAULT_FILE_NODE_WIDTH / 2 + offset,
            center[1] - DEFAULT_FILE_NODE_HEIGHT / 2 + offset,
            DEFAULT_FILE_NODE_WIDTH,
            DEFAULT_FILE_NODE_HEIGHT,
          ],
        );
      } catch {
        // 逻辑：单个文件保存失败不阻塞其他文件的插入。
      }
    }
  };

  const handleCanvasDrop = async (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    const typeList = Array.from(types);
    const hasFiles = typeList.includes("Files");
    const hasUri = typeList.includes(FILE_DRAG_URI_MIME);
    if (!hasFiles && !hasUri && !readImageDragPayload(event.dataTransfer))
      return;
    event.preventDefault();
    if (engine.isLocked()) return;

    const { clientX, clientY, dataTransfer } = event;
    const imagePayload = readImageDragPayload(dataTransfer);
    const droppedFiles = Array.from(dataTransfer.files);
    const imageFiles = imagePayload ? [] : droppedFiles.filter(isImageFile);
    const videoFiles = imagePayload ? [] : droppedFiles.filter(isVideoFile);
    const audioFiles = imagePayload ? [] : droppedFiles.filter(isAudioFile);
    const otherFiles = imagePayload
      ? []
      : droppedFiles.filter(
          (file) =>
            !isImageFile(file) && !isVideoFile(file) && !isAudioFile(file),
        );
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 逻辑：将拖拽点转换为画布坐标，作为插入基准。
    const dropPoint = engine.screenToWorld([
      clientX - rect.left,
      clientY - rect.top,
    ]);

    if (imagePayload) {
      try {
        // 逻辑：优先读取多选拖拽的 uri 列表，兼容文件管理器批量拖入。
        const dragUris = (() => {
          const payload = dataTransfer.getData(FILE_DRAG_URIS_MIME);
          if (!payload) return [];
          try {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) {
              return parsed.filter(
                (item): item is string =>
                  typeof item === "string" && item.length > 0,
              );
            }
          } catch {
            return [];
          }
          return [];
        })();
        const uniqueUris =
          dragUris.length > 0
            ? Array.from(new Set(dragUris))
            : [imagePayload.baseUri];
        const fetchedFiles: File[] = [];
        for (const uri of uniqueUris) {
          const blob = await fetchBlobFromUri(uri, { projectId });
          const fileName = resolveFileName(uri);
          const file = new File([blob], fileName, {
            type: blob.type || "application/octet-stream",
          });
          if (!file.type.startsWith("image/")) continue;
          fetchedFiles.push(file);
        }
        await insertImageFilesAtPoint(fetchedFiles, dropPoint);
        return;
      } catch {
        return;
      }
    }
    // 逻辑：按文件类型分别处理，各自独立插入。
    if (imageFiles.length > 0)
      await insertImageFilesAtPoint(imageFiles, dropPoint);
    if (videoFiles.length > 0)
      await insertVideoFilesAtPoint(videoFiles, dropPoint);
    if (audioFiles.length > 0)
      await insertAudioFilesAtPoint(audioFiles, dropPoint);
    if (otherFiles.length > 0)
      await insertFileAttachmentsAtPoint(otherFiles, dropPoint);
  };

  const resolveProjectRelativePath = (value: string) => {
    const scope = resolveBoardFolderScope({
      projectId,
      rootUri,
      boardFolderUri,
    });
    return resolveProjectPathFromBoardUri({
      uri: value,
      boardFolderScope: scope,
      currentProjectId: projectId,
      rootUri,
    });
  };

  const resolveBoardOrProjectEndpoint = (uri: string): string => {
    if (fileContext?.boardId && isBoardRelativePath(uri)) {
      return getBoardPreviewEndpoint(uri, {
        boardId: fileContext.boardId,
        projectId,
      });
    }
    const projectPath = resolveProjectRelativePath(uri);
    return projectPath ? getPreviewEndpoint(projectPath, { projectId }) : uri;
  };

  const openImagePreviewFromNode = (element: CanvasNodeElement) => {
    if (element.type !== "image") return;
    const props = element.props as ImageNodeProps;
    const originalSrc = props.originalSrc || "";
    const resolvedOriginal = resolveBoardOrProjectEndpoint(originalSrc);
    const previewSrc = props.previewSrc || "";
    const resolvedPreview = resolveBoardOrProjectEndpoint(previewSrc);
    const resolvedOriginalUsable =
      resolvedOriginal !== originalSrc ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(resolvedOriginal);
    const finalOriginal = resolvedOriginalUsable ? resolvedOriginal : "";
    const finalPreview = resolvedPreview || previewSrc;
    if (!finalOriginal && !finalPreview) return;
    onOpenImagePreview({
      originalSrc: finalOriginal,
      previewSrc: finalPreview,
      fileName: props.fileName || "Image",
      mimeType: props.mimeType,
    });
  };

  const handleNodeDoubleClick = (element: CanvasElement) => {
    if (element.kind !== "node") return;
    // 逻辑：双击节点时自动切换到选择工具，确保画笔等模式下也能进入编辑。
    if (snapshot.activeToolId !== "select") {
      engine.setActiveTool("select");
    }
    // 逻辑：双击组节点时打开组成员对话框。
    if (isGroupNodeType(element.type)) {
      onEnterGroup?.(element.id);
      return;
    }
    if (element.type === "link") {
      const props = element.props as LinkNodeProps;
      openLinkInStackAction({
        url: props.url,
        title: resolveLinkTitle(props.url, props.title),
      });
      return;
    }
    if (element.type === "image") {
      const imgProps = element.props as ImageNodeProps;
      const isEmpty = !imgProps.originalSrc && !imgProps.previewSrc;
      // 逻辑：图片加载失败时也视为空节点，通过 DOM data 属性检测。
      const isLoadError = document.querySelector(`[data-element-id="${element.id}"] [data-image-error]`) != null;
      if (isEmpty || isLoadError) {
        // 逻辑：空图片节点或加载失败节点双击展开面板（由节点内部处理文件选择）。
        engine.selection.setSelection([element.id]);
        engine.setExpandedNodeId(element.id);
        return;
      }
      engine.setEditingNodeId(element.id);
      openImagePreviewFromNode(element);
      return;
    }
    if (element.type === "video") {
      const vidProps = element.props as VideoNodeProps;
      const isEmpty = !vidProps.sourcePath?.trim();
      if (isEmpty) {
        engine.selection.setSelection([element.id]);
        engine.setExpandedNodeId(element.id);
        return;
      }
    }
    if (element.type === "audio") {
      const audProps = element.props as { sourcePath?: string };
      const isEmpty = !audProps.sourcePath?.trim();
      if (isEmpty) {
        engine.selection.setSelection([element.id]);
        engine.setExpandedNodeId(element.id);
        return;
      }
    }
    if (EDITABLE_NODE_TYPES.has(element.type)) {
      engine.selection.setSelection([element.id]);
      engine.setEditingNodeId(element.id);
    }
  };

  const availableTemplateGroups = useMemo((): TemplateGroup[] => {
    if (!snapshot.connectorDrop) return [];
    const isBackward = snapshot.connectorDrop.direction === 'backward';
    const sourceElementId =
      "elementId" in snapshot.connectorDrop.source
        ? snapshot.connectorDrop.source.elementId
        : "";
    const source = sourceElementId
      ? engine.doc.getElementById(sourceElementId)
      : null;
    if (!source || source.kind !== "node") return [];
    const definition = engine.nodes.getDefinition(source.type);
    if (!definition) return [];
    // 逻辑：forward 拖拽根据源节点 outputTypes 动态计算可连目标；backward 拖拽根据目标节点类型反推上游。
    if (isBackward) {
      return computeInputTemplates(source.type);
    }
    const outputTypes = definition.outputTypes ?? [];
    return computeOutputTemplates(outputTypes);
  }, [engine, snapshot.connectorDrop]);

  const handleTemplateSelect = (item: TemplateItem) => {
    if (!snapshot.connectorDrop) return;

    const isBackward = snapshot.connectorDrop.direction === 'backward';
    const sourceElementId =
      "elementId" in snapshot.connectorDrop.source
        ? snapshot.connectorDrop.source.elementId
        : "";
    const type = item.nodeType;
    const [width, height] = item.nodeSize;
    // 逻辑：根据 preselect 设置 aiConfig，面板打开时自动选中对应 feature/variant。
    const props: Record<string, unknown> = {};
    if (item.preselect.featureId && item.preselect.variantId) {
      props.aiConfig = {
        feature: item.preselect.featureId,
        preselect: item.preselect,
      };
    }
    // 逻辑：text 节点创建时设置默认便签样式。
    if (type === 'text') {
      props.style = 'sticky';
      props.stickyColor = 'yellow';
    }
    const sourceElement = sourceElementId
      ? engine.doc.getElementById(sourceElementId)
      : null;
    const xywh: [number, number, number, number] =
      sourceElement && sourceElement.kind === "node"
        ? (() => {
            const direction = resolveConnectorDropDirection(
              snapshot.connectorDrop.source,
              sourceElement.xywh,
              snapshot.connectorDrop.point,
            );
            const existingOutputs = collectOutboundTargetRects(
              engine,
              sourceElement.id,
            );
            const placement = resolveDirectionalStackPlacement(
              sourceElement.xywh,
              existingOutputs,
              {
                direction,
                sideGap: CONNECTOR_TEMPLATE_SIDE_GAP,
                stackGap: CONNECTOR_TEMPLATE_STACK_GAP,
                outputSize: [width, height],
              },
            );
            const proposed: [number, number, number, number] = placement
              ? [placement.x, placement.y, width, height]
              : [
                  snapshot.connectorDrop.point[0] - width / 2,
                  snapshot.connectorDrop.point[1] - height / 2,
                  width,
                  height,
                ];
            const allNodes = engine.doc
              .getElements()
              .filter((el): el is CanvasNodeElement => el.kind === 'node');
            return avoidNodeCollisions(proposed, allNodes, sourceElement.id, direction);
          })()
        : [
            snapshot.connectorDrop.point[0] - width / 2,
            snapshot.connectorDrop.point[1] - height / 2,
            width,
            height,
          ];
    const id = engine.addNodeElement(type, props, xywh);
    if (id) {
      // 逻辑：backward 拖拽时新节点是上游 source，origin 节点是 target；forward 保持原逻辑。
      const connectorDraft = isBackward
        ? {
            source: { elementId: id } as CanvasConnectorEnd,
            target: snapshot.connectorDrop.source,
            style: engine.getConnectorStyle(),
          }
        : {
            source: snapshot.connectorDrop.source,
            target: { elementId: id } as CanvasConnectorEnd,
            style: engine.getConnectorStyle(),
          };
      engine.addConnectorElement(connectorDraft);
      engine.selection.setSelection([id]);
    }
    engine.setConnectorDrop(null);
    engine.setConnectorDraft(null);
    engine.setConnectorHover(null);
  };

  return (
    <>
      <BoardContextMenu
        triggerDisabled={!showUi}
        onToggleFullscreen={handleToggleFullscreen}
        onAutoLayout={handleAutoLayout}
        onFitView={handleFitView}
        isFullscreen={isFullscreen}
        onRefresh={handlePanelRefresh}
        onPaste={() => {
          void handlePasteFromContextMenu();
        }}
        pasteAvailable={pasteAvailable}
        pasteDisabled={engine.isLocked()}
        onInsertText={handleInsertTextFromContextMenu}
        onInsertFile={handleInsertFileFromContextMenu}
        insertDisabled={engine.isLocked()}
        contextNode={contextNode}
        onNodeDelete={(nodeId) => {
          engine.selection.setSelection([nodeId]);
          engine.deleteSelection();
        }}
        onNodeLock={(nodeId, locked) => {
          engine.setElementLocked(nodeId, locked);
        }}
        onNodeBringToFront={(nodeId) => {
          engine.bringNodeToFront(nodeId);
        }}
        onNodeSendToBack={(nodeId) => {
          engine.sendNodeToBack(nodeId);
        }}
        onNodeDuplicate={(nodeId) => {
          engine.selection.setSelection([nodeId]);
          engine.copySelection();
          engine.pasteClipboard();
        }}
        onNodeSaveAs={(nodeId) => {
          const node = engine.doc.getElementById(nodeId);
          if (!node || node.kind !== "node") return;
          setSaveAsNode(node as CanvasNodeElement);
          setSaveAsOpen(true);
        }}
        onNodeDeriveVideo={(nodeId) => {
          deriveNode({ engine, sourceNodeId: nodeId, targetType: 'video' });
        }}
        onNodeDeriveImage={(nodeId) => {
          deriveNode({ engine, sourceNodeId: nodeId, targetType: 'image' });
        }}
        onNodeUpscale={(nodeId) => {
          const node = engine.doc.getElementById(nodeId);
          if (!node || node.kind !== "node" || node.type !== "image") return;
          const props = node.props as ImageNodeProps;
          const originalSrc = (props.originalSrc ?? "").trim();
          const previewSrc = (props.previewSrc ?? "").trim();
          // 逻辑：优先使用原图，回退到预览图。
          const sourceImageSrc = originalSrc
            ? (resolveNodeFileInfo(node as CanvasNodeElement, fileContext)?.href || originalSrc)
            : previewSrc;
          if (!sourceImageSrc) return;
          submitUpscale(
            { sourceImageSrc, scale: 2 },
            { projectId: fileContext?.projectId },
          )
            .then((result) => {
              // 逻辑：重新读取源节点，避免 async 期间位置变化导致放置位置过时。
              const currentNode = engine.doc.getElementById(nodeId);
              if (!currentNode || currentNode.kind !== "node") return;
              const sourceXywh = currentNode.xywh;
              const [loadingW, loadingH] = DEFAULT_NODE_SIZE;
              const existingOutputs = collectOutboundTargetRects(engine, nodeId);
              const placement = resolveDirectionalStackPlacement(
                sourceXywh,
                existingOutputs,
                { direction: 'right', sideGap: 60, stackGap: 16, outputSize: [loadingW, loadingH] },
              );
              const x = placement ? placement.x : sourceXywh[0] + sourceXywh[2] + 60;
              const y = placement ? placement.y : sourceXywh[1];
              const proposed: [number, number, number, number] = [x, y, loadingW, loadingH];
              const allNodes = engine.doc
                .getElements()
                .filter((el): el is CanvasNodeElement => el.kind === 'node');
              const finalXywh = avoidNodeCollisions(proposed, allNodes, nodeId, 'right');
              const loadingNodeId = engine.addNodeElement(
                'loading',
                {
                  taskId: result.taskId,
                  taskType: 'upscale',
                  sourceNodeId: nodeId,
                  promptText: 'upscale 2x',
                  projectId: fileContext?.projectId ?? '',
                  saveDir: fileContext?.boardFolderUri
                    ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
                    : '',
                },
                finalXywh,
              );
              if (loadingNodeId) {
                engine.addConnectorElement(
                  {
                    source: { elementId: nodeId },
                    target: { elementId: loadingNodeId },
                    style: engine.getConnectorStyle(),
                  },
                  { skipHistory: true, select: false },
                );
              }
            })
            .catch((err: unknown) => {
              console.error('[board] upscale failed:', err);
            });
        }}
        onNodeDownload={(nodeId) => {
          const node = engine.doc.getElementById(nodeId);
          if (!node || node.kind !== "node") return;
          void saveNodeToComputer(node as CanvasNodeElement, fileContext);
        }}
        onNodePreview={(nodeId) => {
          const node = engine.doc.getElementById(nodeId);
          if (!node || node.kind !== "node") return;
          openImagePreviewFromNode(node as CanvasNodeElement);
        }}
        onNodePlay={(nodeId) => {
          const node = engine.doc.getElementById(nodeId);
          if (!node || node.kind !== "node" || node.type !== "video") return;
          const props = node.props as VideoNodeProps;
          const sourcePath = (props.sourcePath ?? "").trim();
          if (!sourcePath) return;
          const resolvedPath = resolveProjectRelativePath(sourcePath);
          const displayName = props.fileName || (resolvedPath || sourcePath).split("/").pop() || "Video";
          void fetchVideoMetadata({
            projectId: fileContext?.projectId,
            boardId: fileContext?.boardId,
            uri: resolvedPath || sourcePath,
          }).then((metadata) => {
            openFilePreview({
              viewer: "video",
              items: [
                {
                  uri: sourcePath,
                  openUri: resolvedPath || sourcePath,
                  name: displayName,
                  title: displayName,
                  width: metadata?.width ?? props.naturalWidth,
                  height: metadata?.height ?? props.naturalHeight,
                  projectId: fileContext?.projectId,
                  rootUri: fileContext?.rootUri,
                  boardId: fileContext?.boardId ?? '',
                  clipStart: props.clipStart,
                  clipEnd: props.clipEnd,
                },
              ],
              activeIndex: 0,
              showSave: false,
              enableEdit: false,
            });
          });
        }}
        onNodeInspect={(nodeId) => {
          // 逻辑：打开节点详情面板 — 通过选中并展开节点实现。
          engine.selection.setSelection([nodeId]);
          engine.setExpandedNodeId(nodeId);
        }}
        onContextMenu={(event) => {
          if (!showUi) return;
          event.stopPropagation();
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          // 逻辑：记录右键位置，保证"粘贴"落点与菜单一致。
          const worldPoint = engine.screenToWorld([
            event.clientX - rect.left,
            event.clientY - rect.top,
          ]);
          lastContextMenuWorldRef.current = worldPoint;
          // 逻辑：检测右键点击的是节点还是空白区域，显示不同菜单。
          const hitElement = engine.pickElementAt(worldPoint);
          if (hitElement?.kind === "node") {
            setContextNode(hitElement as CanvasNodeElement);
            engine.selection.setSelection([hitElement.id]);
          } else {
            setContextNode(null);
          }
          // 逻辑：同步检查内部剪贴板即可，跳过 navigator.clipboard.read() 避免右键卡顿。
          setPasteAvailable(engine.hasClipboard());
        }}
      >
        <div
          ref={containerRef}
          data-board-canvas
          data-board-panel={panelKey}
          data-allow-context-menu
          className={cn(
            "relative h-full w-full overflow-hidden outline-none",
            className,
          )}
          tabIndex={showUi ? 0 : -1}
          aria-hidden={showUi ? undefined : true}
          onPointerMove={handlePointerMove}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onPointerDown={(event) => {
            if (!showUi) return;
            if (event.isPrimary && event.button === 0) {
              isPointerDownRef.current = true;
              applyCursorRef.current();
            }
            const rawTarget = event.target as EventTarget | null;
            const target =
              rawTarget instanceof Element
                ? rawTarget
                : rawTarget instanceof Node
                  ? rawTarget.parentElement
                  : null;
            if (!target?.closest("[data-board-editor]")) {
              // 逻辑：非文本编辑区域点击时才抢占画布焦点，避免打断输入。
              containerRef.current?.focus();
            }
            const rect = containerRef.current?.getBoundingClientRect();
            const worldPoint =
              rect && containerRef.current
                ? engine.screenToWorld([
                    event.clientX - rect.left,
                    event.clientY - rect.top,
                  ])
                : null;
            if (worldPoint) {
              lastPointerWorldRef.current = worldPoint;
            }
            const hitElement = worldPoint
              ? engine.pickElementAt(worldPoint)
              : null;
            const isUiTarget = target
              ? isBoardUiTarget(target, [
                  "[data-connector-drop-panel]",
                  "[data-resize-handle]",
                  "[data-multi-resize-handle]",
                ])
              : false;
            if (snapshot.editingNodeId && !isUiTarget) {
              const isEditingTarget =
                hitElement?.kind === "node" &&
                hitElement.id === snapshot.editingNodeId;
              if (!isEditingTarget) {
                // 逻辑：点击编辑节点外部时退出编辑态。
                engine.setEditingNodeId(null);
              }
            }
            const shouldClear =
              snapshot.activeToolId === "select" &&
              !snapshot.pendingInsert &&
              !snapshot.toolbarDragging &&
              !event.shiftKey &&
              target &&
              hitElement?.kind !== "connector" &&
              hitElement?.kind !== "node" &&
              !isUiTarget;
            if (shouldClear) {
              // 逻辑：空白点击时清空选区，避免残留高亮。
              engine.selection.clear();
            }
          }}
          onDoubleClick={(event) => {
            if (!showUi) return;
            const rawTarget = event.target as EventTarget | null;
            const target =
              rawTarget instanceof Element
                ? rawTarget
                : rawTarget instanceof Node
                  ? rawTarget.parentElement
                  : null;
            if (!target) return;
            // 逻辑：过滤 React portal 冒泡的事件（如文件选择对话框的双击）。
            if (!containerRef.current?.contains(target)) return;
            if (snapshot.pendingInsert || snapshot.toolbarDragging) return;
            if (engine.isLocked()) return;
            if (isBoardUiTarget(target, ["[data-connector-drop-panel]"])) {
              return;
            }
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const worldPoint = engine.screenToWorld([
              event.clientX - rect.left,
              event.clientY - rect.top,
            ]);
            const hitElement = engine.pickElementAt(worldPoint);
            if (hitElement?.kind === "node") {
              handleNodeDoubleClick(hitElement);
            } else if (!hitElement) {
              // 逻辑：双击空白区域时在鼠标位置显示浮动插入菜单。
              if (snapshot.activeToolId !== "select") {
                engine.setActiveTool("select");
              }
              containerRef.current?.dispatchEvent(
                new CustomEvent("openloaf:board-floating-insert-menu", {
                  bubbles: true,
                  detail: {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    worldPoint,
                  },
                }),
              );
            }
          }}
        >
          {children}
          <ConnectorDropPanel
            engine={engine}
            snapshot={snapshot}
            groups={availableTemplateGroups}
            onSelect={handleTemplateSelect}
            panelRef={nodePickerRef}
          />
        </div>
      </BoardContextMenu>
      {saveAsOpen && saveAsNode ? (
        <ProjectFilePickerDialog
          open={saveAsOpen}
          onOpenChange={(next) => {
            setSaveAsOpen(next);
            if (!next) setSaveAsNode(null);
          }}
          title={t('filesystem.saveFileTitle')}
          excludeBoardEntries
          currentBoardFolderUri={fileContext?.boardFolderUri}
          defaultRootUri={fileContext?.rootUri}
          defaultActiveUri={
            fileContext?.rootUri && fileContext?.boardFolderUri
              ? getRelativePathFromUri(fileContext.rootUri, fileContext.boardFolderUri) ?? undefined
              : undefined
          }
          folderSelectMode
          confirmButtonLabel={t('filesystem.saveConfirmLabel')}
          actionButtonLabel={t('filesystem.saveToComputer')}
          onImportFromComputer={() => {
            const node = saveAsNode;
            setSaveAsOpen(false);
            setSaveAsNode(null);
            void saveNodeToComputer(node, fileContext);
          }}
          onSelectFolder={async (info) => {
            const node = saveAsNode;
            const nodeInfo = resolveNodeFileInfo(node, fileContext);
            if (!nodeInfo) return;
            try {
              const response = await fetch(nodeInfo.href);
              if (!response.ok) throw new Error("fetch failed");
              const buffer = await response.arrayBuffer();
              const contentBase64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
              );
              const targetUri = info.uri
                ? `${info.uri}/${nodeInfo.fileName}`
                : nodeInfo.fileName;
              await trpcClient.fs.writeBinary.mutate({
                projectId: info.projectId,
                uri: targetUri,
                contentBase64,
              });
              toast.success(t('filesystem.saveConfirmLabel'));
            } catch {
              toast.error(t('filesystem.cannotResolvePath'));
            }
            setSaveAsOpen(false);
            setSaveAsNode(null);
          }}
        />
      ) : null}
      <VersionStackDeleteDialog
        open={versionDeleteOpen}
        versionCount={versionDeleteCount}
        onCancel={() => {
          setVersionDeleteOpen(false)
          setVersionDeleteIds([])
        }}
        onConfirm={(deleteAll) => {
          setVersionDeleteOpen(false)
          if (deleteAll) {
            engine.forceDeleteSelection(versionDeleteIds)
          } else {
            engine.removeCurrentVersionFromSelection(versionDeleteIds)
          }
          setVersionDeleteIds([])
        }}
      />
    </>
  );
}

type ConnectorDropPanelProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for drop positioning. */
  snapshot: CanvasSnapshot;
  /** Template groups for the grouped picker. */
  groups: TemplateGroup[];
  /** Selection handler for template items. */
  onSelect: (item: TemplateItem) => void;
  /** Ref for the picker panel element. */
  panelRef: RefObject<HTMLDivElement | null>;
};

/** Render the connector drop picker at the correct viewport position. */
function ConnectorDropPanel({
  engine,
  snapshot,
  groups,
  onSelect,
  panelRef,
}: ConnectorDropPanelProps) {
  /** View state used for converting drop coordinates. */
  const viewState = useBoardViewState(engine);
  const connectorDrop = snapshot.connectorDrop;
  if (!connectorDrop) return null;
  // 逻辑：根据当前视口把世界坐标转换为屏幕位置。
  const screen = toScreenPoint(connectorDrop.point, viewState);
  // 逻辑：判断连线拖出方向，面板锚定在落点的拖出侧，保持连线在面板内侧。
  let align: "left" | "right" | "center" = "center";
  const sourceEnd = connectorDrop.source;
  if ("elementId" in sourceEnd) {
    const sourceElement = snapshot.elements.find(
      item => item.id === sourceEnd.elementId
    );
    if (sourceElement?.kind === "node") {
      const [sx, , sw] = sourceElement.xywh;
      const sourceCenterX = sx + sw / 2;
      align = connectorDrop.point[0] >= sourceCenterX ? "left" : "right";
    }
  }
  return (
    <GroupedNodePicker
      ref={panelRef}
      position={screen}
      align={align}
      groups={groups}
      onSelect={onSelect}
      onClose={() => {
        engine.setConnectorDrop(null);
        engine.setConnectorDraft(null);
        engine.setConnectorHover(null);
      }}
    />
  );
}
