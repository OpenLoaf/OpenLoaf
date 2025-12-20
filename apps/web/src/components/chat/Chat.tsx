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
     * 中文备注：组件卸载时回收 objectUrl，避免内存泄漏。
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

    /**
     * 中文备注：仅用于 UI “loading”，通过预加载图片来判断何时可展示缩略图。
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
                  errorMessage: "图片解析失败，请尝试重新选择",
                }
              : it
          )
        );
      };
      image.src = item.objectUrl;
    }
  }, []);

  React.useEffect(() => {
    /**
     * 中文备注：监听 Tab 快捷键，按下后强制聚焦到输入框，便于快速进入输入状态。
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const inputElement = rootRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea[data-teatime-chat-input="true"]'
      );
      if (!inputElement) return;

      event.preventDefault();
      event.stopPropagation();
      inputElement.focus();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
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
      params={params}
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

        {isDragActive && (
          <div className="absolute inset-0 z-50 grid place-items-center">
            <div className="absolute inset-0 bg-background/35 backdrop-blur-xl" />
            <div className="relative mx-6 w-full max-w-md rounded-2xl border bg-background/70 px-5 py-4 shadow-lg backdrop-blur-xl">
              <div className="text-sm font-medium text-foreground">
                松开鼠标即可添加图片
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                支持 PNG / JPEG / WebP，单文件不超过{" "}
                {formatFileSize(CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES)}，可多选
              </div>
            </div>
          </div>
        )}
      </div>
    </ChatProvider>
  );
}
