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
import { Download, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/utils/trpc";
import { resolveServerUrl } from "@/utils/server-url";

interface ImageViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  /** Optional header title for modal usage. */
  title?: string;
  /** Optional suggested base name for saving. */
  saveName?: string;
  /** Whether to show the header bar. */
  showHeader?: boolean;
  /** Whether to show the save button. */
  showSave?: boolean;
  /** Default directory for save dialog (file://... or local path). */
  saveDefaultDir?: string;
  /** Optional media type for file naming. */
  mediaType?: string;
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

/** Render an image preview panel. */
export default function ImageViewer({
  uri,
  name,
  ext,
  title,
  saveName,
  showHeader,
  showSave,
  saveDefaultDir,
  mediaType,
  onClose,
}: ImageViewerProps) {
  const isTeatimeFile = typeof uri === "string" && uri.startsWith("teatime-file://");
  const isDataUrl = typeof uri === "string" && uri.startsWith("data:");
  const shouldUseFs = typeof uri === "string" && uri.startsWith("file://");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const transformRef = React.useRef<ReactZoomPanPinchRef | null>(null);
  // 记录容器尺寸，用于计算图片适配缩放。
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = React.useState({ width: 0, height: 0 });
  const [fitScale, setFitScale] = React.useState(1);
  // 保存中状态，避免重复触发。
  const [isSaving, setIsSaving] = React.useState(false);
  const appliedRef = React.useRef<string>("");
  const isElectron = React.useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );

  const imageQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({ uri: uri ?? "" }),
    enabled: shouldUseFs && Boolean(uri),
  });
  const [preview, setPreview] = React.useState<{
    status: "loading" | "ready" | "error";
    src?: string;
  } | null>(null);

  React.useEffect(() => {
    if (!uri || !isTeatimeFile) return;
    let aborted = false;
    let objectUrl = "";
    const run = async () => {
      setPreview({ status: "loading" });
      try {
        const apiBase = resolveServerUrl();
        const endpoint = apiBase
          ? `${apiBase}/chat/attachments/preview?url=${encodeURIComponent(uri)}`
          : `/chat/attachments/preview?url=${encodeURIComponent(uri)}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("preview failed");
        const blob = await res.blob();
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
  }, [uri, isTeatimeFile]);

  const payload = shouldUseFs ? imageQuery.data : null;
  // 用 base64 构造 dataUrl，避免浏览器直接访问 file:// 资源。
  const dataUrl = isDataUrl
    ? uri
    : payload?.contentBase64 && payload?.mime
      ? `data:${payload.mime};base64,${payload.contentBase64}`
      : preview?.src ?? "";

  const displayTitle = title || name || uri || "图片预览";
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

  /** Save the preview image to a user-selected path. */
  const handleSave = async () => {
    if (!dataUrl) return;
    if (!canSave) return;
    setIsSaving(true);
    try {
      if (!isElectron || !window.teatimeElectron?.saveFile) {
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
      const result = await window.teatimeElectron.saveFile({
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
    appliedRef.current = "";
  }, [dataUrl]);

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
  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择图片</div>;
  }

  if (isTeatimeFile && (!preview || preview.status === "loading")) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (shouldUseFs && imageQuery.isLoading) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (isTeatimeFile && preview?.status === "error") {
    return (
      <div className="h-full w-full p-4 text-destructive">
        图片预览失败
      </div>
    );
  }

  if (shouldUseFs && imageQuery.isError) {
    return (
      <div className="h-full w-full p-4 text-destructive">
        {imageQuery.error?.message ?? "读取失败"}
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
            >
              <Sparkles className="h-4 w-4 text-sky-500" />
              <span className="ml-1">AI调整</span>
            </Button>
            {showSave ? (
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
                src={dataUrl}
                alt={name ?? uri}
                className="block max-h-full max-w-full select-none object-contain"
                loading="lazy"
                decoding="async"
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  // 记录图片原始尺寸，用于适配缩放比例。
                  setImageSize({ width: naturalWidth, height: naturalHeight });
                }}
              />
            </TransformComponent>
          </TransformWrapper>
        ) : (
          <div className="h-full w-full text-sm text-muted-foreground">
            无法预览该图片
          </div>
        )}
      </div>
    </div>
  );
}
