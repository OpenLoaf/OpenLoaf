"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

interface ImageViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
}

/** Render an image preview panel. */
export default function ImageViewer({ uri, name }: ImageViewerProps) {
  const imageQuery = useQuery(
    trpc.fs.readBinary.queryOptions(uri ? { uri } : skipToken)
  );

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择图片</div>;
  }

  if (imageQuery.isLoading) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (imageQuery.isError) {
    return (
      <div className="h-full w-full p-4 text-destructive">
        {imageQuery.error?.message ?? "读取失败"}
      </div>
    );
  }

  const payload = imageQuery.data;
  // 中文注释：用 base64 构造 dataUrl，避免浏览器直接访问 file:// 资源。
  const dataUrl =
    payload?.contentBase64 && payload?.mime
      ? `data:${payload.mime};base64,${payload.contentBase64}`
      : "";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        {dataUrl ? (
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={dataUrl}
              alt={name ?? uri}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : (
          <div className="h-full w-full text-sm text-muted-foreground">
            无法预览该图片
          </div>
        )}
      </div>
    </div>
  );
}
