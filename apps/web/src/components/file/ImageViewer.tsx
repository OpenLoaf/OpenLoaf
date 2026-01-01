"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import React from "react";
import {
  getCenterPosition,
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { trpc } from "@/utils/trpc";

interface ImageViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
}

/** Render an image preview panel. */
export default function ImageViewer({ uri, name }: ImageViewerProps) {
  const isTeatimeFile = typeof uri === "string" && uri.startsWith("teatime-file://");
  const isDataUrl = typeof uri === "string" && uri.startsWith("data:");
  const shouldUseFs = typeof uri === "string" && uri.startsWith("file://");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const transformRef = React.useRef<ReactZoomPanPinchRef | null>(null);
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = React.useState({ width: 0, height: 0 });
  const [fitScale, setFitScale] = React.useState(1);
  const appliedRef = React.useRef<string | null>(null);

  const imageQuery = useQuery(
    shouldUseFs
      ? trpc.fs.readBinary.queryOptions({ uri: uri! })
      : { queryKey: ["fs.readBinary", "skip"], queryFn: skipToken }
  );
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
        const apiBase = process.env.NEXT_PUBLIC_SERVER_URL;
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
    7};
    void run();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri, isTeatimeFile]);

  React.useEffect(() => {
    appliedRef.current = null;
  }, [uri, isTeatimeFile]);

  const payload = shouldUseFs ? imageQuery.data : null;
  // 中文注释：用 base64 构造 dataUrl，避免浏览器直接访问 file:// 资源。
  const dataUrl = isDataUrl
    ? uri
    : payload?.contentBase64 && payload?.mime
      ? `data:${payload.mime};base64,${payload.contentBase64}`
      : preview?.src ?? "";

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
  }, []);

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
    if (appliedRef.current === dataUrl) return;
    const instance = transformRef.current?.instance;
    if (instance?.wrapperComponent && instance.contentComponent) {
      const { positionX, positionY } = getCenterPosition(
        nextScale,
        instance.wrapperComponent,
        instance.contentComponent
      );
      // 中文注释：首次加载时按容器尺寸适配到完整显示。
      transformRef.current?.setTransform(positionX, positionY, nextScale, 0);
    }
    appliedRef.current = dataUrl;
  }, [containerSize, dataUrl, imageSize.height, imageSize.width]);
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
      <div ref={wrapperRef} className="flex-1 overflow-hidden p-4">
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
