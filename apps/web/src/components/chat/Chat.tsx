"use client";

import { cn } from "@/lib/utils";
import ChatProvider from "./ChatProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";
import { generateId } from "ai";
import * as React from "react";
import {
  CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  formatFileSize,
  isSupportedImageFile,
} from "./chat-attachments";
import type { ChatAttachment } from "./chat-attachments";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import { useTabs } from "@/hooks/use-tabs";

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
  const requestParams = React.useMemo(
    () => ({ ...params }),
    [params]
  );
  const tab = useTabs((s) => (tabId ? s.getTabById(tabId) : undefined));
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragCounterRef = React.useRef(0);
  const attachmentsRef = React.useRef<ChatAttachment[]>([]);
  const sessionIdRef = React.useRef<string>(sessionId ?? generateId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);
  const projectId = typeof requestParams.projectId === "string" ? requestParams.projectId : "";
  const workspaceId = tab?.workspaceId ?? "";

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

  const updateAttachment = React.useCallback(
    (attachmentId: string, updates: Partial<ChatAttachment>) => {
      setAttachments((prev) =>
        prev.map((item) => (item.id === attachmentId ? { ...item, ...updates } : item))
      );
    },
    []
  );

  const uploadAttachment = React.useCallback(
    async (attachment: ChatAttachment) => {
      if (!workspaceId || !projectId) {
        updateAttachment(attachment.id, {
          status: "error",
          errorMessage: "当前标签页未绑定项目，无法上传图片",
        });
        return;
      }
      // 中文注释：上传后端生成 teatime-file 地址，后续仅存该引用。
      const formData = new FormData();
      formData.append("file", attachment.file);
      formData.append("workspaceId", workspaceId);
      formData.append("projectId", projectId);
      formData.append("sessionId", effectiveSessionId);

      try {
        const apiBase = process.env.NEXT_PUBLIC_SERVER_URL;
        const endpoint = apiBase ? `${apiBase}/chat/attachments` : "/chat/attachments";
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errorText = await res.text();
          updateAttachment(attachment.id, {
            status: "error",
            errorMessage: errorText || "图片上传失败，请重试",
          });
          return;
        }
        const data = (await res.json()) as {
          url?: string;
          mediaType?: string;
        };
        if (!data?.url) {
          updateAttachment(attachment.id, {
            status: "error",
            errorMessage: "图片上传失败：服务端未返回地址",
          });
          return;
        }
        updateAttachment(attachment.id, {
          status: "ready",
          remoteUrl: data.url,
          mediaType: data.mediaType ?? attachment.file.type,
        });
      } catch {
        updateAttachment(attachment.id, {
          status: "error",
          errorMessage: "图片上传失败，请检查网络连接",
        });
      }
    },
    [effectiveSessionId, projectId, updateAttachment, workspaceId]
  );

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
        file,
        objectUrl,
        status: "loading",
      });
    }

    if (next.length === 0) return;

    setAttachments((prev) => [...prev, ...next]);
    for (const item of next) {
      if (item.status !== "loading") continue;
      void uploadAttachment(item);
    }
  }, [uploadAttachment]);

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
