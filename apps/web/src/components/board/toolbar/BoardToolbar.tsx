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
import { useTranslation } from "react-i18next";
import type { ComponentType, CSSProperties, ForwardRefExoticComponent } from "react";
import type { LucideProps } from "lucide-react";

import { cn } from "@udecode/cn";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasSnapshot } from "../engine/types";
import { HoverPanel, IconBtn, PanelItem, toolbarSurfaceClassName } from "../ui/ToolbarParts";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/TextNode";
import { useBoardContext } from "../core/BoardProvider";
import {
  AUDIO_EXTS,
  IMAGE_EXTS,
  VIDEO_EXTS,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import {
  ProjectFilePickerDialog,
  type ProjectFilePickerSelection,
} from "@/components/project/filesystem/components/ProjectFilePickerDialog";
import {
  getRelativePathFromUri,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  fitSize as fitSizeShared,
  saveBoardAssetFile as saveBoardAssetFileUtil,
  buildVideoPosterFromFile,
  getAudioDuration,
  isAudioFile,
  isImageFile,
  isVideoFile,
  resolveViewerType,
} from "../utils/board-asset";
import { HueSlider, buildColorSwatches, DEFAULT_COLOR_PRESETS } from "../ui/HueSlider";

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
const PEN_DEFAULT_COLORS = DEFAULT_COLOR_PRESETS;

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

/** Shortcut mapping for tooltips. */
const TOOL_SHORTCUTS = {
  select: "A",
  hand: "W",
  pen: "P",
  highlighter: "K",
  eraser: "E",
} as const;

/** Build a tooltip label with optional shortcut suffix. */
function buildToolTitle(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

const BRUSH_SVG_SRC = "/board/brush.svg";
const HIGHLIGHTER_SVG_SRC = "/board/highlighter.svg";
const ERASER_SVG_SRC = "/board/eraser.svg";
const SELECT_SVG_SRC = "/board/select-cursor-svgrepo-com.svg";
const DRAG_SVG_SRC = "/board/drag-svgrepo-com.svg";
const NOTE_SVG_SRC = "/board/notes-note-svgrepo-com.svg";
const PICTURE_SVG_SRC = "/board/picture-photo-svgrepo-com.svg";
const VIDEO_SVG_SRC = "/board/video-player-movie-svgrepo.svg";
const FILE_SVG_SRC = "/board/file-svgrepo-com.svg";
const TEXT_SVG_SRC = "/board/text-style-format-svgrepo-com.svg";
const DEFAULT_VIDEO_WIDTH = 16;
const DEFAULT_VIDEO_HEIGHT = 9;
const DEFAULT_VIDEO_NODE_MAX = 420;
const DEFAULT_AUDIO_NODE_WIDTH = 280;
const DEFAULT_AUDIO_NODE_HEIGHT = 100;
const DEFAULT_FILE_NODE_WIDTH = 260;
const DEFAULT_FILE_NODE_HEIGHT = 80;

type PendingInsertStackItem = {
  type: string;
  props: Record<string, unknown>;
  size?: [number, number];
};

/** Re-export for local usage. */
const fitSize = fitSizeShared;

const prefixSvgIds = (svg: string, prefix: string) => {
  const safePrefix = prefix.replace(/:/g, "");
  return svg
    .replace(/id="([^"]+)"/g, `id="${safePrefix}-$1"`)
    // 逻辑：同步重写 defs 引用，避免 SSR/多实例场景下 filter/gradient id 冲突后失效。
    .replace(/url\(#([^)]+)\)/g, `url(#${safePrefix}-$1)`)
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
      draggable={false}
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

function TextIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={TEXT_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function FileIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={FILE_SVG_SRC}
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



/** Render the bottom toolbar for the board canvas. */
const BoardToolbar = memo(function BoardToolbar({ engine, snapshot }: BoardToolbarProps) {
  const { t } = useTranslation('board');
  // 悬停展开的组 id（用字符串常量标识）
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [hoverInsertId, setHoverInsertId] = useState<string | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const { fileContext } = useBoardContext();
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const imageImportInputRef = useRef<HTMLInputElement | null>(null);
  const videoImportInputRef = useRef<HTMLInputElement | null>(null);
  const fileImportInputRef = useRef<HTMLInputElement | null>(null);
  const isSelectTool = snapshot.activeToolId === "select";
  const isHandTool = snapshot.activeToolId === "hand";
  const isBrushTool = snapshot.activeToolId === "pen";
  const isHighlighterTool = snapshot.activeToolId === "highlighter";
  const isEraserTool = snapshot.activeToolId === "eraser";
  const isLocked = snapshot.locked;
  const pendingInsert = snapshot.pendingInsert;
  const brushPanelOpen = !isLocked && (hoverGroup === "pen" || (isBrushTool && hoverGroup !== "highlighter"));
  const highlighterPanelOpen = !isLocked && (hoverGroup === "highlighter" || (isHighlighterTool && hoverGroup !== "pen"));
  const [penSize, setPenSize] = useState<number>(6);
  const [penColor, setPenColor] = useState<string>("#ef4444");
  const [hlSize, setHlSize] = useState<number>(10);
  const [hlColor, setHlColor] = useState<string>("#16a34a");
  const penColors = buildColorSwatches(PEN_DEFAULT_COLORS, snapshot.colorHistory);
  const selectTitle = buildToolTitle(t('tools.select'), TOOL_SHORTCUTS.select);
  const handTitle = buildToolTitle(t('tools.hand'), TOOL_SHORTCUTS.hand);
  const penTitle = buildToolTitle(t('tools.pen'), TOOL_SHORTCUTS.pen);
  const highlighterTitle = buildToolTitle(
    t('tools.highlighter'),
    TOOL_SHORTCUTS.highlighter
  );
  const eraserTitle = buildToolTitle(t('tools.eraser'), TOOL_SHORTCUTS.eraser);

  const INSERT_ITEMS = useMemo<InsertItem[]>(() => [
    {
      id: "note",
      title: t('insertTools.text'),
      description: t('descriptions.note'),
      icon: TextIcon,
      nodeType: "text",
      props: { autoFocus: true },
      size: [200, TEXT_NODE_DEFAULT_HEIGHT],
    },
    {
      id: "file",
      title: t('insertTools.file'),
      description: t('descriptions.file'),
      icon: FileIcon,
      size: [260, 80],
      opensPicker: true,
    },
  ], [t]);
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
  }, [engine, penColor, penSize]);

  useEffect(() => {
    // 逻辑：同步荧光笔配置到画布引擎，独立于画笔设置。
    engine.setHighlighterSettings({ size: hlSize, color: hlColor, opacity: 0.35 });
  }, [engine, hlColor, hlSize]);

  useEffect(() => {
    if (!isLocked) return;
    // 逻辑：锁定画布时关闭悬浮面板，避免残留交互入口。
    setHoverGroup(null);
  }, [isLocked]);

  useEffect(() => {
    const container = engine.getContainer();
    if (!container) return;
    const handleOpenFilePicker = () => {
      if (isLocked) return;
      setFilePickerOpen(true);
    };
    container.addEventListener("openloaf:board-open-file-picker", handleOpenFilePicker);
    return () => {
      container.removeEventListener("openloaf:board-open-file-picker", handleOpenFilePicker);
    };
  }, [engine, isLocked]);

  useEffect(() => {
    if (!hoverGroup) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const container = toolbarRef.current;
      if (!container || !target) return;
      // 逻辑：点击工具条外部时关闭子面板。
      if (container.contains(target)) return;
      if (hoverGroup === "pen" && isBrushTool) return;
      if (hoverGroup === "highlighter" && isHighlighterTool) return;
      setHoverGroup(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [hoverGroup, isBrushTool, isHighlighterTool]);

  const handleToolChange = useCallback(
    (tool: ToolMode, options?: { keepPanel?: boolean }) => {
      if (isLocked && (tool === "pen" || tool === "highlighter" || tool === "eraser")) {
        return;
      }
      engine.setActiveTool(tool);
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
    },
    [engine, isLocked, pendingInsert?.id]
  );

  /** Persist a file into the board assets folder. */
  const saveBoardAssetFile = useCallback(
    async (file: File, fallbackName: string) => {
      if (!fileContext?.boardFolderUri) return "";
      return saveBoardAssetFileUtil({
        file,
        fallbackName,
        projectId: fileContext?.projectId,
        boardFolderUri: fileContext.boardFolderUri,
      });
    },
    [fileContext?.boardFolderUri, fileContext?.projectId]
  );

  // buildVideoPosterFromFile is now imported from board-asset.ts

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
    [handleInsertRequest, saveBoardAssetFile]
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

  const handleImportFileFromComputer = useCallback(() => {
    if (isLocked) return;
    openImportDialog(fileImportInputRef);
  }, [isLocked, openImportDialog]);

  /** Insert files into the canvas via toolbar, auto-routing by type. */
  const handleImportFileFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      // 按文件类型分流到对应的处理器
      const imageFiles: File[] = [];
      const videoFiles: File[] = [];
      const otherFiles: File[] = [];
      for (const file of files) {
        if (isImageFile(file)) {
          imageFiles.push(file);
        } else if (isVideoFile(file)) {
          videoFiles.push(file);
        } else {
          otherFiles.push(file);
        }
      }
      // 图片/视频走已有的专用处理器
      if (imageFiles.length > 0) await handleImportImageFiles(imageFiles);
      if (videoFiles.length > 0) await handleImportVideoFiles(videoFiles);
      // 音频和其他文件走通用处理
      if (otherFiles.length === 0) return;
      const items: PendingInsertStackItem[] = [];
      for (const file of otherFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (isAudioFile(file)) {
          const relativePath = await saveBoardAssetFile(file, "audio.mp3");
          if (!relativePath) continue;
          const duration = await getAudioDuration(file);
          items.push({
            type: "audio",
            props: {
              sourcePath: relativePath,
              fileName: file.name,
              duration: duration ?? undefined,
              mimeType: file.type || undefined,
            },
            size: [DEFAULT_AUDIO_NODE_WIDTH, DEFAULT_AUDIO_NODE_HEIGHT],
          });
        } else {
          const relativePath = await saveBoardAssetFile(file, `file.${ext || "bin"}`);
          if (!relativePath) continue;
          const viewerType = resolveViewerType(ext);
          items.push({
            type: "file-attachment",
            props: {
              sourcePath: relativePath,
              fileName: file.name,
              extension: ext,
              viewerType,
              fileSize: file.size || undefined,
            },
            size: [DEFAULT_FILE_NODE_WIDTH, DEFAULT_FILE_NODE_HEIGHT],
          });
        }
      }
      if (items.length === 0) return;
      if (items.length === 1) {
        const item = items[0]!;
        handleInsertRequest({
          id: "file",
          type: item.type,
          props: item.props,
          size: item.size,
        });
        return;
      }
      const stackItems = items;
      const [maxWidth, maxHeight] = items.reduce<[number, number]>(
        (acc, item) => [
          Math.max(acc[0], item.size?.[0] ?? 0),
          Math.max(acc[1], item.size?.[1] ?? 0),
        ],
        [0, 0],
      );
      handleInsertRequest({
        id: "file",
        type: items[0]!.type,
        props: { stackItems },
        size: [maxWidth, maxHeight],
      });
    },
    [handleImportImageFiles, handleImportVideoFiles, handleInsertRequest, saveBoardAssetFile],
  );

  const handleImportFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      await handleImportFileFiles(files);
    },
    [handleImportFileFiles],
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
            duration: metadata?.duration,
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
    [handleInsertRequest]
  );

  /** Open the project file picker for generic files. */
  const handlePickFile = useCallback(() => {
    if (isLocked) return;
    setFilePickerOpen(true);
  }, [isLocked]);

  /** Handle inserting selected file entries, auto-routing by type. */
  const handleFileSelected = useCallback(
    async (selection: ProjectFilePickerSelection | ProjectFilePickerSelection[]) => {
      const selections = Array.isArray(selection) ? selection : [selection];
      if (selections.length === 0) return;
      // 按文件类型分流到对应的处理器
      const imageSelections: ProjectFilePickerSelection[] = [];
      const videoSelections: ProjectFilePickerSelection[] = [];
      const otherSelections: ProjectFilePickerSelection[] = [];
      for (const item of selections) {
        const ext = item.entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (IMAGE_EXTS.has(ext)) {
          imageSelections.push(item);
        } else if (VIDEO_EXTS.has(ext)) {
          videoSelections.push(item);
        } else {
          otherSelections.push(item);
        }
      }
      // 图片/视频走已有的专用处理器
      if (imageSelections.length > 0) await handleImageSelected(imageSelections);
      if (videoSelections.length > 0) await handleVideoSelected(videoSelections);
      // 音频和其他文件走通用处理
      if (otherSelections.length === 0) return;
      const items: PendingInsertStackItem[] = [];
      for (const item of otherSelections) {
        const ext = item.entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (AUDIO_EXTS.has(ext)) {
          items.push({
            type: "audio",
            props: {
              sourcePath: item.fileRef,
              fileName: item.entry.name,
              mimeType: `audio/${ext}`,
            },
            size: [DEFAULT_AUDIO_NODE_WIDTH, DEFAULT_AUDIO_NODE_HEIGHT],
          });
        } else {
          const viewerType = resolveViewerType(ext);
          items.push({
            type: "file-attachment",
            props: {
              sourcePath: item.fileRef,
              fileName: item.entry.name,
              extension: ext,
              viewerType,
            },
            size: [DEFAULT_FILE_NODE_WIDTH, DEFAULT_FILE_NODE_HEIGHT],
          });
        }
      }
      if (items.length === 0) return;
      if (items.length === 1) {
        const item = items[0]!;
        handleInsertRequest({
          id: "file",
          type: item.type,
          props: item.props,
          size: item.size,
        });
        return;
      }
      const [maxWidth, maxHeight] = items.reduce<[number, number]>(
        (acc, item) => [
          Math.max(acc[0], item.size?.[0] ?? 0),
          Math.max(acc[1], item.size?.[1] ?? 0),
        ],
        [0, 0],
      );
      handleInsertRequest({
        id: "file",
        type: items[0]!.type,
        props: { stackItems: items },
        size: [maxWidth, maxHeight],
      });
    },
    [handleImageSelected, handleVideoSelected, handleInsertRequest],
  );

  const defaultPickerActiveUri = useMemo(() => {
    const rootUri = fileContext?.rootUri?.trim() ?? "";
    const boardFolderUri = fileContext?.boardFolderUri?.trim() ?? "";
    if (!rootUri || !boardFolderUri) return undefined;
    const relativeBoardPath = getRelativePathFromUri(rootUri, boardFolderUri);
    if (relativeBoardPath === null) return undefined;
    return relativeBoardPath;
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
  /** 底部持久工具按钮统一使用更紧凑的圆角，避免选中态出现过胖的椭圆。 */
  const persistentToolButtonClassName = "group h-10 w-9 overflow-hidden rounded-md";

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
        "h-16 rounded-lg px-2",
        toolbarSurfaceClassName
      )}
    >
      <div className="relative flex h-full items-center gap-2">
        {/* 左侧：持久工具 */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <IconBtn
              title={selectTitle}
              active={isSelectTool}
              onPointerDown={() => handleToolChange("select")}
              className={persistentToolButtonClassName}
            >
              <SelectIcon
                size={toolbarIconSize}
                className={cn(
                  "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                  isSelectTool ? "translate-y-0" : "translate-y-2"
                )}
              />
            </IconBtn>
            <span className="pointer-events-none mt-1 select-none text-[9px] leading-none text-muted-foreground/70">{t('tools.select')}</span>
          </div>
          <div className="flex flex-col items-center">
            <IconBtn
              title={handTitle}
              active={isHandTool}
              onPointerDown={() => handleToolChange("hand")}
              className={persistentToolButtonClassName}
            >
              <HandIcon
                size={toolbarIconSize}
                className={cn(
                  "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                  isHandTool ? "translate-y-0" : "translate-y-2"
                )}
              />
            </IconBtn>
            <span className="pointer-events-none mt-1 select-none text-[9px] leading-none text-muted-foreground/70">{t('tools.hand')}</span>
          </div>
          <span className="h-8 w-px bg-border/80" />
          <div
            className="relative flex flex-col items-center"
            onPointerEnter={() => {
              if (hoverCloseTimer.current) { window.clearTimeout(hoverCloseTimer.current); hoverCloseTimer.current = null; }
              if (!isLocked) setHoverGroup("pen");
            }}
            onPointerLeave={() => {
              if (hoverGroup === "pen" && !isBrushTool) {
                hoverCloseTimer.current = window.setTimeout(() => { setHoverGroup(null); hoverCloseTimer.current = null; }, 150);
              }
            }}
          >
            <IconBtn
              title={penTitle}
              active={isBrushTool}
              onPointerDown={() => {
                if (isLocked) return;
                setHoverGroup("pen");
                handleToolChange("pen", { keepPanel: true });
              }}
              className={persistentToolButtonClassName}
              disabled={isLocked}
            >
              <BrushToolIcon
                className={cn(
                  "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                  isBrushTool ? "translate-y-0" : "translate-y-2"
                )}
                style={{ color: penColor }}
              />
            </IconBtn>
            <HoverPanel
              open={brushPanelOpen}
              className="w-max p-3"
              onMouseEnter={() => { if (hoverCloseTimer.current) { window.clearTimeout(hoverCloseTimer.current); hoverCloseTimer.current = null; } }}
              onMouseLeave={() => {
                if (hoverGroup === "pen" && !isBrushTool) {
                  hoverCloseTimer.current = window.setTimeout(() => { setHoverGroup(null); hoverCloseTimer.current = null; }, 150);
                }
              }}
            >
              <div
                className="flex flex-col gap-3"
                onPointerDownCapture={() => {
                  if (!isBrushTool) handleToolChange("pen", { keepPanel: true });
                }}
              >
                <div className="flex items-center gap-2">
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
                          "inline-flex h-7 w-7 items-center justify-center rounded-md",
                          penSize === size
                            ? "bg-foreground/12 text-foreground dark:bg-foreground/18 dark:text-white"
                            : "hover:bg-accent/60"
                        )}
                        aria-label={`Pen size ${size}`}
                      >
                        <span className="rounded-full bg-current" style={{ width: size, height: size }} />
                      </button>
                    ))}
                  </div>
                  <span className="h-6 w-px bg-border/70" />
                  <div className="flex flex-wrap items-center gap-1.5 max-w-[180px]">
                    {penColors.map(color => (
                      <button
                        key={`pen-color-${color}`}
                        type="button"
                        onPointerDown={event => {
                          event.stopPropagation();
                          if (isLocked) return;
                          setPenColor(color);
                        }}
                        className={cn(
                          "h-6 w-6 rounded-full ring-1 ring-border",
                          penColor === color &&
                            "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                        )}
                        style={{ backgroundColor: color }}
                        aria-label={`Pen color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <HueSlider
                  value={penColor}
                  onChange={(c) => setPenColor(c)}
                />
              </div>
            </HoverPanel>
            <span className="pointer-events-none mt-1 select-none text-[9px] leading-none text-muted-foreground/70">{t('tools.pen')}</span>
          </div>
          <div
            className="relative flex flex-col items-center"
            onPointerEnter={() => {
              if (hoverCloseTimer.current) { window.clearTimeout(hoverCloseTimer.current); hoverCloseTimer.current = null; }
              if (!isLocked) setHoverGroup("highlighter");
            }}
            onPointerLeave={() => {
              if (hoverGroup === "highlighter" && !isHighlighterTool) {
                hoverCloseTimer.current = window.setTimeout(() => { setHoverGroup(null); hoverCloseTimer.current = null; }, 150);
              }
            }}
          >
            <IconBtn
              title={highlighterTitle}
              active={isHighlighterTool}
              onPointerDown={() => {
                if (isLocked) return;
                setHoverGroup("highlighter");
                handleToolChange("highlighter", { keepPanel: true });
              }}
              className={persistentToolButtonClassName}
              disabled={isLocked}
            >
              <HighlighterToolIcon
                className={cn(
                  "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0.5",
                  isHighlighterTool ? "translate-y-0.5" : "translate-y-3"
                )}
                style={{ color: hlColor }}
              />
            </IconBtn>
            <HoverPanel
              open={highlighterPanelOpen}
              className="w-max p-3"
              onMouseEnter={() => { if (hoverCloseTimer.current) { window.clearTimeout(hoverCloseTimer.current); hoverCloseTimer.current = null; } }}
              onMouseLeave={() => {
                if (hoverGroup === "highlighter" && !isHighlighterTool) {
                  hoverCloseTimer.current = window.setTimeout(() => { setHoverGroup(null); hoverCloseTimer.current = null; }, 150);
                }
              }}
            >
              <div
                className="flex flex-col gap-3"
                onPointerDownCapture={() => {
                  if (!isHighlighterTool) handleToolChange("highlighter", { keepPanel: true });
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    {PEN_SIZES.map(size => (
                      <button
                        key={`hl-size-${size}`}
                        type="button"
                        onPointerDown={event => {
                          event.stopPropagation();
                          if (isLocked) return;
                          setHlSize(size);
                        }}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-md",
                          hlSize === size
                            ? "bg-foreground/12 text-foreground dark:bg-foreground/18 dark:text-white"
                            : "hover:bg-accent/60"
                        )}
                        aria-label={`Highlighter size ${size}`}
                      >
                        <span className="rounded-full bg-current" style={{ width: size, height: size }} />
                      </button>
                    ))}
                  </div>
                  <span className="h-6 w-px bg-border/70" />
                  <div className="flex flex-wrap items-center gap-1.5 max-w-[180px]">
                    {penColors.map(color => (
                      <button
                        key={`hl-color-${color}`}
                        type="button"
                        onPointerDown={event => {
                          event.stopPropagation();
                          if (isLocked) return;
                          setHlColor(color);
                        }}
                        className={cn(
                          "h-6 w-6 rounded-full ring-1 ring-border",
                          hlColor === color &&
                            "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                        )}
                        style={{ backgroundColor: color }}
                        aria-label={`Highlighter color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <HueSlider
                  value={hlColor}
                  onChange={(c) => setHlColor(c)}
                />
              </div>
            </HoverPanel>
            <span className="pointer-events-none mt-1 select-none text-[9px] leading-none text-muted-foreground/70">{t('tools.highlighter')}</span>
          </div>
          <div className="flex flex-col items-center">
            <IconBtn
              title={eraserTitle}
              active={isEraserTool}
              onPointerDown={() => {
                if (isLocked) return;
                handleToolChange("eraser");
              }}
              className={persistentToolButtonClassName}
              disabled={isLocked}
            >
              <EraserToolIcon
                className={cn(
                  "h-10 w-8 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                  isEraserTool ? "translate-y-0" : "translate-y-2"
                )}
              />
            </IconBtn>
            <span className="pointer-events-none mt-1 select-none text-[9px] leading-none text-muted-foreground/70">{t('tools.eraser')}</span>
          </div>
        </div>

        <div className="mx-1 h-6 w-px bg-border/50" />

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
              title: item.title,
            };
            return (
              <div
                key={item.id}
                className="relative flex flex-col items-center select-none"
                draggable={false}
                onDragStart={e => e.preventDefault()}
                onPointerEnter={() => setHoverInsertId(item.id)}
                onPointerLeave={() => setHoverInsertId(null)}
              >
                {item.id === "note" ? (
                  <HoverPanel open={hoverInsertId === "note" && !isActive} className="w-56 p-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-[12px] font-semibold text-foreground">{t('textToolTip.title')}</div>
                      <div className="text-[11px] leading-relaxed text-muted-foreground">{t('textToolTip.desc')}</div>
                      {/* Mindmap illustration */}
                      <div className="mt-1 rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5">
                        <div className="flex items-start gap-0">
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center rounded-md bg-primary/10 dark:bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">{t('textToolTip.mindmapExample.root')}</span>
                            <span className="h-2 w-px bg-border" />
                          </div>
                        </div>
                        <div className="flex gap-4 pl-2">
                          <div className="flex flex-col items-center">
                            <span className="h-px w-3 bg-border" />
                            <span className="inline-flex items-center rounded-md bg-ol-blue/10 px-1.5 py-0.5 text-[9px] text-ol-blue">{t('textToolTip.mindmapExample.child1')}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="h-px w-3 bg-border" />
                            <span className="inline-flex items-center rounded-md bg-ol-amber/10 px-1.5 py-0.5 text-[9px] text-ol-amber">{t('textToolTip.mindmapExample.child2')}</span>
                            <span className="h-1.5 w-px bg-border" />
                            <span className="inline-flex items-center rounded-md bg-ol-green/10 px-1.5 py-0.5 text-[9px] text-ol-green">{t('textToolTip.mindmapExample.grandchild')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[9px] font-mono font-medium">Tab</kbd>
                        <span>{t('textToolTip.mindmapHint')}</span>
                      </div>
                    </div>
                  </HoverPanel>
                ) : null}
                <IconBtn
                  title={item.title}
                  active={isActive}
                  showTooltip={item.id !== "note"}
                  onPointerDown={event => {
                    event.preventDefault();
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
                      if (item.id === "file") {
                        handlePickFile();
                        return;
                      }
                      handlePickImage();
                      return;
                    }
                    handleInsertRequest(request);
                  }}
                  disabled={isLocked}
                  className="group h-10 w-9 overflow-hidden"
                >
                  <Icon
                    size={insertIconSize}
                    className={cn(
                      "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                      isActive ? "translate-y-0" : "translate-y-2"
                    )}
                  />
                </IconBtn>
                <span className="pointer-events-none mt-1 select-none text-[9px] leading-none text-muted-foreground/70">{item.title}</span>
              </div>
            );
          })}
        </div>
        <ProjectFilePickerDialog
          open={imagePickerOpen}
          onOpenChange={setImagePickerOpen}
          title={t('picker.imageTitle')}
          filterHint={t('picker.imageHint')}
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
          title={t('picker.videoTitle')}
          filterHint={t('picker.videoHint')}
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
        <ProjectFilePickerDialog
          open={filePickerOpen}
          onOpenChange={setFilePickerOpen}
          title={t('picker.fileTitle')}
          filterHint={t('picker.fileHint')}
          excludeBoardEntries
          currentBoardFolderUri={fileContext?.boardFolderUri}
          defaultRootUri={fileContext?.rootUri}
          defaultActiveUri={defaultPickerActiveUri ?? fileContext?.boardFolderUri}
          onSelectFile={handleFileSelected}
          onSelectFiles={handleFileSelected}
          onImportFromComputer={handleImportFileFromComputer}
        />
        <input
          ref={fileImportInputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={handleImportFileInputChange}
        />
      </div>
    </div>
  );
});

export default BoardToolbar;
