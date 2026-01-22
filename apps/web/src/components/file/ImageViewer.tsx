"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCenterPosition,
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { AlertTriangle, Download, Redo2, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/utils/trpc";
import { useOptionalChatContext } from "@/components/chat/ChatProvider";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { buildStrokeOutline } from "@/components/board/utils/stroke-path";
import type { CanvasStrokePoint, CanvasStrokeTool } from "@/components/board/engine/types";
import type { MaskedAttachmentInput } from "@/components/chat/chat-attachments";
import { fetchBlobFromUri, loadImageFromUri } from "@/lib/image/uri";
import { resolveMaskFileName } from "@/lib/image/mask";
import { supportsImageEdit } from "@/lib/model-capabilities";
import { useWorkspace } from "@/components/workspace/workspaceContext";

interface ImageViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  /** Optional thumbnail placeholder to show before full image loads. */
  thumbnailSrc?: string;
  /** Optional header title for modal usage. */
  title?: string;
  /** Optional suggested base name for saving. */
  saveName?: string;
  /** Whether to show the header bar. */
  showHeader?: boolean;
  /** Whether to show the save button. */
  showSave?: boolean;
  /** Whether to enable adjust/edit mode. */
  enableEdit?: boolean;
  /** Notify when image metadata is ready. */
  onImageMeta?: (meta: { width: number; height: number }) => void;
  /** Default directory for save dialog (file://... or local path). */
  saveDefaultDir?: string;
  /** Optional media type for file naming. */
  mediaType?: string;
  /** Optional initial mask for editing (relative/data/blob). */
  initialMaskUri?: string;
  /** Optional override handler when applying mask. */
  onApplyMask?: (input: MaskedAttachmentInput) => void;
  /** Close handler used by modal header. */
  onClose?: () => void;
}

/** Extract file extension from media type. */
function getExtensionFromMediaType(mediaType?: string) {
  if (!mediaType) return "";
  const normalized = mediaType.toLowerCase();
  if (!normalized.includes("/")) return "";
  const ext = normalized.split("/")[1]?.split(";")[0] ?? "";
  if (ext === "jpeg") return "jpg";
  if (ext === "svg+xml") return "svg";
  return ext;
}

/** Extract file extension from path or url. */
function getExtensionFromPath(source?: string) {
  if (!source) return "";
  if (source.startsWith("data:")) return "";
  try {
    const parsed = source.includes("://") ? new URL(source) : null;
    const pathname = parsed ? parsed.pathname : source;
    const match = pathname.match(/\\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function isBlobUrl(source?: string) {
  return typeof source === "string" && source.startsWith("blob:");
}

/** Extract media type from a data url. */
function getMediaTypeFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Normalize a file name to be safe for filesystem. */
function sanitizeFileName(name: string) {
  const cleaned = name.trim().replace(/[\\\\/:*?"<>|]/g, "_");
  return cleaned || "image";
}

/** Format a timestamp base name like YYYYMMDD-HHMMSS. */
function formatTimestampBaseName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/** Resolve the suggested filename for saving. */
function resolveFileName(input: {
  saveName?: string;
  fallbackBase: string;
  title?: string;
  name?: string;
  uri?: string;
  ext?: string;
  mediaType?: string;
  dataUrl?: string;
}) {
  const baseLabel = input.saveName || input.name || input.fallbackBase;
  const base = sanitizeFileName(baseLabel);
  const extFromMedia = getExtensionFromMediaType(input.mediaType);
  const extFromName = getExtensionFromPath(input.name);
  const extFromUri = getExtensionFromPath(input.uri);
  const extFromDataUrl = input.dataUrl ? getExtensionFromMediaType(getMediaTypeFromDataUrl(input.dataUrl)) : "";
  const normalizedExt = input.ext ? input.ext.replace(/^\\./, "") : "";
  const ext = normalizedExt || extFromMedia || extFromName || extFromUri || extFromDataUrl || "png";
  const normalizedBase = base.replace(/\\.[a-zA-Z0-9]+$/, "");
  return `${normalizedBase}.${ext}`;
}

/** Convert ArrayBuffer into base64 payload. */
function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  // 分片拼接避免 call stack 过大。
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const BRUSH_MIN_SIZE = 8;
const BRUSH_MAX_SIZE = 120;
const BRUSH_PREVIEW_COLOR = "rgba(255, 255, 255, 1)";
const BRUSH_MASK_COLOR = "rgba(255, 255, 255, 1)";
const BRUSH_TOOL: CanvasStrokeTool = "highlighter";

/** Convert a data/blob url into a File instance. */
async function createFileFromUrl(input: {
  url: string;
  fileName: string;
  fallbackType?: string;
}): Promise<File | null> {
  try {
    const res = await fetch(input.url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || input.fallbackType || "image/png";
    return new File([blob], input.fileName, { type });
  } catch {
    return null;
  }
}


/** Convert a canvas to a PNG file. */
async function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });
  if (!blob) return null;
  return new File([blob], fileName, { type: "image/png" });
}


/** Render an image preview panel. */
export default function ImageViewer({
  uri,
  name,
  ext,
  projectId: projectIdProp,
  thumbnailSrc,
  title,
  saveName,
  showHeader,
  showSave,
  enableEdit = true,
  onImageMeta,
  saveDefaultDir,
  mediaType,
  initialMaskUri,
  onApplyMask,
  onClose,
}: ImageViewerProps) {
  const isRelative = typeof uri === "string" && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
  const isDataUrl = typeof uri === "string" && uri.startsWith("data:");
  const isBlob = isBlobUrl(uri);
  const shouldUseFs = typeof uri === "string" && uri.startsWith("file://");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const transformRef = React.useRef<ReactZoomPanPinchRef | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = React.useRef(false);
  const hasStrokeRef = React.useRef(false);
  const maskModelIdRef = React.useRef<string>("");
  const historyRef = React.useRef<Array<{ mask: ImageData }>>([]);
  const redoRef = React.useRef<Array<{ mask: ImageData }>>([]);
  const preStrokeRef = React.useRef<{ mask: ImageData } | null>(null);
  const strokePointsRef = React.useRef<CanvasStrokePoint[]>([]);
  const initialMaskAppliedRef = React.useRef<string>("");
  // 记录容器尺寸，用于计算图片适配缩放。
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = React.useState({ width: 0, height: 0 });
  const [fitScale, setFitScale] = React.useState(1);
  // 保存中状态，避免重复触发。
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAdjusting, setIsAdjusting] = React.useState(false);
  const [hasStroke, setHasStroke] = React.useState(false);
  const [initialMaskTick, setInitialMaskTick] = React.useState(0);
  const [brushSize, setBrushSize] = React.useState(40);
  const [cursorPosition, setCursorPosition] = React.useState<{ x: number; y: number } | null>(
    null
  );
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const appliedRef = React.useRef<string>("");
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const shouldUseBinary =
    Boolean(uri) && Boolean(workspaceId) && (shouldUseFs || isRelative);
  const chat = useOptionalChatContext();
  const projectId = projectIdProp ?? chat?.projectId;
  const { basic, setBasic } = useBasicConfig();
  const { providerItems, s3ProviderItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const isElectron = React.useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );
  const rawChatSource = basic.chatSource;
  const chatSource = normalizeChatModelSource(rawChatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatSource, providerItems, cloudModels),
    [chatSource, providerItems, cloudModels],
  );
  const hasS3Storage = React.useMemo(() => {
    if (!basic.activeS3Id) return false;
    return s3ProviderItems.some((item) => item.id === basic.activeS3Id);
  }, [basic.activeS3Id, s3ProviderItems]);

  const imageQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({
      workspaceId,
      projectId,
      uri: uri ?? "",
    }),
    enabled: shouldUseBinary,
  });
  const [preview, setPreview] = React.useState<{
    status: "loading" | "ready" | "error";
    src?: string;
  } | null>(null);

  React.useEffect(() => {
    if (!uri || !isRelative || shouldUseBinary) return;
    let aborted = false;
    let objectUrl = "";
    const run = async () => {
      setPreview({ status: "loading" });
      try {
        const blob = await fetchBlobFromUri(uri, { projectId });
        objectUrl = URL.createObjectURL(blob);
        if (aborted) return;
        setPreview({ status: "ready", src: objectUrl });
      } catch {
        if (aborted) return;
        setPreview({ status: "error" });
      }
    };
    void run();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, uri, isRelative, shouldUseBinary]);

  const payload = shouldUseBinary ? imageQuery.data : null;
  const placeholderSrc = thumbnailSrc || preview?.src || "";
  // 用 base64 构造 dataUrl，避免浏览器直接访问 file:// 资源。
  const dataUrl = isDataUrl || isBlob
    ? uri
    : payload?.contentBase64 && payload?.mime
      ? `data:${payload.mime};base64,${payload.contentBase64}`
      : placeholderSrc;

  const displayTitle = title || name || "图片预览";
  // 默认保存名按图片加载时刻生成，避免对话框内不断变化。
  const fallbackSaveName = React.useMemo(
    () => formatTimestampBaseName(new Date()),
    [uri]
  );
  const fileName = resolveFileName({
    saveName,
    fallbackBase: fallbackSaveName,
    title,
    name,
    uri,
    ext,
    mediaType,
    dataUrl,
  });
  const canSave = Boolean(showSave) && Boolean(dataUrl) && !isSaving;
  const showAdjustLayer = Boolean(initialMaskUri) || (enableEdit && isAdjusting) || hasStroke;
  const handleImageLoad = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      // 记录图片原始尺寸，用于适配缩放比例。
      setImageSize({ width: naturalWidth, height: naturalHeight });
      onImageMeta?.({ width: naturalWidth, height: naturalHeight });
    },
    [onImageMeta]
  );

  const renderComposite = React.useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const baseImage = imageRef.current;
    if (!overlayCanvas || !baseImage) return;
    if (!imageSize.width || !imageSize.height) return;
    const baseCanvas = baseCanvasRef.current ?? document.createElement("canvas");
    baseCanvas.width = imageSize.width;
    baseCanvas.height = imageSize.height;
    baseCanvasRef.current = baseCanvas;
    const baseCtx = baseCanvas.getContext("2d");
    overlayCanvas.width = imageSize.width;
    overlayCanvas.height = imageSize.height;
    const ctx = overlayCanvas.getContext("2d");
    if (!ctx || !baseCtx) return;
    // 中文注释：绘制棋盘格背景，再绘制原图，最后用 mask 挖空透明区域。
    const cell = 12;
    for (let y = 0; y < overlayCanvas.height; y += cell) {
      for (let x = 0; x < overlayCanvas.width; x += cell) {
        const isEven = ((x / cell + y / cell) % 2) === 0;
        ctx.fillStyle = isEven ? "#f3f4f6" : "#e5e7eb";
        ctx.fillRect(x, y, cell, cell);
      }
    }
    baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(baseImage, 0, 0, baseCanvas.width, baseCanvas.height);
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      baseCtx.globalCompositeOperation = "destination-out";
      baseCtx.drawImage(maskCanvas, 0, 0, baseCanvas.width, baseCanvas.height);
      baseCtx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(baseCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height);
  }, [imageSize.height, imageSize.width]);


  /** Save the preview image to a user-selected path. */
  const handleSave = async () => {
    if (!dataUrl) return;
    if (!canSave) return;
    setIsSaving(true);
    try {
      if (!isElectron || !window.tenasElectron?.saveFile) {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = fileName;
        link.click();
        return;
      }
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error("download failed");
      const buffer = await res.arrayBuffer();
      const contentBase64 = encodeArrayBufferToBase64(buffer);
      const result = await window.tenasElectron.saveFile({
        contentBase64,
        defaultDir: saveDefaultDir,
        suggestedName: fileName,
        filters: [{ name: "Image", extensions: [fileName.split(".").pop() || "png"] }],
      });
      if (!result?.ok) {
        if (result?.canceled) return;
        toast.error(result?.reason ?? "保存失败");
        return;
      }
      toast.success("图片已保存");
    } catch (error) {
      toast.error((error as Error)?.message ?? "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  React.useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [dataUrl]);

  React.useEffect(() => {
    if (!dataUrl) return;
    // 每次图片源变化时，先重置尺寸，避免沿用旧尺寸计算。
    setImageSize({ width: 0, height: 0 });
    // 切换图片时重置涂抹状态，避免残留笔刷痕迹。
    setIsAdjusting(false);
    setHasStroke(false);
    hasStrokeRef.current = false;
    setBrushSize(40);
    preStrokeRef.current = null;
    strokePointsRef.current = [];
    appliedRef.current = "";
    initialMaskAppliedRef.current = "";
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setInitialMaskTick(0);
    baseCanvasRef.current = null;
  }, [dataUrl]);

  const applyInitialMask = React.useCallback(async () => {
    if (!initialMaskUri) return;
    if (!imageSize.width || !imageSize.height) return;
    const applyKey = `${initialMaskUri}:${imageSize.width}x${imageSize.height}:${isAdjusting ? "adjust" : "view"}`;
    if (initialMaskAppliedRef.current === applyKey) return;
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) {
      if (!hasStrokeRef.current) {
        setHasStroke(true);
        hasStrokeRef.current = true;
      }
      requestAnimationFrame(() => {
        setInitialMaskTick((value) => value + 1);
      });
      return;
    }
    overlayCanvas.width = imageSize.width;
    overlayCanvas.height = imageSize.height;
    const maskCanvas = maskCanvasRef.current ?? document.createElement("canvas");
    maskCanvas.width = imageSize.width;
    maskCanvas.height = imageSize.height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    const maskImage = await loadImageFromUri(initialMaskUri, { projectId });
    maskCtx.drawImage(maskImage, 0, 0, maskCanvas.width, maskCanvas.height);
    maskCanvasRef.current = maskCanvas;
    renderComposite();
    setHasStroke(true);
    hasStrokeRef.current = true;
    if (isAdjusting) {
      historyRef.current = [
        {
          mask: maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
        },
      ];
      redoRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }
    initialMaskAppliedRef.current = applyKey;
  }, [imageSize.height, imageSize.width, initialMaskUri, isAdjusting, renderComposite]);

  React.useEffect(() => {
    if (!dataUrl || !initialMaskUri) return;
    void applyInitialMask();
  }, [applyInitialMask, dataUrl, initialMaskUri, initialMaskTick]);

  React.useEffect(() => {
    if (!dataUrl) return;
    if (!imageSize.width || !imageSize.height) return;
    if (!containerSize.width || !containerSize.height) return;
    const nextScale = Math.min(
      containerSize.width / imageSize.width,
      containerSize.height / imageSize.height,
      1
    );
    setFitScale(nextScale);
  }, [containerSize.height, containerSize.width, dataUrl, imageSize.height, imageSize.width]);

  React.useEffect(() => {
    if (!dataUrl) return;
    if (!imageSize.width || !imageSize.height) return;
    if (!containerSize.width || !containerSize.height) return;
    const applyKey = `${dataUrl}:${containerSize.width}x${containerSize.height}:${imageSize.width}x${imageSize.height}`;
    if (appliedRef.current === applyKey) return;
    const instance = transformRef.current?.instance;
    if (instance?.wrapperComponent && instance.contentComponent) {
      const { positionX, positionY } = getCenterPosition(
        fitScale,
        instance.wrapperComponent,
        instance.contentComponent
      );
      // 首次加载时按容器尺寸适配到完整显示。
      transformRef.current?.setTransform(positionX, positionY, fitScale, 0);
    }
    appliedRef.current = applyKey;
  }, [containerSize.height, containerSize.width, dataUrl, fitScale, imageSize.height, imageSize.width]);

  React.useEffect(() => {
    if (!isAdjusting) return;
    if (!imageSize.width || !imageSize.height) return;
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      overlayCanvas.width = imageSize.width;
      overlayCanvas.height = imageSize.height;
      renderComposite();
    }
    const maskCanvas = maskCanvasRef.current ?? document.createElement("canvas");
    maskCanvas.width = imageSize.width;
    maskCanvas.height = imageSize.height;
    const maskCtx = maskCanvas.getContext("2d");
    if (maskCtx) {
      // mask 使用透明背景，仅涂抹区域保留颜色。
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    maskCanvasRef.current = maskCanvas;
    setHasStroke(false);
    hasStrokeRef.current = false;
    setBrushSize(40);
    preStrokeRef.current = null;
    strokePointsRef.current = [];
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, [imageSize.height, imageSize.width, isAdjusting, renderComposite]);

  React.useEffect(() => {
    if (isAdjusting) return;
    setCursorPosition(null);
    isDrawingRef.current = false;
  }, [isAdjusting]);

  /** Resolve pointer position mapped into natural image space. */
  const resolveDrawPoint = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      return {
        x,
        y,
        displayX: event.clientX - rect.left,
        displayY: event.clientY - rect.top,
        scale: (scaleX + scaleY) / 2,
      };
    },
    [],
  );

  /** Draw a brush stroke onto overlay + mask canvases. */
  const drawStroke = React.useCallback((point: { x: number; y: number; scale: number }) => {
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!overlayCanvas || !maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    const lineWidth = brushSize * point.scale;
    // 逻辑：使用平滑笔迹轮廓绘制，避免线段拼接导致圆圈感。
    const outline = buildStrokeOutline(strokePointsRef.current, {
      size: lineWidth,
      tool: BRUSH_TOOL,
    });
    const snapshot = preStrokeRef.current;
    if (snapshot) {
      maskCtx.putImageData(snapshot.mask, 0, 0);
    }
    if (outline.length > 0) {
      // 逻辑：mask 使用纯白，保证后续转换稳定。
      maskCtx.fillStyle = BRUSH_MASK_COLOR;
      maskCtx.beginPath();
      maskCtx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i += 1) {
        maskCtx.lineTo(outline[i][0], outline[i][1]);
      }
      maskCtx.closePath();
      maskCtx.fill();
    }
    renderComposite();
    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true;
      setHasStroke(true);
    }
  }, [brushSize, renderComposite]);

  const pushSnapshot = React.useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    historyRef.current.push({ mask });
    redoRef.current = [];
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(false);
  }, []);

  const applySnapshot = React.useCallback((snapshot?: { mask: ImageData }) => {
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!overlayCanvas || !maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    if (!snapshot) {
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      renderComposite();
      setHasStroke(false);
      hasStrokeRef.current = false;
      setCanUndo(false);
      setCanRedo(redoRef.current.length > 0);
      return;
    }
    maskCtx.putImageData(snapshot.mask, 0, 0);
    renderComposite();
    setHasStroke(true);
    hasStrokeRef.current = true;
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, [renderComposite]);

  const handleUndo = React.useCallback(() => {
    if (historyRef.current.length === 0) return;
    const snapshot = historyRef.current.pop();
    if (snapshot) {
      redoRef.current.unshift(snapshot);
    }
    const previous = historyRef.current[historyRef.current.length - 1];
    applySnapshot(previous);
  }, [applySnapshot]);

  const handleRedo = React.useCallback(() => {
    if (redoRef.current.length === 0) return;
    const snapshot = redoRef.current.shift();
    if (!snapshot) return;
    historyRef.current.push(snapshot);
    applySnapshot(snapshot);
  }, [applySnapshot]);

  const handleClear = React.useCallback(() => {
    if (!hasStrokeRef.current && historyRef.current.length === 0) return;
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!overlayCanvas || !maskCanvas) return;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    renderComposite();
    setHasStroke(false);
    hasStrokeRef.current = false;
    preStrokeRef.current = null;
    strokePointsRef.current = [];
    // 清除也写入历史，便于撤销。
    pushSnapshot();
  }, [pushSnapshot, renderComposite]);

  const handleCancelAdjust = React.useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const maskCtx = maskCanvas.getContext("2d");
      maskCtx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    renderComposite();
    // 取消后清空本次涂抹记录，回到查看模式。
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setHasStroke(false);
    hasStrokeRef.current = false;
    preStrokeRef.current = null;
    strokePointsRef.current = [];
    setIsAdjusting(false);
  }, []);

  /** Start drawing with the brush. */
  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isAdjusting) return;
      const point = resolveDrawPoint(event);
      if (!point) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    const maskCanvas = maskCanvasRef.current;
    const maskCtx = maskCanvas?.getContext("2d");
    if (maskCanvas && maskCtx) {
      preStrokeRef.current = {
        mask: maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
      };
    }
      strokePointsRef.current = [];
      isDrawingRef.current = true;
      setCursorPosition({ x: point.displayX, y: point.displayY });
      strokePointsRef.current.push([point.x, point.y, event.pressure || 0.5]);
      drawStroke(point);
    },
    [drawStroke, isAdjusting, resolveDrawPoint],
  );

  /** Continue drawing as the pointer moves. */
  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isAdjusting) return;
      const point = resolveDrawPoint(event);
      if (!point) return;
      setCursorPosition({ x: point.displayX, y: point.displayY });
      if (!isDrawingRef.current) return;
      strokePointsRef.current.push([point.x, point.y, event.pressure || 0.5]);
      drawStroke(point);
    },
    [drawStroke, isAdjusting, resolveDrawPoint],
  );

  /** Stop drawing when pointer ends. */
  const handlePointerUp = React.useCallback(() => {
    if (isDrawingRef.current) {
      preStrokeRef.current = null;
      strokePointsRef.current = [];
      pushSnapshot();
    }
    isDrawingRef.current = false;
  }, [pushSnapshot]);

  /** Reset cursor and drawing state on leave. */
  const handlePointerLeave = React.useCallback(() => {
    isDrawingRef.current = false;
    setCursorPosition(null);
  }, []);

  const handleBrushWheel = React.useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      if (!isAdjusting) return;
      if (!event.shiftKey && !event.ctrlKey) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const next = Math.min(
        BRUSH_MAX_SIZE,
        Math.max(BRUSH_MIN_SIZE, brushSize + direction * 4),
      );
      // 逻辑：滚轮/触控板缩放时调整画笔大小。
      setBrushSize(next);
    },
    [brushSize, isAdjusting],
  );

  React.useEffect(() => {
    if (!enableEdit || !isAdjusting) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRedo, handleUndo, isAdjusting]);

  /** Enter brush mode after validation checks. */
  const handleStartAdjust = React.useCallback(async () => {
    if (!dataUrl) return;
    if (!enableEdit) return;
    if (!chat?.addAttachments || (!chat?.addMaskedAttachment && !onApplyMask)) {
      toast.error("仅聊天中可用");
      return;
    }
    if (!hasS3Storage) {
      toast.error("需要配置 S3 存储服务");
      return;
    }
    if (rawChatSource !== "cloud" && rawChatSource !== "local") {
      toast.error("没有可用的图片调整模型，请添加或者使用云端模型");
      return;
    }
    const maskModels = modelOptions.filter((option) => supportsImageEdit(option));
    if (maskModels.length === 0) {
      toast.error("没有可用的图片调整模型，请添加或者使用云端模型");
      return;
    }
    maskModelIdRef.current = maskModels[0]?.id ?? "";
    setIsAdjusting(true);
  }, [chat, dataUrl, hasS3Storage, modelOptions, rawChatSource]);

  /** Finish brush mode and save to attachments. */
  const handleFinishAdjust = React.useCallback(async () => {
    if (!dataUrl) return;
    if (!enableEdit) return;
    if (!chat?.addAttachments || (!chat?.addMaskedAttachment && !onApplyMask)) {
      toast.error("仅聊天中可用");
      return;
    }
    const imageFile = await createFileFromUrl({
      url: dataUrl,
      fileName,
      fallbackType: mediaType,
    });
    if (!imageFile) {
      toast.error("图片处理失败");
      return;
    }

    if (!hasStroke || !maskCanvasRef.current || !overlayCanvasRef.current) {
      // 未涂抹时直接保存原图，不生成 mask。
      chat.addAttachments?.([imageFile]);
      setIsAdjusting(false);
      setHasStroke(false);
      hasStrokeRef.current = false;
      onClose?.();
      return;
    }

    const maskFileName = resolveMaskFileName(fileName);
    const maskFile = await canvasToPngFile(maskCanvasRef.current, maskFileName);
    if (!maskFile) {
      toast.error("遮罩生成失败");
      return;
    }

    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas || !imageSize.width || !imageSize.height) {
      toast.error("图片处理失败");
      return;
    }

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = imageSize.width;
    previewCanvas.height = imageSize.height;
    const previewCtx = previewCanvas.getContext("2d");
    if (!previewCtx) {
      toast.error("图片处理失败");
      return;
    }
    // 中文注释：预览使用合成后的 overlay 结果（包含棋盘格 + 透明区域）。
    previewCtx.drawImage(overlayCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
    const previewBlob = await new Promise<Blob | null>((resolve) => {
      previewCanvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!previewBlob) {
      toast.error("图片处理失败");
      return;
    }
    const previewUrl = URL.createObjectURL(previewBlob);

    // 仅保留一张带 mask 的附件，列表显示为涂抹后的预览图。
    const maskedInput = {
      file: imageFile,
      maskFile,
      previewUrl,
    };
    if (onApplyMask) {
      onApplyMask(maskedInput);
    } else {
      chat.addMaskedAttachment?.(maskedInput);
    }
    if (maskModelIdRef.current) {
      await setBasic({ modelDefaultChatModelId: maskModelIdRef.current });
    }
    setIsAdjusting(false);
    onClose?.();
  }, [
    chat,
    dataUrl,
    fileName,
    hasStroke,
    imageSize.height,
    imageSize.width,
    mediaType,
    onApplyMask,
    onClose,
    setBasic,
  ]);
  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择图片</div>;
  }

  if (isRelative && !shouldUseBinary && (!preview || preview.status === "loading")) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (shouldUseBinary && imageQuery.isLoading && !placeholderSrc) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (isRelative && !shouldUseBinary && preview?.status === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive/70" />
        <div className="text-base font-medium text-destructive">图片预览失败</div>
        <div className="text-xs text-muted-foreground">请检查文件路径或稍后重试</div>
      </div>
    );
  }

  if (shouldUseBinary && imageQuery.isError && !placeholderSrc) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive/70" />
        <div className="text-base font-medium text-destructive">图片加载失败</div>
        <div className="text-xs text-muted-foreground">
          {imageQuery.error?.message ?? "读取失败"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {showHeader ? (
        <div className="flex h-12 items-center justify-between border-b border-border/60 px-4">
          <div className="truncate text-sm font-medium text-foreground">
            {displayTitle}
          </div>
          <div className="flex items-center gap-2">
            {isAdjusting ? (
              <>
                <div className="flex items-center gap-2 text-muted-foreground/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    aria-label="撤销"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    aria-label="前进"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleClear}
                    disabled={!canUndo && !hasStroke}
                    aria-label="清除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <span className="text-muted-foreground/60" aria-hidden>
                  |
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={handleCancelAdjust}
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1">取消</span>
                </Button>
              </>
            ) : null}
            {showSave && !isAdjusting ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={handleSave}
                disabled={!canSave}
              >
                <Download className="h-4 w-4" />
                <span className="ml-1">保存</span>
              </Button>
            ) : null}
            {enableEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={isAdjusting ? handleFinishAdjust : handleStartAdjust}
              >
                <Sparkles
                  className={`h-4 w-4 ${isAdjusting ? "text-emerald-500" : "text-sky-500"}`}
                />
                <span className="ml-1">{isAdjusting ? "完成" : "修改"}</span>
              </Button>
            ) : null}
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="关闭"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div ref={wrapperRef} className="flex-1 overflow-hidden p-1">
        {dataUrl ? (
          showAdjustLayer ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="relative">
                <img
                  ref={imageRef}
                  src={dataUrl}
                  alt={displayTitle}
                  className="block max-h-full max-w-full select-none object-contain opacity-0"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onLoad={handleImageLoad}
                />
                <canvas
                  ref={overlayCanvasRef}
                  className={`absolute inset-0 h-full w-full ${
                    isAdjusting ? "cursor-none" : "pointer-events-none"
                  }`}
                  style={{ pointerEvents: isAdjusting ? "auto" : "none", touchAction: "none" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  onWheel={handleBrushWheel}
                />
                {isAdjusting && cursorPosition ? (
                  <div
                    className="pointer-events-none absolute rounded-full border border-white/70 bg-white/30"
                    style={{
                      width: brushSize,
                      height: brushSize,
                      left: cursorPosition.x,
                      top: cursorPosition.y,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <TransformWrapper
              ref={transformRef}
              initialScale={fitScale}
              minScale={fitScale}
              maxScale={3}
              centerOnInit
              limitToBounds
              wheel={{ smoothStep: 0.01 }}
              pinch={{ step: 8 }}
            >
              <TransformComponent
                wrapperClass="h-full w-full"
                contentClass="flex h-full w-full items-center justify-center"
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <img
                  ref={imageRef}
                  src={dataUrl}
                  alt={displayTitle}
                  className="block max-h-full max-w-full select-none object-contain"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onLoad={handleImageLoad}
                />
              </TransformComponent>
            </TransformWrapper>
          )
        ) : (
          <div className="h-full w-full text-sm text-muted-foreground">
            无法预览该图片
          </div>
        )}
      </div>
    </div>
  );
}
