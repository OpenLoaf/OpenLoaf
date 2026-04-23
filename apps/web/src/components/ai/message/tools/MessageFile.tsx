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

import React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useChatSession } from "@/components/ai/context";
import {
  Attachment,
  AttachmentInfo,
  Attachments,
  AttachmentPreview,
} from "@/components/ai-elements/attachments";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useProject } from "@/hooks/use-project";
import {
  fetchBlobFromUri,
  isPreviewTooLargeError,
  resolveFileName,
} from "@/lib/image/uri";
import { createFileEntryFromUri, openFilePreview } from "@/components/file/lib/open-file";
import { applyChatImageDrag } from "@/lib/image/drag";
import { ChatImageActions } from "./shared/ChatImageActions";
import {
  formatSize,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { resolveMediaTypeFromPath } from "@/lib/format-utils";

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
  /** Error kind for preview failures. */
  errorKind?: "too-large";
  /** Size in bytes for the original file. */
  sizeBytes?: number;
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
  const isImage = isImageMediaType(mediaType);
  const shouldFetchPreview = isImage && isRelativePath(url);
  const { projectId, sessionId } = useChatSession();
  const projectQuery = useProject(projectId);
  const projectRootUri = projectQuery.data?.project?.rootUri;

  /** Open the current file with system default application. */
  const handleOpenWithSystem = React.useCallback(() => {
    // 逻辑：仅桌面端可用，优先解析本地路径后交给系统打开。
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    const resolvedUri = resolveFileUriFromRoot(projectRootUri, url);
    if (!resolvedUri) {
      toast.error("未找到文件路径");
      return;
    }
    void api.openPath({ uri: resolvedUri }).then((res) => {
      if (!res?.ok) {
        toast.error(res?.reason ?? "无法打开文件");
      }
    });
  }, [projectRootUri, url]);

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
        const blob = await fetchBlobFromUri(url, { projectId, sessionId });
        objectUrl = URL.createObjectURL(blob);
        if (aborted) return;
        setPreview({ status: "ready", src: objectUrl });
      } catch (error) {
        if (aborted) return;
        if (isPreviewTooLargeError(error)) {
          setPreview({
            status: "error",
            errorKind: "too-large",
            sizeBytes: error.sizeBytes,
          });
          return;
        }
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

  const resolvedSrc = shouldFetchPreview ? preview?.src ?? "" : url;
  const resolvedName = title?.trim() || resolveFileName(url, mediaType);
  const dialogTitle = resolvedName || "图片预览";
  const entry = React.useMemo(
    () =>
      createFileEntryFromUri({
        uri: url,
        name: resolvedName || dialogTitle,
        mediaType,
      }),
    [dialogTitle, mediaType, resolvedName, url]
  );

  if (shouldFetchPreview && preview?.status === "loading") {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        <Shimmer>图片加载中...</Shimmer>
      </div>
    );
  }

  if (shouldFetchPreview && preview?.status === "error") {
    if (preview.errorKind === "too-large") {
      const sizeLabel = formatSize(preview.sizeBytes);
      return (
        <div className={cn("flex flex-col gap-2 text-xs text-muted-foreground", className)}>
          <div>文件过大（{sizeLabel}），请使用系统工具打开</div>
          <div>
            <PromptInputButton
              type="button"
              size="sm"
              variant="outline"
              onClick={handleOpenWithSystem}
            >
              系统打开
            </PromptInputButton>
          </div>
        </div>
      );
    }
    return <div className={cn("text-xs text-muted-foreground", className)}>图片加载失败</div>;
  }

  if (isImage && !resolvedSrc) return null;
  const attachmentUrl = isImage ? resolvedSrc : url;
  const attachmentMediaType = mediaType || resolveMediaTypeFromPath(url);
  const variant = isImage ? "grid" : "inline";

  return (
    <Attachments
      variant={variant}
      className={cn(
        className,
        isImage ? "max-w-[560px]" : "max-w-full",
      )}
    >
      <Attachment
        data={
          {
            id: `message-file:${url}`,
            type: "file",
            url: attachmentUrl,
            filename: resolvedName,
            mediaType: attachmentMediaType,
          } as any
        }
        className={cn(
          "cursor-pointer",
          isImage
            ? "!size-auto max-h-[70vh] max-w-full overflow-hidden rounded-3xl [&_img]:!size-auto [&_img]:max-h-[70vh] [&_img]:max-w-full [&_img]:w-auto [&_img]:h-auto [&_img]:block [&_img]:object-contain"
            : undefined,
        )}
        onClick={() => {
          if (!entry) return;
          openFilePreview({
            entry,
            projectId,
            sessionId,
            rootUri: projectRootUri,
            mode: "stack",
          });
        }}
        draggable
        onDragStart={(event) => {
          applyChatImageDrag(event, {
            url,
            name: title?.trim() || undefined,
            thumbnailUrl: resolvedSrc || undefined,
          });
        }}
      >
        <AttachmentPreview className={cn(isImage ? "!h-auto !w-auto bg-transparent" : undefined)} />
        {!isImage ? <AttachmentInfo showMediaType /> : null}
        {isImage ? (
          <ChatImageActions
            url={url}
            name={resolvedName}
            objectUrl={shouldFetchPreview ? resolvedSrc || undefined : undefined}
          />
        ) : null}
      </Attachment>
    </Attachments>
  );
}
