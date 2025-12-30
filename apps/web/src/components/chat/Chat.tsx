"use client";

import { cn } from "@/lib/utils";
import ChatProvider from "./ChatProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";
import { generateId } from "ai";
import * as React from "react";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  formatFileSize,
  isSupportedImageFile,
} from "./chat-attachments";
import type { ChatAttachment } from "./chat-attachments";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";

type ChatProps = {
  className?: string;
  panelKey?: string;
  tabId?: string;
  sessionId?: string;
  loadHistory?: boolean;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean }
  ) => void;
} & Record<string, unknown>;

export function Chat({
  className,
  panelKey: _panelKey,
  tabId,
  sessionId,
  loadHistory,
  onSessionChange,
  ...params
}: ChatProps) {
  const projectId =
    typeof params.projectId === "string" ? params.projectId : undefined;
  const { workspace } = useWorkspace();
  const workspaceId = typeof workspace?.id === "string" ? workspace.id : undefined;
  const requestParams = React.useMemo(
    () => ({ ...params }),
    [params]
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragCounterRef = React.useRef(0);
  const attachmentsRef = React.useRef<ChatAttachment[]>([]);
  const sessionIdRef = React.useRef<string>(sessionId ?? generateId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);

  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const [isDragActive, setIsDragActive] = React.useState(false);

  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  React.useEffect(() => {
    if (sessionId) return;
    onSessionChange?.(effectiveSessionId, { loadHistory: false });
  }, [sessionId, effectiveSessionId, onSessionChange]);

  React.useEffect(() => {
    /**
     * 组件卸载时回收 objectUrl，避免内存泄漏。
     */
    return () => {
      for (const attachment of attachmentsRef.current) {
        URL.revokeObjectURL(attachment.objectUrl);
      }
    };
  }, []);

  const removeAttachment = React.useCallback((attachmentId: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === attachmentId);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((item) => item.id !== attachmentId);
    });
  }, []);

  const clearAttachments = React.useCallback(() => {
    setAttachments((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.objectUrl);
      return [];
    });
  }, []);

  /** Upload a chat image file to server cache and return image path. */
  const uploadChatImage = React.useCallback(async (file: File): Promise<string> => {
    const base = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
    if (!workspaceId) {
      throw new Error("上传失败（缺少 workspaceId）");
    }
    const formData = new FormData();
    formData.append("file", file);
    if (workspaceId) formData.append("workspaceId", workspaceId);
    if (projectId) formData.append("projectId", projectId);
    const res = await fetch(`${base}/chat/attachments`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`上传失败（${res.status}）`);
    }
    const data = (await res.json()) as { imagePath?: string };
    if (!data?.imagePath) {
      throw new Error("上传失败（缺少 imagePath）");
    }
    return data.imagePath;
  }, [projectId, workspaceId]);

  const addAttachments = React.useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const next: ChatAttachment[] = [];
    for (const file of fileArray) {
      if (!isSupportedImageFile(file)) {
        continue;
      }
      if (file.size > CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
        const objectUrl = URL.createObjectURL(file);
        next.push({
          id: generateId(),
          uploadStatus: "error",
          file,
          objectUrl,
          status: "error",
          errorMessage: `文件过大（${formatFileSize(file.size)}），请小于 ${formatFileSize(
            CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES
          )}`,
        });
        continue;
      }

      const objectUrl = URL.createObjectURL(file);
      next.push({
        id: generateId(),
        uploadStatus: "uploading",
        file,
        objectUrl,
        status: "loading",
      });
    }

    if (next.length === 0) return;

    setAttachments((prev) => [...prev, ...next]);

    /**
     * 仅用于 UI “loading”，通过预加载图片来判断何时可展示缩略图。
     */
    for (const item of next) {
      if (item.status !== "loading") continue;
      const image = new Image();
      image.onload = () => {
        setAttachments((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "ready" } : it
          )
        );
      };
      image.onerror = () => {
        setAttachments((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: "error",
                  uploadStatus: "error",
                  errorMessage: "图片解析失败，请尝试重新选择",
                }
              : it
          )
        );
      };
      image.src = item.objectUrl;
    }

    for (const item of next) {
      if (item.uploadStatus !== "uploading") continue;
      // 中文注释：图片选择后立即上传到服务端缓存，发送时只透传路径。
      void uploadChatImage(item.file)
        .then((imagePath) => {
          setAttachments((prev) =>
            prev.map((it) =>
              it.id === item.id ? { ...it, imagePath, uploadStatus: "ready" } : it
            )
          );
        })
        .catch((err) => {
          setAttachments((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    uploadStatus: "error",
                    status: "error",
                    errorMessage:
                      err instanceof Error ? err.message : "图片上传失败，请重试",
                  }
                : it
            )
          );
        });
    }
  }, []);

  const handleDragEnter = React.useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragActive(false);
  }, []);

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      addAttachments(event.dataTransfer.files);
    },
    [addAttachments]
  );

  return (
    <ChatProvider
      key={effectiveSessionId}
      tabId={tabId}
      sessionId={effectiveSessionId}
      loadHistory={effectiveLoadHistory}
      params={requestParams}
      onSessionChange={onSessionChange}
    >
      <div
        ref={rootRef}
        className={cn(
          "relative flex h-full w-full flex-col min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden",
          className
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      <ChatHeader loadHistory={effectiveLoadHistory} />
        <MessageList className="flex-1 min-h-0" />
        <ChatInput
          attachments={attachments}
          onAddAttachments={addAttachments}
          onRemoveAttachment={removeAttachment}
          onClearAttachments={clearAttachments}
        />

        <DragDropOverlay
          open={isDragActive}
          title="松开鼠标即可添加图片"
          radiusClassName="rounded-2xl"
          description={
            <>
              支持 PNG / JPEG / WebP，单文件不超过{" "}
              {formatFileSize(CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES)}，可多选
            </>
          }
        />
      </div>
    </ChatProvider>
  );
}
