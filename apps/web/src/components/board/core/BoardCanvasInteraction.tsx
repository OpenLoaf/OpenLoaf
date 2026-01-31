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
  CanvasConnectorTemplateDefinition,
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { getClipboardInsertPayload } from "../engine/clipboard";
import { isBoardUiTarget } from "../utils/dom";
import { toScreenPoint } from "../utils/coordinates";
import { readImageDragPayload } from "@/lib/image/drag";
import { FILE_DRAG_URI_MIME, FILE_DRAG_URIS_MIME } from "@tenas-ai/ui/tenas/drag-drop-types";
import { fetchBlobFromUri, getPreviewEndpoint, resolveFileName } from "@/lib/image/uri";
import { getStackedImageRect } from "../utils/image-insert";
import type { ImagePreviewPayload } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";
import { NodePicker } from "./NodePicker";
import { openLinkInStack as openLinkInStackAction, resolveLinkTitle } from "../nodes/lib/link-actions";
import type { ImageNodeProps } from "../nodes/ImageNode";
import type { LinkNodeProps } from "../nodes/LinkNode";
import { resolveBoardFolderScope, resolveProjectPathFromBoardUri } from "./boardFilePath";
import { buildLinkNodePayloadFromUrl } from "../utils/link";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { BoardContextMenu } from "./BoardContextMenu";

const EDITABLE_NODE_TYPES = new Set(["text", "image-generate", "image-prompt-generate"]);
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
    textPlain.length > previewLimit ? `${textPlain.slice(0, previewLimit)}...` : textPlain;
  const textHtmlPreview =
    textHtml.length > previewLimit ? `${textHtml.slice(0, previewLimit)}...` : textHtml;
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
          const file = new File([blob], `clipboard-${Date.now()}.${extension}`, {
            type,
          });
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
function buildCursorFallback(url: string, hotspot: [number, number], fallback: string): string {
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
  fallback: string
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
  fallback: string
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
}: BoardCanvasInteractionProps) {
  const showUi = !uiHidden;
  const setStackItemParams = useTabRuntime((state) => state.setStackItemParams);
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
  /** Context menu screen position. */
  const [contextMenuPoint, setContextMenuPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  /** Latest cursor applier used by async loaders. */
  const applyCursorRef = useRef<() => void>(() => {});
  /** Track wheel gesture target to avoid mid-gesture handoff. */
  const wheelGestureRef = useRef<{ mode: "canvas" | "scroll" | null; ts: number }>({
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

  /** Close the context menu. */
  const handleCloseContextMenu = () => {
    setContextMenuPoint(null);
  };

  /** Fit view for context menu. */
  const handleFitView = useCallback(() => {
    engine.fitToElements();
  }, [engine]);

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
        "crosshair"
      );
    }
    if (currentSnapshot.activeToolId === "highlighter") {
      return resolveColoredCursor(
        isPointerDown ? HIGHLIGHTER_CURSOR_DOWN_URL : HIGHLIGHTER_CURSOR_UP_URL,
        highlighterColor,
        HIGHLIGHTER_CURSOR_HOTSPOT,
        "crosshair"
      );
    }
    if (currentSnapshot.activeToolId === "eraser") {
      return buildCursorFallback(
        isPointerDown ? ERASER_CURSOR_DOWN_URL : ERASER_CURSOR_UP_URL,
        ERASER_CURSOR_HOTSPOT,
        "auto"
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
  }, [snapshot.activeToolId, snapshot.draggingId, snapshot.pendingInsert, penColor, highlighterColor]);

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
          payload
        ): payload is Extract<typeof payloads[number], { kind: "image" }> =>
          payload.kind === "image"
      );
      if (imagePayloads.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const center = lastPointerWorldRef.current ?? engine.getViewportCenterWorld();
      void insertImageFilesAtPoint(
        imagePayloads.map((payload) => payload.file),
        center
      );
    };
    document.addEventListener("paste", handleGlobalPaste, { capture: true });
    return () => {
      document.removeEventListener("paste", handleGlobalPaste, { capture: true });
    };
  }, [engine, showUi]);

  useEffect(() => {
    if (!showUi) return;
    const container = containerRef.current;
    if (!container) return;
    const handleWheelCapture = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const scrollTarget = target.closest("[data-board-scroll]") as HTMLElement | null;
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
      });
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
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, [showUi]);

  useEffect(() => {
    if (!snapshot.editingNodeId) return;
    const exists = snapshot.elements.some(
      (element) => element.id === snapshot.editingNodeId
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
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
    };
  }, [engine, snapshot.connectorDrop]);

  const insertImageFilesAtPoint = async (files: File[], center: CanvasPoint) => {
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
      const linkPayload = buildLinkNodePayloadFromUrl(payload.url);
      const [width, height] = linkPayload.size;
      // 逻辑：以菜单触发点为中心插入链接节点。
      engine.addNodeElement("link", linkPayload.props, [
        pastePoint[0] - width / 2,
        pastePoint[1] - height / 2,
        width,
        height,
      ]);
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
      setStackItemParams(tabId, panelKey, { __refreshKey: Date.now() });
      return;
    }
    engine.refreshView();
  };

  const handleCanvasDragOver = (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    const typeList = Array.from(types);
    const hasFiles = typeList.includes("Files");
    const hasUri = typeList.includes(FILE_DRAG_URI_MIME);
    if (!hasFiles && !hasUri && !readImageDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = async (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    const typeList = Array.from(types);
    const hasFiles = typeList.includes("Files");
    const hasUri = typeList.includes(FILE_DRAG_URI_MIME);
    if (!hasFiles && !hasUri && !readImageDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    if (engine.isLocked()) return;

    const { clientX, clientY, dataTransfer } = event;
    const imagePayload = readImageDragPayload(dataTransfer);
    const droppedFiles = Array.from(dataTransfer.files);
    const imageFiles = imagePayload
      ? []
      : droppedFiles.filter((file) => file.type.startsWith("image/"));
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
                (item): item is string => typeof item === "string" && item.length > 0
              );
            }
          } catch {
            return [];
          }
          return [];
        })();
        const uniqueUris =
          dragUris.length > 0 ? Array.from(new Set(dragUris)) : [imagePayload.baseUri];
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
    if (imageFiles.length === 0) return;
    await insertImageFilesAtPoint(imageFiles, dropPoint);
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

  const openImagePreviewFromNode = (element: CanvasNodeElement) => {
    if (element.type !== "image") return;
    const props = element.props as ImageNodeProps;
    const originalSrc = props.originalSrc || "";
    const projectRelativeOriginal = resolveProjectRelativePath(originalSrc);
    const resolvedOriginal = projectRelativeOriginal
      ? getPreviewEndpoint(projectRelativeOriginal, { projectId })
      : originalSrc;
    const previewSrc = props.previewSrc || "";
    const projectRelativePreview = resolveProjectRelativePath(previewSrc);
    const resolvedPreview = projectRelativePreview
      ? getPreviewEndpoint(projectRelativePreview, { projectId })
      : previewSrc;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(originalSrc);
    const canUseOriginal =
      hasScheme &&
      (resolvedOriginal.startsWith("data:") ||
        resolvedOriginal.startsWith("blob:") ||
        resolvedOriginal.startsWith("http://") ||
        resolvedOriginal.startsWith("https://"));
    const finalOriginal = projectRelativeOriginal
      ? resolvedOriginal
      : canUseOriginal
      ? resolvedOriginal
      : "";
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
    if (element.type === "link") {
      const props = element.props as LinkNodeProps;
      openLinkInStackAction({
        url: props.url,
        title: resolveLinkTitle(props.url, props.title),
      });
      return;
    }
    if (element.type === "image") {
      engine.setEditingNodeId(element.id);
      openImagePreviewFromNode(element);
      return;
    }
    if (EDITABLE_NODE_TYPES.has(element.type)) {
      engine.selection.setSelection([element.id]);
      engine.setEditingNodeId(element.id);
    }
  };

  const availableTemplates = useMemo(() => {
    if (!snapshot.connectorDrop) return [];
    const sourceElementId =
      "elementId" in snapshot.connectorDrop.source
        ? snapshot.connectorDrop.source.elementId
        : "";
    const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
    if (!source || source.kind !== "node") return [];
    // 逻辑：可用节点由源节点定义提供，避免全局模板硬编码。
    const definition = engine.nodes.getDefinition(source.type);
    if (!definition?.connectorTemplates) return [];
    return definition.connectorTemplates(source as CanvasNodeElement);
  }, [engine, snapshot.connectorDrop]);

  const handleTemplateSelect = (templateId: string) => {
    if (!snapshot.connectorDrop) return;
    const template = availableTemplates.find((item) => item.id === templateId);
    if (!template) return;

    const sourceElementId =
      "elementId" in snapshot.connectorDrop.source
        ? snapshot.connectorDrop.source.elementId
        : "";
    const { type, props } = template.createNode({ sourceElementId });
    const [width, height] = template.size;
    const xywh: [number, number, number, number] = [
      snapshot.connectorDrop.point[0] - width / 2,
      snapshot.connectorDrop.point[1] - height / 2,
      width,
      height,
    ];
    const id = engine.addNodeElement(type, props, xywh);
    if (id) {
      engine.addConnectorElement({
        source: snapshot.connectorDrop.source,
        target: { elementId: id },
        style: engine.getConnectorStyle(),
      });
    }
    engine.setConnectorDrop(null);
    engine.setConnectorDraft(null);
    engine.setConnectorHover(null);
  };

  return (
    <>
      <div
        ref={containerRef}
        data-board-canvas
        data-board-panel={panelKey}
        data-allow-context-menu
        className={cn("relative h-full w-full overflow-hidden outline-none", className)}
        tabIndex={showUi ? 0 : -1}
        aria-hidden={showUi ? undefined : true}
        onPointerMove={handlePointerMove}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        onContextMenu={(event) => {
          if (!showUi) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          // 逻辑：记录右键位置，保证“粘贴”落点与菜单一致。
          lastContextMenuWorldRef.current = engine.screenToWorld([
            event.clientX - rect.left,
            event.clientY - rect.top,
          ]);
          setContextMenuPoint({ x: event.clientX, y: event.clientY });
          void updatePasteAvailability();
        }}
        onPointerDown={(event) => {
          if (!showUi) return;
          if (contextMenuPoint) {
            // 逻辑：左键按下时关闭右键菜单。
            setContextMenuPoint(null);
          }
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
              ? engine.screenToWorld([event.clientX - rect.left, event.clientY - rect.top])
              : null;
          if (worldPoint) {
            lastPointerWorldRef.current = worldPoint;
          }
          const hitElement = worldPoint ? engine.pickElementAt(worldPoint) : null;
          const isUiTarget = target
            ? isBoardUiTarget(target, [
                "[data-connector-drop-panel]",
                "[data-resize-handle]",
                "[data-multi-resize-handle]",
              ])
            : false;
          if (snapshot.editingNodeId && !isUiTarget) {
            const isEditingTarget =
              hitElement?.kind === "node" && hitElement.id === snapshot.editingNodeId;
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
          if (snapshot.activeToolId !== "select") return;
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
          }
        }}
      >
        {children}
        <ConnectorDropPanel
          engine={engine}
          snapshot={snapshot}
          templates={availableTemplates}
          onSelect={handleTemplateSelect}
          panelRef={nodePickerRef}
        />
      </div>
      {contextMenuPoint ? (
        <BoardContextMenu
          point={contextMenuPoint}
          onClose={handleCloseContextMenu}
          onAutoLayout={handleAutoLayout}
          onFitView={handleFitView}
          onRefresh={handlePanelRefresh}
          onPaste={() => {
            void handlePasteFromContextMenu();
          }}
          pasteAvailable={pasteAvailable}
          pasteDisabled={engine.isLocked()}
        />
      ) : null}
    </>
  );
}

type ConnectorDropPanelProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for drop positioning. */
  snapshot: CanvasSnapshot;
  /** Templates available for the picker. */
  templates: CanvasConnectorTemplateDefinition[];
  /** Selection handler for templates. */
  onSelect: (templateId: string) => void;
  /** Ref for the picker panel element. */
  panelRef: RefObject<HTMLDivElement | null>;
};

/** Render the connector drop picker at the correct viewport position. */
function ConnectorDropPanel({
  engine,
  snapshot,
  templates,
  onSelect,
  panelRef,
}: ConnectorDropPanelProps) {
  /** View state used for converting drop coordinates. */
  const viewState = useBoardViewState(engine);
  const connectorDrop = snapshot.connectorDrop;
  if (!connectorDrop) return null;
  // 逻辑：根据当前视口把世界坐标转换为屏幕位置。
  const screen = toScreenPoint(connectorDrop.point, viewState);
  return (
    <NodePicker ref={panelRef} position={screen} templates={templates} onSelect={onSelect} />
  );
}
