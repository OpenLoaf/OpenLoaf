"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useChatContext } from "@/components/chat/ChatProvider";
import ImagePreviewDialog from "@/components/file/ImagePreviewDialog";
import { useProject } from "@/hooks/use-project";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import { setImageDragPayload } from "@/lib/image/drag";

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

/** Check whether the media type is an image type. */
function isImageMediaType(mediaType?: string) {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

/** Check whether the value is a relative path. */
function isRelativePath(value: string) {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Render file part for AI messages. */
export default function MessageFile({ url, mediaType, title, className }: MessageFileProps) {
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  // 控制图片预览弹窗开关。
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const isImage = isImageMediaType(mediaType);
  const shouldFetchPreview = isImage && isRelativePath(url);
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
        const blob = await fetchBlobFromUri(url, { projectId });
        objectUrl = URL.createObjectURL(blob);
        if (aborted) return;
        setPreview({ status: "ready", src: objectUrl });
      } catch {
        if (aborted) return;
        setPreview({ status: "error" });
      }
    };

    // 相对路径需要走预览接口获取可展示的 blob。
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

  const resolvedSrc = shouldFetchPreview ? preview?.src ?? "" : url;

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
          draggable
          onDragStart={(event) => {
            // 允许将消息内图片拖入输入框，复用当前图片来源。
            event.dataTransfer.effectAllowed = "copy";
            const fallbackName = title?.trim() || resolveFileName(url, mediaType);
            setImageDragPayload(event.dataTransfer, { baseUri: url, fileName: fallbackName });
          }}
        />
      </button>
      <ImagePreviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        items={[
          {
            uri: url,
            title: dialogTitle,
            saveName,
            mediaType,
          },
        ]}
        activeIndex={0}
        showSave
        enableEdit
        saveDefaultDir={projectRootUri}
      />
    </>
  );
}
