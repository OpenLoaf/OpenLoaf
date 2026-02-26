/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

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
import { setImageDragPayload } from "@/lib/image/drag";
import {
  formatSize,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { FILE_DRAG_REF_MIME } from "@/components/project/filesystem/utils/file-system-utils";

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

/** Build a file reference string for drag payload. */
function buildFileRefText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isRelativePath(trimmed) && !trimmed.startsWith("@[")) return "";
  if (trimmed.startsWith("@")) return trimmed;
  return `@${trimmed}`;
}

/** Render file part for AI messages. */
export default function MessageFile({ url, mediaType, title, className }: MessageFileProps) {
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const isImage = isImageMediaType(mediaType);
  const shouldFetchPreview = isImage && isRelativePath(url);
  const fileRefText = React.useMemo(() => buildFileRefText(url), [url]);
  const { projectId } = useChatSession();
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
        const blob = await fetchBlobFromUri(url, { projectId });
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
  const attachmentUrl = isImage ? resolvedSrc : url;
  const attachmentMediaType = mediaType || (isImage ? "image/png" : "application/octet-stream");
  const variant = isImage ? "grid" : "inline";

  return (
    <Attachments
      variant={variant}
      className={cn(
        isImage ? "max-w-xs" : "max-w-full",
        className,
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
          isImage ? "!size-auto overflow-hidden rounded-md border border-border/60" : undefined,
        )}
        onClick={() => {
          if (!entry) return;
          openFilePreview({
            entry,
            projectId,
            rootUri: projectRootUri,
            mode: "modal",
            modal: {
              showSave: true,
              enableEdit: true,
              saveDefaultDir: projectRootUri,
            },
          });
        }}
        draggable
        onDragStart={(event) => {
          // 允许将消息内图片拖入输入框，复用当前图片来源。
          event.dataTransfer.effectAllowed = "copy";
          const fallbackName = title?.trim() || resolveFileName(url, mediaType);
          setImageDragPayload(event.dataTransfer, { baseUri: url, fileName: fallbackName });
          // 中文注释：拖拽到输入框时附带文件引用，便于插入 @path 并在末尾补空格。
          if (fileRefText) {
            event.dataTransfer.setData(FILE_DRAG_REF_MIME, fileRefText);
            event.dataTransfer.setData("text/plain", `${fileRefText} `);
          }
        }}
      >
        <AttachmentPreview className={cn(isImage ? "!h-auto !w-auto bg-transparent" : undefined)} />
        {!isImage ? <AttachmentInfo showMediaType /> : null}
      </Attachment>
    </Attachments>
  );
}
