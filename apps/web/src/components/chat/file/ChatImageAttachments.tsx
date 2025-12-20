"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import * as React from "react";
import { CHAT_ATTACHMENT_ACCEPT_ATTR, formatFileSize } from "../chat-attachments";
import type { ChatAttachment } from "../chat-attachments";

export type ChatImageAttachmentsHandle = {
  openPicker: () => void;
};

type ChatImageAttachmentsProps = {
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
};

/**
 * 中文备注：聊天输入框图片附件 UI（缩略图列表 + 预览 + 选择器），不包含上传业务逻辑。
 */
export const ChatImageAttachments = React.forwardRef<
  ChatImageAttachmentsHandle,
  ChatImageAttachmentsProps
>(function ChatImageAttachments(
  { attachments, onAddAttachments, onRemoveAttachment },
  ref
) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = React.useState<
    string | null
  >(null);

  const previewableAttachments = React.useMemo(() => {
    return (attachments ?? []).filter((item) => item.status === "ready");
  }, [attachments]);

  const previewAttachment = React.useMemo(() => {
    if (!previewAttachmentId) return null;
    return (
      previewableAttachments.find((item) => item.id === previewAttachmentId) ??
      null
    );
  }, [previewAttachmentId, previewableAttachments]);

  const previewIndex = React.useMemo(() => {
    if (!previewAttachmentId) return -1;
    return previewableAttachments.findIndex(
      (item) => item.id === previewAttachmentId
    );
  }, [previewAttachmentId, previewableAttachments]);

  React.useEffect(() => {
    if (!previewAttachmentId) return;
    if (previewableAttachments.some((item) => item.id === previewAttachmentId)) {
      return;
    }
    setPreviewAttachmentId(null);
  }, [previewAttachmentId, previewableAttachments]);

  const openPicker = React.useCallback(() => {
    if (!onAddAttachments) return;
    fileInputRef.current?.click();
  }, [onAddAttachments]);

  React.useImperativeHandle(ref, () => ({ openPicker }), [openPicker]);

  const goToPrevPreview = React.useCallback(() => {
    if (previewIndex <= 0) return;
    const prev = previewableAttachments[previewIndex - 1];
    if (!prev) return;
    setPreviewAttachmentId(prev.id);
  }, [previewIndex, previewableAttachments]);

  const goToNextPreview = React.useCallback(() => {
    if (previewIndex < 0) return;
    const next = previewableAttachments[previewIndex + 1];
    if (!next) return;
    setPreviewAttachmentId(next.id);
  }, [previewIndex, previewableAttachments]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={CHAT_ATTACHMENT_ACCEPT_ATTR}
        multiple
        onChange={(event) => {
          if (!onAddAttachments) return;
          const files = event.target.files;
          if (!files || files.length === 0) return;
          onAddAttachments(files);
          event.target.value = "";
        }}
      />

      {attachments && attachments.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => {
              const isReady = attachment.status === "ready";
              const isLoading = attachment.status === "loading";
              const isError = attachment.status === "error";
              return (
                <div
                  key={attachment.id}
                  title={
                    attachment.errorMessage
                      ? attachment.errorMessage
                      : attachment.file.name
                  }
                  className="relative h-14 w-14 rounded-lg border bg-muted/30 overflow-hidden"
                >
                  <button
                    type="button"
                    className={cn(
                      "h-full w-full outline-none",
                      isReady ? "cursor-zoom-in" : "cursor-default"
                    )}
                    onClick={() => {
                      if (!isReady) return;
                      setPreviewAttachmentId(attachment.id);
                    }}
                  >
                    <img
                      src={attachment.objectUrl}
                      alt={attachment.file.name}
                      className={cn(
                        "h-full w-full object-cover",
                        isLoading && "opacity-50",
                        isError && "opacity-40 grayscale"
                      )}
                      draggable={false}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 grid place-items-center bg-background/35">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[10px] leading-none text-white">
                      {formatFileSize(attachment.file.size)}
                    </div>
                    {isError && (
                      <div className="absolute inset-x-1 top-1 rounded bg-destructive/80 px-1 py-0.5 text-[10px] leading-none text-white">
                        失败
                      </div>
                    )}
                  </button>

                  {onRemoveAttachment && (
                    <button
                      type="button"
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                      onClick={() => onRemoveAttachment(attachment.id)}
                      aria-label="移除附件"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(previewAttachment)}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachmentId(null);
        }}
      >
        <DialogContent
          className="w-fit max-w-[calc(100vw-1rem)] p-0 overflow-hidden sm:max-w-[calc(100vw-2rem)]"
          overlayClassName="bg-background/35 backdrop-blur-2xl"
        >
          <DialogTitle className="sr-only">图片预览</DialogTitle>
          {previewAttachment && (
            <div>
              <div className="flex items-center justify-center gap-4 px-4 py-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 shrink-0 rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-md hover:bg-background/90 disabled:opacity-30"
                  onClick={goToPrevPreview}
                  disabled={previewIndex <= 0}
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                <div
                  className="flex items-center justify-center "
                  onTouchStart={(event) => {
                    const touch = event.touches?.[0];
                    if (!touch) return;
                    touchStartRef.current = {
                      x: touch.clientX,
                      y: touch.clientY,
                    };
                  }}
                  onTouchEnd={(event) => {
                    const start = touchStartRef.current;
                    touchStartRef.current = null;
                    if (!start) return;
                    const touch = event.changedTouches?.[0];
                    if (!touch) return;
                    const dx = touch.clientX - start.x;
                    const dy = touch.clientY - start.y;
                    if (Math.abs(dx) < 40) return;
                    if (Math.abs(dx) < Math.abs(dy)) return;
                    // 中文备注：向左滑动切到下一张，向右滑动切到上一张。
                    if (dx < 0) goToNextPreview();
                    else goToPrevPreview();
                  }}
                >
                  <img
                    src={previewAttachment.objectUrl}
                    alt={previewAttachment.file.name}
                    className="block max-h-[70vh] w-auto max-w-[calc(100vw-10rem)] object-contain"
                    draggable={false}
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 shrink-0 rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-md hover:bg-background/90 disabled:opacity-30"
                  onClick={goToNextPreview}
                  disabled={
                    previewIndex < 0 ||
                    previewIndex >= previewableAttachments.length - 1
                  }
                  aria-label="下一张"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="px-4 pb-3 text-xs text-muted-foreground">
                <span className="text-foreground/90">
                  {previewAttachment.file.name}
                </span>{" "}
                <span className="text-muted-foreground">
                  · {formatFileSize(previewAttachment.file.size)}
                  {previewIndex >= 0 && previewableAttachments.length > 0
                    ? ` · ${previewIndex + 1}/${previewableAttachments.length}`
                    : ""}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});
