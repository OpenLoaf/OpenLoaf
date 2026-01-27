"use client";

import * as React from "react";
import type { MaskedAttachmentInput } from "@/components/chat/input/chat-attachments";
import {
  closeFilePreview,
  openFilePreview,
  useFilePreviewStore,
} from "@/components/file/lib/file-preview-store";
import type { FilePreviewItem } from "@/components/file/lib/file-preview-types";

export type ImagePreviewItem = {
  /** Base image uri. */
  uri: string;
  /** Optional mask uri. */
  maskUri?: string;
  /** Display title for the header. */
  title?: string;
  /** File name used for save. */
  saveName?: string;
  /** Media type for the image. */
  mediaType?: string;
};

interface ImagePreviewDialogProps {
  open: boolean;
  items: ImagePreviewItem[];
  activeIndex: number;
  onOpenChange: (open: boolean) => void;
  onActiveIndexChange?: (index: number) => void;
  showSave?: boolean;
  enableEdit?: boolean;
  saveDefaultDir?: string;
  onApplyMask?: (input: MaskedAttachmentInput) => void;
}

/** Bridge the legacy image preview props to the shared preview dialog. */
export default function ImagePreviewDialog({
  open,
  items,
  activeIndex,
  onOpenChange,
  onActiveIndexChange,
  showSave,
  enableEdit,
  saveDefaultDir,
  onApplyMask,
}: ImagePreviewDialogProps) {
  const sourceId = React.useId();
  const activeSourceId = useFilePreviewStore((state) => state.payload?.sourceId);

  const previewItems = React.useMemo<FilePreviewItem[]>(
    () =>
      items.map((item) => ({
        uri: item.uri,
        maskUri: item.maskUri,
        title: item.title,
        saveName: item.saveName,
        mediaType: item.mediaType,
      })),
    [items]
  );

  React.useEffect(() => {
    if (!open) {
      if (activeSourceId === sourceId) closeFilePreview();
      return;
    }
    if (!previewItems.length) return;
    openFilePreview({
      viewer: "image",
      sourceId,
      onClose: () => onOpenChange(false),
      items: previewItems,
      activeIndex,
      showSave,
      enableEdit,
      saveDefaultDir,
      onApplyMask,
      onActiveIndexChange,
    });
  }, [
    activeIndex,
    activeSourceId,
    enableEdit,
    onActiveIndexChange,
    onApplyMask,
    open,
    previewItems,
    saveDefaultDir,
    showSave,
    sourceId,
  ]);

  React.useEffect(() => {
    if (!open) return;
    if (!activeSourceId) return;
    if (activeSourceId === sourceId) return;
    onOpenChange(false);
  }, [activeSourceId, onOpenChange, open, sourceId]);

  return null;
}
