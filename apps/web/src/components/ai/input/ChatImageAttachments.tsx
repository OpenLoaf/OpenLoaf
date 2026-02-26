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

import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import * as React from "react";
import { CHAT_ATTACHMENT_ACCEPT_ATTR, formatFileSize } from "./chat-attachments";
import type { ChatAttachment, MaskedAttachmentInput } from "./chat-attachments";
import {
  closeFilePreview,
  openFilePreview,
  useFilePreviewStore,
} from "@/components/file/lib/file-preview-store";

export type ChatImageAttachmentsHandle = {
  openPicker: () => void;
};

type ChatImageAttachmentsProps = {
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onReplaceMaskedAttachment?: (attachmentId: string, input: MaskedAttachmentInput) => void;
  enableEdit?: boolean;
  projectId?: string;
};

/**
 * 聊天输入框图片附件 UI（缩略图列表 + 预览 + 选择器），不包含上传业务逻辑。
 */
export const ChatImageAttachments = React.forwardRef<
  ChatImageAttachmentsHandle,
  ChatImageAttachmentsProps
>(function ChatImageAttachments(
  { attachments, onAddAttachments, onRemoveAttachment, onReplaceMaskedAttachment, enableEdit = true, projectId },
  ref
) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = React.useState<
    string | null
  >(null);
  const previewSourceId = React.useId();
  const activePreviewSourceId = useFilePreviewStore((state) => state.payload?.sourceId);

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

  const previewTitle = React.useMemo(() => {
    if (!previewAttachment) return "图片预览";
    return previewAttachment.file?.name || "图片预览";
  }, [previewAttachment]);

  const previewBaseUri = React.useMemo(() => {
    if (!previewAttachment) return "";
    if (previewAttachment.hasMask) {
      return previewAttachment.objectUrl || "";
    }
    return previewAttachment.remoteUrl || previewAttachment.objectUrl || "";
  }, [previewAttachment]);

  const previewMaskUri = React.useMemo(() => {
    if (!previewAttachment?.mask) return "";
    return previewAttachment.mask.remoteUrl || previewAttachment.mask.objectUrl || "";
  }, [previewAttachment]);

  const previewItems = React.useMemo(
    () =>
      previewAttachment
        ? [
            {
              uri: previewBaseUri,
              maskUri: previewMaskUri || undefined,
              title: previewTitle,
              saveName: previewAttachment.file.name,
              mediaType: previewAttachment.mediaType || previewAttachment.file.type,
              projectId,
            },
          ]
        : [],
    [previewAttachment, previewBaseUri, previewMaskUri, previewTitle, projectId]
  );

  React.useEffect(() => {
    if (!previewAttachment) {
      if (activePreviewSourceId === previewSourceId) closeFilePreview();
      return;
    }
    openFilePreview({
      viewer: "image",
      sourceId: previewSourceId,
      onClose: () => setPreviewAttachmentId(null),
      items: previewItems,
      activeIndex: 0,
      showSave: false,
      enableEdit,
      onApplyMask: (input) => {
        if (!previewAttachment || !onReplaceMaskedAttachment) return;
        onReplaceMaskedAttachment(previewAttachment.id, input);
      },
    });
  }, [
    activePreviewSourceId,
    enableEdit,
    onReplaceMaskedAttachment,
    previewAttachment,
    previewItems,
    previewSourceId,
  ]);

  React.useEffect(() => {
    if (!activePreviewSourceId) return;
    if (activePreviewSourceId === previewSourceId) return;
    if (!previewAttachmentId) return;
    setPreviewAttachmentId(null);
  }, [activePreviewSourceId, previewAttachmentId, previewSourceId]);

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
                  className={cn(
                    "group relative flex h-11 w-[200px] max-w-full overflow-hidden rounded-md border bg-muted/30",
                    isError && "border-destructive/40"
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex h-full w-full items-stretch text-left outline-none",
                      isReady
                        ? "cursor-zoom-in hover:bg-muted/40"
                        : "cursor-default"
                    )}
                    onClick={() => {
                      if (!isReady) return;
                      setPreviewAttachmentId(attachment.id);
                    }}
                  >
                    <div className="relative h-full w-11 shrink-0 overflow-hidden border-r bg-muted/40">
                      <img
                        src={attachment.objectUrl}
                        alt={attachment.file.name}
                        className={cn(
                          "h-full w-full object-cover",
                          isLoading && "opacity-60",
                          isError && "opacity-40 grayscale"
                        )}
                        draggable={false}
                      />
                      {attachment.hasMask && (
                        <div className="absolute bottom-1 left-1 rounded bg-emerald-500/80 px-1 py-0.5 text-[9px] leading-none text-white">
                          已调整
                        </div>
                      )}
                      {isLoading && (
                        <div className="absolute inset-0 grid place-items-center bg-background/25">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {isError && (
                        <div className="absolute left-1 top-1 rounded bg-destructive/80 px-1 py-0.5 text-[10px] leading-none text-white">
                          失败
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 px-2 pr-6">
                      <div className="truncate text-[11px] leading-4 text-foreground">
                        {attachment.file.name}
                      </div>
                      <div
                        className={cn(
                          "text-[9px] leading-3.5 text-muted-foreground",
                          isError && "text-destructive"
                        )}
                      >
                        {formatFileSize(attachment.file.size)}
                      </div>
                    </div>
                  </button>

                  {onRemoveAttachment && (
                    <button
                      type="button"
                      className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/70 text-foreground shadow-sm ring-1 ring-border/50 backdrop-blur transition-transform duration-150 ease-out hover:scale-125 hover:bg-background focus-visible:scale-125"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveAttachment(attachment.id);
                      }}
                      aria-label="移除附件"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </>
  );
});
