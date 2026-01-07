"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useChatContext } from "@/components/chat/ChatProvider";
import ImageViewer from "@/components/file/ImageViewer";
import { useProject } from "@/hooks/use-project";
import { resolveServerUrl } from "@/utils/server-url";

interface MessageFileProps {
  /** File URL to render. */
  url: string;
  /** File media type (e.g. image/png). */
  mediaType?: string;
  /** Title text displayed in the preview header. */
  title?: string;
  /** Extra class names for the container. */
  className?: string;
}

type PreviewState = {
  /** Preview loading status. */
  status: "loading" | "ready" | "error";
  /** Resolved preview src. */
  src?: string;
};

type ImageMeta = {
  /** Natural width of the image. */
  width: number;
  /** Natural height of the image. */
  height: number;
};

/** Check whether the media type is an image type. */
function isImageMediaType(mediaType?: string) {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

/** Check whether the url is a data url. */
function isDataUrl(url: string) {
  return url.startsWith("data:");
}

/** Check whether the url is a teatime-file url. */
function isTeatimeFileUrl(url: string) {
  return url.startsWith("teatime-file://");
}

/** Resolve preview endpoint for a teatime-file url. */
function getPreviewEndpoint(url: string) {
  const apiBase = resolveServerUrl();
  const encoded = encodeURIComponent(url);
  return apiBase
    ? `${apiBase}/chat/attachments/preview?url=${encoded}`
    : `/chat/attachments/preview?url=${encoded}`;
}

/** Calculate preview dialog size based on image metadata and viewport. */
function getDialogSize(meta: ImageMeta) {
  const padding = 16;
  const headerHeight = 48;
  const maxWidth = Math.floor(window.innerWidth * 0.9);
  const maxHeight = Math.floor(window.innerHeight * 0.8);
  const maxContentWidth = Math.max(maxWidth - padding * 2, 1);
  const maxContentHeight = Math.max(maxHeight - padding * 2 - headerHeight, 1);
  const clampedWidth = Math.min(meta.width, maxContentWidth);
  let contentHeight = Math.round((meta.height * clampedWidth) / meta.width);
  let contentWidth = clampedWidth;
  if (contentHeight > maxContentHeight) {
    contentHeight = maxContentHeight;
    contentWidth = Math.round((meta.width * contentHeight) / meta.height);
  }
  return {
    width: contentWidth + padding * 2,
    height: contentHeight + padding * 2 + headerHeight,
  };
}

/** Render file part for AI messages. */
export default function MessageFile({ url, mediaType, title, className }: MessageFileProps) {
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  // 记录图片原始尺寸，用于计算弹窗自适应大小。
  const [imageMeta, setImageMeta] = React.useState<ImageMeta | null>(null);
  // 弹窗尺寸（包含 ImageViewer 内边距）。
  const [dialogSize, setDialogSize] = React.useState<{ width: number; height: number } | null>(null);
  // 控制图片预览弹窗开关。
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const isImage = isImageMediaType(mediaType);
  const shouldFetchPreview = isImage && isTeatimeFileUrl(url);
  const shouldUseDataUrl = isImage && isDataUrl(url);
  const chat = useChatContext();
  const projectId = chat.projectId;
  const projectQuery = useProject(projectId);
  const projectRootUri = projectQuery.data?.project?.rootUri;

  React.useEffect(() => {
    if (!shouldFetchPreview) {
      setPreview(null);
      return;
    }

    let aborted = false;
    let objectUrl = "";

    const run = async () => {
      setPreview({ status: "loading" });
      try {
        const res = await fetch(getPreviewEndpoint(url));
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

    // teatime-file 需要走预览接口获取可展示的 blob。
    void run();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shouldFetchPreview, url]);

  if (!isImage) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        不支持的文件类型
      </div>
    );
  }

  const resolvedSrc = shouldUseDataUrl
    ? url
    : shouldFetchPreview
      ? preview?.src ?? ""
      : url;

  React.useEffect(() => {
    if (!resolvedSrc) {
      setImageMeta(null);
      setDialogSize(null);
      return;
    }
    let aborted = false;
    const img = new Image();
    img.onload = () => {
      if (aborted) return;
      setImageMeta({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (aborted) return;
      setImageMeta(null);
      setDialogSize(null);
    };
    img.src = resolvedSrc;
    return () => {
      aborted = true;
    };
  }, [resolvedSrc]);

  React.useEffect(() => {
    if (!imageMeta) {
      setDialogSize(null);
      return;
    }
    const update = () => {
      setDialogSize(getDialogSize(imageMeta));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [imageMeta]);

  if (shouldFetchPreview && preview?.status === "loading") {
    return <div className={cn("text-xs text-muted-foreground", className)}>图片加载中...</div>;
  }

  if (shouldFetchPreview && preview?.status === "error") {
    return <div className={cn("text-xs text-muted-foreground", className)}>图片加载失败</div>;
  }

  if (!resolvedSrc) return null;

  const saveName = title?.trim() || undefined;
  const dialogTitle = saveName || "图片预览";

  return (
    <>
      <button
        type="button"
        className={cn("text-left", className)}
        onClick={() => setIsPreviewOpen(true)}
      >
        <img
          src={resolvedSrc}
          alt="assistant file"
          className="max-h-64 max-w-full rounded-md border border-border/60 object-contain"
          loading="lazy"
        />
      </button>
      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          if (!open) setIsPreviewOpen(false);
        }}
      >
        <DialogContent
          className="h-auto w-auto max-h-[80vh] max-w-[90vw] sm:max-w-[90vw] p-0 overflow-hidden flex flex-col gap-0"
          overlayClassName="bg-background/35 backdrop-blur-2xl"
          style={dialogSize ? { width: dialogSize.width, height: dialogSize.height } : undefined}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
          <ImageViewer
            uri={url}
            title={dialogTitle}
            saveName={saveName}
            mediaType={mediaType}
            showHeader
            showSave
            onClose={() => setIsPreviewOpen(false)}
            saveDefaultDir={projectRootUri}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
