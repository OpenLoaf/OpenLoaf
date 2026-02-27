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
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { ComponentType, CSSProperties, ForwardRefExoticComponent } from "react";
import { Play } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { cn } from "@udecode/cn";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasSnapshot } from "../engine/types";
import { HoverPanel, IconBtn, PanelItem, toolbarSurfaceClassName } from "../ui/ToolbarParts";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/imageGenerate";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/imagePromptGenerate";
import { VIDEO_GENERATE_NODE_TYPE } from "../nodes/videoGenerate";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/TextNode";
import { useBoardContext } from "../core/BoardProvider";
import { fileToBase64 } from "../utils/base64";
import {
  IMAGE_EXTS,
  VIDEO_EXTS,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  ProjectFilePickerDialog,
  type ProjectFilePickerSelection,
} from "@/components/project/filesystem/components/ProjectFilePickerDialog";
import {
  getParentRelativePath,
  getRelativePathFromUri,
  buildChildUri,
  getUniqueName,
} from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { trpcClient } from "@/utils/trpc";

export interface BoardToolbarProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for tool state. */
  snapshot: CanvasSnapshot;
}

type ToolMode = "select" | "hand" | "pen" | "highlighter" | "eraser";

type IconProps = LucideProps;

type IconComponent = ComponentType<IconProps> | ForwardRefExoticComponent<IconProps>;

const PEN_SIZES = [3, 6, 10, 14];
const PEN_COLORS = ["#202124", "#1a73e8", "#f9ab00", "#d93025", "#188038"];

type InsertItem = {
  id: string;
  title: string;
  description: string;
  icon: IconComponent;
  /** Node type inserted by this item. */
  nodeType?: string;
  /** Optional custom props for the inserted node. */
  props?: Record<string, unknown>;
  size: [number, number];
  opensPicker?: boolean;
};

/** Label mapping for toolbar tooltips. */
const TOOL_LABELS = {
  select: "选择",
  hand: "拖拽",
  pen: "画笔",
  highlighter: "荧光笔",
  eraser: "橡皮",
  note: "便签",
  image: "图片",
  video: "视频",
  calendar: "日历",
} as const;

/** Shortcut mapping for tooltips. */
const TOOL_SHORTCUTS = {
  select: "A",
  hand: "W",
  pen: "P",
  highlighter: "K",
  eraser: "E",
} as const;

/** Label mapping for insert tool tooltips. */
const INSERT_TOOL_LABELS: Record<string, string> = {
  note: TOOL_LABELS.note,
  image: TOOL_LABELS.image,
  video: TOOL_LABELS.video,
  calendar: TOOL_LABELS.calendar,
};

/** Build a tooltip label with optional shortcut suffix. */
function buildToolTitle(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

const BRUSH_SVG_SRC = "/board/brush.svg";
const CALENDAR_SVG_SRC = "/board/calendar-svgrepo-com.svg";
const HIGHLIGHTER_SVG_SRC = "/board/highlighter.svg";
const ERASER_SVG_SRC = "/board/eraser.svg";
const SELECT_SVG_SRC = "/board/select-cursor-svgrepo-com.svg";
const DRAG_SVG_SRC = "/board/drag-svgrepo-com.svg";
const NOTE_SVG_SRC = "/board/notes-note-svgrepo-com.svg";
const PICTURE_SVG_SRC = "/board/picture-photo-svgrepo-com.svg";
const VIDEO_SVG_SRC = "/board/video-player-movie-svgrepo.svg";
const FOLDER_SVG_SRC = "/board/folder-svgrepo-com.svg";
/** Svg source for the image prompt generate icon. */
const IMAGE_PROMPT_SVG_SRC = "/board/converted_small.svg";
/** Svg source for the image generate icon. */
const IMAGE_GENERATE_SVG_SRC = "/board/pictures-svgrepo-com.svg";
const DEFAULT_VIDEO_WIDTH = 16;
const DEFAULT_VIDEO_HEIGHT = 9;
const DEFAULT_VIDEO_NODE_MAX = 420;

type PendingInsertStackItem = {
  type: string;
  props: Record<string, unknown>;
  size?: [number, number];
};

/** Compute a fitted size that preserves the original aspect ratio. */
const fitSize = (width: number, height: number, maxDimension: number): [number, number] => {
  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) {
    return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
  }
  const scale = maxDimension / maxSide;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
};

const prefixSvgIds = (svg: string, prefix: string) => {
  const safePrefix = prefix.replace(/:/g, "");
  return svg
    .replace(/id="([^"]+)"/g, `id="${safePrefix}-$1"`)
    .replace(/url\\(#([^)]+)\\)/g, `url(#${safePrefix}-$1)`)
    .replace(/xlink:href="#([^"]+)"/g, `xlink:href="#${safePrefix}-$1"`)
    .replace(/href="#([^"]+)"/g, `href="#${safePrefix}-$1"`);
};

const normalizeSvgRootSize = (svg: string) => {
  const withWidth = svg.replace(/<svg([^>]*?)width="[^"]*"/, '<svg$1width="100%"');
  return withWidth.replace(/<svg([^>]*?)height="[^"]*"/, '<svg$1height="100%"');
};

/** Cache for loaded public svg markup. */
const svgCache = new Map<string, string>();

function InlineSvg(props: {
  svg: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { svg, className, style } = props;
  const id = useId();
  const html = useMemo(() => {
    const withIds = prefixSvgIds(svg, id);
    return normalizeSvgRootSize(withIds);
  }, [id, svg]);
  return (
    <span
      className={cn("inline-flex", className)}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Load svg markup from public assets with a small client cache. */
function usePublicSvg(src: string) {
  const [svg, setSvg] = useState<string | null>(() => svgCache.get(src) ?? null);

  useEffect(() => {
    if (svgCache.has(src)) {
      setSvg(svgCache.get(src) ?? null);
      return;
    }
    let active = true;
    // 逻辑：首次加载时从 public 拉取 svg 文本并缓存，避免重复请求。
    fetch(src)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!active || !text) return;
        svgCache.set(src, text);
        setSvg(text);
      })
      .catch(() => {
        // 逻辑：加载失败时保持静默，避免影响工具栏交互。
      });
    return () => {
      active = false;
    };
  }, [src]);

  return svg;
}

/** Render inline svg loaded from public path. */
function InlineSvgFile({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  const svg = usePublicSvg(src);
  if (!svg) {
    return (
      <span
        className={cn("inline-flex", className)}
        style={style}
        aria-hidden="true"
      />
    );
  }
  return <InlineSvg svg={svg} className={className} style={style} />;
}

function SelectIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={SELECT_SVG_SRC}
      className={cn("[&>svg]:fill-current", className)}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function HandIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={DRAG_SVG_SRC}
      className={cn("[&>svg]:fill-current", className)}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

/** Render the image prompt generate icon for toolbar items. */
function ImagePromptGenerateIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={IMAGE_PROMPT_SVG_SRC}
      className={cn("inline-flex", className)}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

/** Render the image generate icon for toolbar items. */
function ImageGenerateIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={IMAGE_GENERATE_SVG_SRC}
      className={cn("inline-flex", className)}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

/** Render the calendar icon with shared sizing props. */
function CalendarIcon(props: IconProps) {
  const { size = 20, className } = props;
  return (
    <InlineSvgFile
      src={CALENDAR_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function ImageIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={PICTURE_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function VideoIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={VIDEO_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function PageIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={NOTE_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function BrushToolIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <InlineSvgFile src={BRUSH_SVG_SRC} className={className} style={style} />;
}

function HighlighterToolIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <InlineSvgFile src={HIGHLIGHTER_SVG_SRC} className={className} style={style} />;
}

function EraserToolIcon({ className }: { className?: string }) {
  return <InlineSvgFile src={ERASER_SVG_SRC} className={className} />;
}

const INSERT_ITEMS: InsertItem[] = [
  {
    id: "note",
    title: "笔记",
    description: "快速笔记卡片。",
    icon: PageIcon,
    nodeType: "text",
    props: { autoFocus: true },
    size: [200, TEXT_NODE_DEFAULT_HEIGHT],
  },
  {
    id: "image",
    title: "图片",
    description: "图片块。",
    icon: ImageIcon,
    size: [320, 220],
    opensPicker: true,
  },
  {
    id: "video",
    title: "视频",
    description: "视频块。",
    icon: VideoIcon,
    size: [360, 240],
    opensPicker: true,
  },
  {
    id: "calendar",
    title: "日历",
    description: "日历面板块。",
    icon: CalendarIcon,
    nodeType: "calendar",
    props: {},
    size: [360, 320],
  },
];

/** Generate tool entries for the toolbar flyout. */
const GENERATE_INSERT_ITEMS: InsertItem[] = [
  {
    id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    title: "图片提示词",
    description: "分析图片并生成描述",
    icon: ImagePromptGenerateIcon,
    nodeType: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    props: {},
    size: [320, 220],
  },
  {
    id: IMAGE_GENERATE_NODE_TYPE,
    title: "图片生成",
    description: "输入图片与文字生成新图",
    icon: ImageGenerateIcon,
    nodeType: IMAGE_GENERATE_NODE_TYPE,
    props: {},
    size: [320, 260],
  },
  {
    id: VIDEO_GENERATE_NODE_TYPE,
    title: "生成视频",
    description: "基于图片与提示词生成视频",
    icon: Play,
    nodeType: VIDEO_GENERATE_NODE_TYPE,
    props: {},
    size: [360, 280],
  },
];

/** Render the bottom toolbar for the board canvas. */
const BoardToolbar = memo(function BoardToolbar({ engine, snapshot }: BoardToolbarProps) {
  // 悬停展开的组 id（用字符串常量标识）
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  /** Whether the generate panel should stay pinned open. */
  const [insertPanelPinned, setInsertPanelPinned] = useState(false);
  // 逻辑：记录生成面板的延迟关闭计时器，避免鼠标移出即消失。
  const insertPanelHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const { fileContext } = useBoardContext();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const imageImportInputRef = useRef<HTMLInputElement | null>(null);
  const videoImportInputRef = useRef<HTMLInputElement | null>(null);
  const isSelectTool = snapshot.activeToolId === "select";
  const isHandTool = snapshot.activeToolId === "hand";
  const isPenTool = snapshot.activeToolId === "pen" || snapshot.activeToolId === "highlighter";
  const isEraserTool = snapshot.activeToolId === "eraser";
  const isLocked = snapshot.locked;
  const pendingInsert = snapshot.pendingInsert;
  const penPanelOpen = !isLocked && (hoverGroup === "pen" || isPenTool);
  const insertPanelOpen = !isLocked && (hoverGroup === "insert" || insertPanelPinned);

  const [penVariant, setPenVariant] = useState<"pen" | "highlighter">("pen");
  const [penSize, setPenSize] = useState<number>(6);
  const [penColor, setPenColor] = useState<string>("#f9ab00");
  const selectTitle = buildToolTitle(TOOL_LABELS.select, TOOL_SHORTCUTS.select);
  const handTitle = buildToolTitle(TOOL_LABELS.hand, TOOL_SHORTCUTS.hand);
  const penTitle = buildToolTitle(TOOL_LABELS.pen, TOOL_SHORTCUTS.pen);
  const highlighterTitle = buildToolTitle(
    TOOL_LABELS.highlighter,
    TOOL_SHORTCUTS.highlighter
  );
  const eraserTitle = buildToolTitle(TOOL_LABELS.eraser, TOOL_SHORTCUTS.eraser);
  const toolbarDragRef = useRef<{
    request: CanvasInsertRequest;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [toolbarDragging, setToolbarDragging] = useState(false);
  const imageAcceptAttr = useMemo(
    () => Array.from(IMAGE_EXTS).map((ext) => `.${ext}`).join(","),
    []
  );
  const videoAcceptAttr = useMemo(
    () => Array.from(VIDEO_EXTS).map((ext) => `.${ext}`).join(","),
    []
  );

  useEffect(() => {
    // 逻辑：同步画笔配置到画布引擎，保持绘制体验一致。
    engine.setPenSettings({ size: penSize, color: penColor, opacity: 1 });
    engine.setHighlighterSettings({ size: penSize, color: penColor, opacity: 0.35 });
  }, [engine, penColor, penSize]);

  useEffect(() => {
    if (snapshot.activeToolId === "pen") {
      setPenVariant("pen");
    } else if (snapshot.activeToolId === "highlighter") {
      setPenVariant("highlighter");
    }
  }, [snapshot.activeToolId]);

  useEffect(() => {
    if (!isLocked) return;
    // 逻辑：锁定画布时关闭悬浮面板，避免残留交互入口。
    setHoverGroup(null);
    setInsertPanelPinned(false);
  }, [isLocked]);

  useEffect(() => {
    return () => {
      if (insertPanelHideTimerRef.current) {
        clearTimeout(insertPanelHideTimerRef.current);
        insertPanelHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hoverGroup && !insertPanelPinned) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const container = toolbarRef.current;
      if (!container || !target) return;
      // 逻辑：点击工具条外部时关闭子面板。
      if (container.contains(target)) return;
      if (hoverGroup === "pen" && isPenTool) {
        if (insertPanelPinned) {
          // 逻辑：点击外部时优先关闭生成面板，保留画笔面板。
          setInsertPanelPinned(false);
        }
        return;
      }
      setHoverGroup(null);
      setInsertPanelPinned(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [hoverGroup, insertPanelPinned, isPenTool]);

  const handleToolChange = useCallback(
    (tool: ToolMode, options?: { keepPanel?: boolean }) => {
      if (isLocked && (tool === "pen" || tool === "highlighter" || tool === "eraser")) {
        return;
      }
      engine.setActiveTool(tool);
      if (tool === "pen" || tool === "highlighter") {
        setPenVariant(tool);
      }
      if (!options?.keepPanel) {
        setHoverGroup(null);
      }
    },
    [engine, isLocked]
  );

  /** Update pending insert requests for one-shot placement. */
  const handleInsertRequest = useCallback(
    (request: CanvasInsertRequest) => {
      if (isLocked) return;
      engine.getContainer()?.focus();
      if (pendingInsert?.id === request.id) {
        engine.setPendingInsert(null);
        return;
      }
      engine.setPendingInsert(request);
      setHoverGroup(null);
      setInsertPanelPinned(false);
    },
    [engine, isLocked, pendingInsert?.id]
  );

  /** Persist a file into the board assets folder. */
  const saveBoardAssetFile = useCallback(
    async (file: File, fallbackName: string) => {
      if (!workspaceId || !fileContext?.boardFolderUri) return "";
      const assetsFolderUri = buildChildUri(
        fileContext.boardFolderUri,
        BOARD_ASSETS_DIR_NAME
      );
      await trpcClient.fs.mkdir.mutate({
        workspaceId,
        projectId: fileContext?.projectId,
        uri: assetsFolderUri,
        recursive: true,
      });
      const existing = await trpcClient.fs.list.query({
        workspaceId,
        projectId: fileContext?.projectId,
        uri: assetsFolderUri,
      });
      const existingNames = new Set((existing.entries ?? []).map((entry) => entry.name));
      const safeName = (file.name || fallbackName).replace(/[\\/]/g, "-") || fallbackName;
      const uniqueName = getUniqueName(safeName, existingNames);
      const targetUri = buildChildUri(assetsFolderUri, uniqueName);
      const contentBase64 = await fileToBase64(file);
      await trpcClient.fs.writeBinary.mutate({
        workspaceId,
        projectId: fileContext?.projectId,
        uri: targetUri,
        contentBase64,
      });
      return `${BOARD_ASSETS_DIR_NAME}/${uniqueName}`;
    },
    [fileContext?.boardFolderUri, fileContext?.projectId, workspaceId]
  );

  /** Build a preview poster from a local video file. */
  const buildVideoPosterFromFile = useCallback(async (file: File) => {
    if (typeof document === "undefined") return null;
    return await new Promise<{ posterSrc: string; width: number; height: number } | null>(
      (resolve) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        const cleanup = () => {
          URL.revokeObjectURL(url);
          video.removeAttribute("src");
          video.load();
        };
        const capture = () => {
          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;
          if (!width || !height) {
            cleanup();
            resolve(null);
            return;
          }
          // 逻辑：限制预览尺寸，避免超大视频导致内存飙升。
          const [previewWidth, previewHeight] = fitSize(width, height, 640);
          const canvas = document.createElement("canvas");
          canvas.width = previewWidth;
          canvas.height = previewHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, previewWidth, previewHeight);
          }
          const posterSrc = ctx ? canvas.toDataURL("image/jpeg", 0.82) : "";
          cleanup();
          resolve({ posterSrc, width, height });
        };
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = capture;
        video.onerror = () => {
          cleanup();
          resolve(null);
        };
        video.src = url;
      }
    );
  }, []);

  /** Trigger the hidden file input. */
  const openImportDialog = useCallback((inputRef: React.RefObject<HTMLInputElement | null>) => {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);


  const getWorldPointFromEvent = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLButtonElement>) => {
      const container = engine.getContainer();
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return engine.screenToWorld([
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
    },
    [engine]
  );

  const placeInsertAtPoint = useCallback(
    (request: CanvasInsertRequest, point: [number, number]) => {
      const [width, height] = request.size ?? [320, 180];
      engine.addNodeElement(request.type, request.props, [
        point[0] - width / 2,
        point[1] - height / 2,
        width,
        height,
      ]);
      engine.setPendingInsert(null);
    },
    [engine]
  );

  useEffect(() => {
    if (!toolbarDragging) return;
    const handlePointerMove = (event: PointerEvent) => {
      const drag = toolbarDragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const worldPoint = getWorldPointFromEvent(event);
      if (worldPoint) {
        engine.setPendingInsertPoint(worldPoint);
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      const drag = toolbarDragRef.current;
      toolbarDragRef.current = null;
      setToolbarDragging(false);
      engine.setToolbarDragging(false);
      if (!drag || !drag.moved) {
        if (drag && drag.request.id === "note" && !engine.isLocked()) {
          engine.setPendingInsert(drag.request);
        }
        return;
      }
      const worldPoint = getWorldPointFromEvent(event);
      if (!worldPoint || engine.isLocked()) {
        engine.setPendingInsert(null);
        return;
      }
      const hit = engine.pickElementAt(worldPoint);
      if (hit?.kind === "node") {
        engine.setPendingInsert(null);
        return;
      }
      placeInsertAtPoint(drag.request, worldPoint);
    };
    document.addEventListener("pointermove", handlePointerMove, { capture: true });
    document.addEventListener("pointerup", handlePointerUp, { capture: true });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, { capture: true });
      document.removeEventListener("pointerup", handlePointerUp, { capture: true });
    };
  }, [engine, getWorldPointFromEvent, placeInsertAtPoint, toolbarDragging]);

  /** Open the project file picker for images. */
  const handlePickImage = useCallback(() => {
    if (isLocked) return;
    setImagePickerOpen(true);
  }, [isLocked]);

  const handleImportImageFromComputer = useCallback(() => {
    if (isLocked) return;
    openImportDialog(imageImportInputRef);
  }, [isLocked, openImportDialog]);

  const handleImportVideoFromComputer = useCallback(() => {
    if (isLocked) return;
    openImportDialog(videoImportInputRef);
  }, [isLocked, openImportDialog]);

  /** Insert images from local files into the canvas. */
  const handleImportImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => {
        if (file.type.startsWith("image/")) return true;
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        return IMAGE_EXTS.has(ext);
      });
      if (imageFiles.length === 0) return;
      const payloads = [];
      for (const file of imageFiles) {
        payloads.push(await engine.buildImagePayloadFromFile(file));
      }
      if (payloads.length === 1) {
        const payload = payloads[0]!;
        handleInsertRequest({
          id: "image",
          type: "image",
          props: payload.props,
          size: payload.size,
        });
        return;
      }
      const previewStack = payloads
        .map((payload) => payload.props.previewSrc || payload.props.originalSrc || "")
        .filter((src) => src.length > 0);
      const stackItems = payloads.map((payload) => ({
        type: "image",
        props: payload.props,
        size: payload.size,
      }));
      const [maxWidth, maxHeight] = payloads.reduce<[number, number]>(
        (acc, payload) => [
          Math.max(acc[0], payload.size[0]),
          Math.max(acc[1], payload.size[1]),
        ],
        [0, 0]
      );
      // 逻辑：本地导入多图进入待放置模式，鼠标预览显示叠加缩略图。
      handleInsertRequest({
        id: "image",
        type: "image",
        props: {
          previewStack,
          stackItems,
        },
        size: [maxWidth, maxHeight],
      });
    },
    [engine, handleInsertRequest]
  );

  /** Insert videos from local files into the canvas. */
  const handleImportVideoFiles = useCallback(
    async (files: File[]) => {
      const videoFiles = files.filter((file) => {
        if (file.type.startsWith("video/")) return true;
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        return VIDEO_EXTS.has(ext);
      });
      if (videoFiles.length === 0) return;
      const items: PendingInsertStackItem[] = [];
      for (const file of videoFiles) {
        const relativePath = await saveBoardAssetFile(file, "video.mp4");
        if (!relativePath) continue;
        const poster = await buildVideoPosterFromFile(file);
        const naturalWidth = poster?.width ?? DEFAULT_VIDEO_WIDTH;
        const naturalHeight = poster?.height ?? DEFAULT_VIDEO_HEIGHT;
        const [nodeWidth, nodeHeight] = fitSize(
          naturalWidth,
          naturalHeight,
          DEFAULT_VIDEO_NODE_MAX
        );
        items.push({
          type: "video",
          props: {
            sourcePath: relativePath,
            fileName: file.name,
            posterPath: poster?.posterSrc || undefined,
            naturalWidth,
            naturalHeight,
          },
          size: [nodeWidth, nodeHeight],
        });
      }
      if (items.length === 0) return;
      if (items.length === 1) {
        const item = items[0]!;
        handleInsertRequest({
          id: "video",
          type: "video",
          props: item.props,
          size: item.size,
        });
        return;
      }
      const previewStack = items
        .map((item) => {
          const props = item.props as { posterPath?: string };
          return props.posterPath || "";
        })
        .filter((src) => src.length > 0);
      const [maxWidth, maxHeight] = items.reduce<[number, number]>(
        (acc, item) => [
          Math.max(acc[0], item.size?.[0] ?? 0),
          Math.max(acc[1], item.size?.[1] ?? 0),
        ],
        [0, 0]
      );
      // 逻辑：本地导入多视频进入待放置模式，鼠标预览显示叠加缩略图。
      handleInsertRequest({
        id: "video",
        type: "video",
        props: {
          previewStack,
          stackItems: items,
        },
        size: [maxWidth, maxHeight],
      });
    },
    [buildVideoPosterFromFile, handleInsertRequest, saveBoardAssetFile]
  );

  const handleImportImageInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      await handleImportImageFiles(files);
    },
    [handleImportImageFiles]
  );

  const handleImportVideoInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      await handleImportVideoFiles(files);
    },
    [handleImportVideoFiles]
  );

  /** Handle inserting selected image entries. */
  const handleImageSelected = useCallback(
    async (selection: ProjectFilePickerSelection | ProjectFilePickerSelection[]) => {
      const selections = Array.isArray(selection) ? selection : [selection];
      const imageSelections = selections.filter((item) =>
        IMAGE_EXTS.has(item.entry.name.split(".").pop()?.toLowerCase() ?? "")
      );
      if (imageSelections.length === 0) return;
      const payloads = [];
      for (const item of imageSelections) {
        payloads.push(
          await buildImageNodePayloadFromUri(item.fileRef, { projectId: item.projectId })
        );
      }
      if (payloads.length === 1) {
        const payload = payloads[0]!;
        handleInsertRequest({
          id: "image",
          type: "image",
          props: payload.props,
          size: payload.size,
        });
        return;
      }
      const previewStack = payloads
        .map((payload) => payload.props.previewSrc || payload.props.originalSrc || "")
        .filter((src) => src.length > 0);
      const stackItems = payloads.map((payload) => ({
        type: "image",
        props: payload.props,
        size: payload.size,
      }));
      const [maxWidth, maxHeight] = payloads.reduce<[number, number]>(
        (acc, payload) => [
          Math.max(acc[0], payload.size[0]),
          Math.max(acc[1], payload.size[1]),
        ],
        [0, 0]
      );
      // 逻辑：多选图片进入待放置模式，鼠标预览显示叠加缩略图。
      handleInsertRequest({
        id: "image",
        type: "image",
        props: {
          previewStack,
          stackItems,
        },
        size: [maxWidth, maxHeight],
      });
    },
    [engine, handleInsertRequest]
  );

  /** Open the project file picker for videos. */
  const handlePickVideo = useCallback(() => {
    if (isLocked) return;
    setVideoPickerOpen(true);
  }, [isLocked]);

  const handleVideoSelected = useCallback(
    async (selection: ProjectFilePickerSelection | ProjectFilePickerSelection[]) => {
      const selections = Array.isArray(selection) ? selection : [selection];
      const videoSelections = selections.filter((item) =>
        VIDEO_EXTS.has(item.entry.name.split(".").pop()?.toLowerCase() ?? "")
      );
      if (videoSelections.length === 0) return;
      const payloads = [];
      for (const item of videoSelections) {
        const metadata = await fetchVideoMetadata({
          workspaceId,
          projectId: item.projectId,
          uri: item.entry.uri,
        });
        // 逻辑：优先使用视频元数据计算比例，避免缩略图导致比例偏差。
        const naturalWidth = metadata?.width ?? DEFAULT_VIDEO_WIDTH;
        const naturalHeight = metadata?.height ?? DEFAULT_VIDEO_HEIGHT;
        const [nodeWidth, nodeHeight] = fitSize(
          naturalWidth,
          naturalHeight,
          DEFAULT_VIDEO_NODE_MAX
        );
        payloads.push({
          type: "video",
          props: {
            sourcePath: item.fileRef,
            fileName: item.entry.name,
            posterPath: item.thumbnailSrc,
            naturalWidth,
            naturalHeight,
          },
          size: [nodeWidth, nodeHeight] as [number, number],
        });
      }
      if (payloads.length === 1) {
        const payload = payloads[0]!;
        handleInsertRequest({
          id: "video",
          type: "video",
          props: payload.props,
          size: payload.size,
        });
        return;
      }
      const previewStack = payloads
        .map((payload) => payload.props.posterPath || "")
        .filter((src) => src.length > 0);
      const [maxWidth, maxHeight] = payloads.reduce<[number, number]>(
        (acc, payload) => [
          Math.max(acc[0], payload.size[0]),
          Math.max(acc[1], payload.size[1]),
        ],
        [0, 0]
      );
      // 逻辑：多选视频进入待放置模式，鼠标预览显示叠加缩略图。
      handleInsertRequest({
        id: "video",
        type: "video",
        props: {
          previewStack,
          stackItems: payloads,
        },
        size: [maxWidth, maxHeight],
      });
    },
    [engine, workspaceId]
  );

  const defaultPickerActiveUri = useMemo(() => {
    const rootUri = fileContext?.rootUri?.trim() ?? "";
    const boardFolderUri = fileContext?.boardFolderUri?.trim() ?? "";
    if (!rootUri || !boardFolderUri) return undefined;
    const relativeBoardPath = getRelativePathFromUri(rootUri, boardFolderUri);
    if (!relativeBoardPath) return undefined;
    const parentRelative = getParentRelativePath(relativeBoardPath);
    if (parentRelative === null) return "";
    return parentRelative;
  }, [fileContext?.boardFolderUri, fileContext?.rootUri]);

  // 统一按钮尺寸（“宽松”密度）
  const iconSize = 20;
  /** 底部工具栏图标尺寸。 */
  const toolbarIconSize = 22;
  /** 中间插入工具图标尺寸（直接使用放大后的尺寸）。 */
  const insertIconSize = 26;
  /** 底部工具栏图标 hover 放大样式。 */
  const toolbarIconClassName =
    "origin-center transition-transform duration-150 ease-out group-hover:scale-[1.2]";
  /** 中间插入工具图标 hover 旋转样式。 */
  const insertIconClassName =
    "origin-center transition-transform duration-150 ease-out group-hover:-rotate-15";
  /** 生成工具子面板圆弧半径。 */
  const generateArcRadius = 72;
  /** 生成工具子面板圆弧起止角度（度数）。 */
  const generateArcRange: [number, number] = [-130, -50];
  /** 生成工具子面板整体下移偏移量。 */
  const generateArcOffsetY = 30;

  return (
    <div
      ref={toolbarRef}
      data-canvas-toolbar
      onPointerDown={event => {
        // 逻辑：阻止工具条交互触发画布选择。
        event.stopPropagation();
      }}
      className={cn(
        "pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2",
        "h-12 rounded-[14px] px-2",
        toolbarSurfaceClassName
      )}
    >
      <div className="relative flex h-full items-center gap-2">
        {/* 左侧：持久工具 */}
        <div className="flex items-center gap-2">
          <IconBtn
            title={selectTitle}
            active={isSelectTool}
            onPointerDown={() => handleToolChange("select")}
            className="group"
          >
            <SelectIcon
              size={toolbarIconSize}
              className={cn(toolbarIconClassName, isSelectTool && "dark:text-foreground")}
            />
          </IconBtn>
          <IconBtn
            title={handTitle}
            active={isHandTool}
            onPointerDown={() => handleToolChange("hand")}
            className="group"
          >
            <HandIcon
              size={toolbarIconSize}
              className={cn(toolbarIconClassName, isHandTool && "dark:text-foreground")}
            />
          </IconBtn>
          <span className="h-8 w-px bg-[#e3e8ef] dark:bg-slate-700" />
          <div className="relative">
            <IconBtn
              title={penVariant === "highlighter" ? highlighterTitle : penTitle}
              active={isPenTool || hoverGroup === "pen"}
              onPointerDown={() => {
                if (isLocked) return;
                setHoverGroup("pen");
                handleToolChange(penVariant, { keepPanel: true });
              }}
              className="group h-10 w-9 overflow-hidden"
              disabled={isLocked}
            >
              <span className="relative">
                {penVariant === "highlighter" ? (
                  <HighlighterToolIcon
                    className={cn(
                      "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                      isPenTool ? "translate-y-0" : "translate-y-2"
                    )}
                    style={{ color: penColor }}
                  />
                ) : (
                  <BrushToolIcon
                    className={cn(
                      "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                      isPenTool ? "translate-y-0" : "translate-y-2"
                    )}
                    style={{ color: penColor }}
                  />
                )}
              </span>
            </IconBtn>
            <HoverPanel open={penPanelOpen} className="w-max">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <PanelItem
                    title={penTitle}
                    active={snapshot.activeToolId === "pen"}
                    onPointerDown={() => handleToolChange("pen")}
                    size="sm"
                    showLabel={false}
                  >
                    <BrushToolIcon className="h-8 w-4" style={{ color: penColor }} />
                  </PanelItem>
                  <PanelItem
                    title={highlighterTitle}
                    active={snapshot.activeToolId === "highlighter"}
                    onPointerDown={() => handleToolChange("highlighter")}
                    size="sm"
                    showLabel={false}
                  >
                    <HighlighterToolIcon className="h-8 w-4" style={{ color: penColor }} />
                  </PanelItem>
                </div>
                <span className="h-6 w-px bg-[#e3e8ef] dark:bg-slate-700" />
                <div className="flex items-center gap-2">
                  {PEN_SIZES.map(size => (
                    <button
                      key={`pen-size-${size}`}
                      type="button"
                      onPointerDown={event => {
                        event.stopPropagation();
                        if (isLocked) return;
                        setPenSize(size);
                      }}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150",
                          penSize === size
                            ? "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50"
                            : "hover:bg-[hsl(var(--muted)/0.58)] dark:hover:bg-[hsl(var(--muted)/0.46)]"
                        )}
                      aria-label={`Pen size ${size}`}
                    >
                      <span className="rounded-full bg-current" style={{ width: size, height: size }} />
                    </button>
                  ))}
                </div>
                <span className="h-6 w-px bg-[#e3e8ef] dark:bg-slate-700" />
                <div className="flex items-center gap-1.5">
                  {PEN_COLORS.map(color => (
                    <button
                      key={`pen-color-${color}`}
                      type="button"
                      onPointerDown={event => {
                        event.stopPropagation();
                        if (isLocked) return;
                        setPenColor(color);
                      }}
                      className={cn(
                        "h-6 w-6 rounded-full ring-1 ring-[#e3e8ef] transition-colors duration-150 dark:ring-slate-600",
                        penColor === color &&
                          "ring-2 ring-[#1a73e8] ring-offset-2 ring-offset-background dark:ring-sky-400"
                      )}
                      style={{ backgroundColor: color }}
                      aria-label={`Pen color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </HoverPanel>
          </div>
          <IconBtn
            title={eraserTitle}
            active={isEraserTool}
            onPointerDown={() => {
              if (isLocked) return;
              handleToolChange("eraser");
            }}
            className="group h-10 w-9 overflow-hidden"
            disabled={isLocked}
          >
            <EraserToolIcon
              className={cn(
                "h-10 w-8 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                isEraserTool ? "translate-y-0" : "translate-y-2"
              )}
            />
          </IconBtn>
        </div>

        {/* 右侧：一次性插入 */}
        <div className="flex items-center gap-2">
          {INSERT_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = pendingInsert?.id === item.id;
            const request: CanvasInsertRequest = {
              id: item.id,
              type: item.nodeType ?? "text",
              props: item.props ?? {},
              size: item.size,
            };
            return (
              <IconBtn
                key={item.id}
                title={INSERT_TOOL_LABELS[item.id] ?? item.title}
                active={isActive}
                onPointerDown={event => {
                  if (isLocked) return;
                  if (item.id === "note") {
                    engine.getContainer()?.focus();
                    if (pendingInsert?.id === item.id) {
                      engine.setPendingInsert(null);
                      engine.setToolbarDragging(false);
                      return;
                    }
                    engine.setSelectionBox(null);
                    engine.setAlignmentGuides([]);
                    engine.setPendingInsert(request);
                    const worldPoint = getWorldPointFromEvent(event);
                    if (worldPoint) {
                      engine.setPendingInsertPoint(worldPoint);
                    }
                    toolbarDragRef.current = {
                      request,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                    setToolbarDragging(true);
                    engine.setToolbarDragging(true);
                    return;
                  }
                  if (item.opensPicker) {
                    if (item.id === "video") {
                      handlePickVideo();
                      return;
                    }
                    handlePickImage();
                    return;
                  }
                  handleInsertRequest(request);
                }}
                disabled={isLocked}
                className="group"
              >
                <Icon size={insertIconSize} className={insertIconClassName} />
              </IconBtn>
            );
          })}
        </div>
        <span className="h-8 w-px bg-[#e3e8ef] dark:bg-slate-700" />
        {/* 生成工具面板 */}
        <div
          className="relative"
          onMouseEnter={() => {
            if (isLocked) return;
            if (insertPanelHideTimerRef.current) {
              clearTimeout(insertPanelHideTimerRef.current);
              insertPanelHideTimerRef.current = null;
            }
            setHoverGroup("insert");
          }}
          onMouseLeave={() => {
            if (insertPanelPinned) return;
            if (insertPanelHideTimerRef.current) {
              clearTimeout(insertPanelHideTimerRef.current);
            }
            // 逻辑：鼠标移出后延迟关闭，便于用户快速回移。
            insertPanelHideTimerRef.current = setTimeout(() => {
              setHoverGroup(null);
              insertPanelHideTimerRef.current = null;
            }, 300);
          }}
        >
          <IconBtn
            title="生成工具"
            onPointerDown={() => {
              if (isLocked) return;
              // 逻辑：点击主图标时固定展开面板。
              setHoverGroup("insert");
              setInsertPanelPinned(true);
            }}
            disabled={isLocked}
            className="group h-10 w-9 overflow-hidden"
            showTooltip={false}
          >
            <InlineSvgFile
              src={FOLDER_SVG_SRC}
              className={cn(
                "pointer-events-none",
                "[&>svg]:fill-current",
                "transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                "translate-y-2"
              )}
              style={{ width: 28, height: 28, userSelect: "none", flexShrink: 0 }}
            />
          </IconBtn>
          <HoverPanel
            open={insertPanelOpen}
            className={cn(
              "bg-transparent ring-0 shadow-none backdrop-blur-0 p-0",
              insertPanelOpen
                ? "opacity-100 scale-100"
                : "opacity-100 scale-100 pointer-events-none"
            )}
          >
            <div
              className="relative"
              style={{
                width: generateArcRadius * 2 + 40,
                height: generateArcRadius + 48,
                transform: `translateY(${generateArcOffsetY}px)`,
              }}
            >
              {GENERATE_INSERT_ITEMS.map((item, index) => {
                const Icon = item.icon;
                const request: CanvasInsertRequest = {
                  id: item.id,
                  type: item.nodeType ?? "text",
                  props: item.props ?? {},
                  size: item.size,
                };
                const totalItems = GENERATE_INSERT_ITEMS.length;
                const [startAngle, endAngle] = generateArcRange;
                // 逻辑：按圆弧角度计算每个子工具按钮的位置。
                const angle =
                  totalItems === 1
                    ? (startAngle + endAngle) / 2
                    : startAngle +
                      ((endAngle - startAngle) * index) / (totalItems - 1);
                const radians = (angle * Math.PI) / 180;
                const offsetX = Math.cos(radians) * generateArcRadius;
                const offsetY = Math.sin(radians) * generateArcRadius;
                const delayStep = 60;
                // 逻辑：展开从左到右依次出现，收起反向依次消失。
                const transitionDelay = insertPanelOpen
                  ? index * delayStep
                  : (totalItems - 1 - index) * delayStep;

                return (
                  <div
                    key={item.id}
                    className="absolute left-1/2 top-full"
                    style={{
                      transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                    }}
                  >
                    <div
                      className={cn(
                        "transition-all duration-200 ease-out",
                        insertPanelOpen
                          ? "opacity-100 translate-y-0 scale-100"
                          : "opacity-0 translate-y-2 scale-95"
                      )}
                      style={{ transitionDelay: `${transitionDelay}ms` }}
                    >
                      <PanelItem
                        title={item.title}
                        active={pendingInsert?.id === item.id}
                        onPointerDown={() => {
                          if (isLocked) return;
                          // 逻辑：选择后进入待插入模式，并关闭面板。
                          handleInsertRequest(request);
                          setInsertPanelPinned(false);
                        }}
                        className="text-[10px] text-slate-400"
                      >
                        <Icon size={32} />
                      </PanelItem>
                    </div>
                  </div>
                );
              })}
            </div>
          </HoverPanel>
        </div>
        <ProjectFilePickerDialog
          open={imagePickerOpen}
          onOpenChange={setImagePickerOpen}
          title="选择图片文件"
          filterHint="非图片文件将置灰"
          allowedExtensions={IMAGE_EXTS}
          excludeBoardEntries
          currentBoardFolderUri={fileContext?.boardFolderUri}
          defaultRootUri={fileContext?.rootUri}
          defaultActiveUri={defaultPickerActiveUri ?? fileContext?.boardFolderUri}
          onSelectFile={handleImageSelected}
          onSelectFiles={handleImageSelected}
          onImportFromComputer={handleImportImageFromComputer}
        />
        <ProjectFilePickerDialog
          open={videoPickerOpen}
          onOpenChange={setVideoPickerOpen}
          title="选择视频文件"
          filterHint="非视频文件将置灰"
          allowedExtensions={VIDEO_EXTS}
          excludeBoardEntries
          currentBoardFolderUri={fileContext?.boardFolderUri}
          defaultRootUri={fileContext?.rootUri}
          defaultActiveUri={defaultPickerActiveUri ?? fileContext?.boardFolderUri}
          onSelectFile={handleVideoSelected}
          onSelectFiles={handleVideoSelected}
          onImportFromComputer={handleImportVideoFromComputer}
        />
        <input
          ref={imageImportInputRef}
          type="file"
          accept={imageAcceptAttr}
          multiple
          className="hidden"
          onChange={handleImportImageInputChange}
        />
        <input
          ref={videoImportInputRef}
          type="file"
          accept={videoAcceptAttr}
          multiple
          className="hidden"
          onChange={handleImportVideoInputChange}
        />
      </div>
    </div>
  );
});

export default BoardToolbar;
