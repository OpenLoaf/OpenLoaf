"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ImageViewer from "@/components/file/ImageViewer";
import type { MaskedAttachmentInput } from "@/components/chat/chat-attachments";
import { getImageDialogSize, type ImageMeta } from "@/lib/image/dialog-size";

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

/** Render a unified image preview dialog with optional navigation. */
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
  const currentItem = items[activeIndex] ?? null;
  const canPrev = activeIndex > 0;
  const canNext = activeIndex >= 0 && activeIndex < items.length - 1;
  const [imageMeta, setImageMeta] = React.useState<ImageMeta | null>(null);
  const [dialogSize, setDialogSize] = React.useState<{ width: number; height: number } | null>(
    null
  );

  React.useEffect(() => {
    if (!open || !currentItem?.uri) {
      setImageMeta(null);
      setDialogSize(null);
      return;
    }
    setImageMeta(null);
    setDialogSize(null);
  }, [currentItem?.uri, open]);

  React.useEffect(() => {
    if (!imageMeta) return;
    const update = () => {
      setDialogSize(getImageDialogSize(imageMeta));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [imageMeta]);

  if (!currentItem) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false);
      }}
    >
      <DialogContent
        className="h-auto w-auto max-h-[80vh] max-w-none sm:max-w-none p-0 overflow-hidden flex flex-col gap-0"
        overlayClassName="bg-background/35 backdrop-blur-2xl"
        style={dialogSize ? { width: dialogSize.width, height: dialogSize.height } : undefined}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <div className="relative h-full w-full">
          <ImageViewer
            uri={currentItem.uri}
            title={currentItem.title}
            saveName={currentItem.saveName}
            mediaType={currentItem.mediaType}
            showHeader
            showSave={showSave}
            enableEdit={enableEdit}
            initialMaskUri={currentItem.maskUri}
            onImageMeta={(meta) => setImageMeta(meta)}
            onApplyMask={onApplyMask}
            onClose={() => onOpenChange(false)}
            saveDefaultDir={saveDefaultDir}
          />
          {items.length > 1 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-12 w-12 shrink-0 rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-md hover:bg-background/90 disabled:opacity-30"
                onClick={() => {
                  if (!onActiveIndexChange || !canPrev) return;
                  onActiveIndexChange(activeIndex - 1);
                }}
                disabled={!canPrev}
                aria-label="上一张"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-12 w-12 shrink-0 rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-md hover:bg-background/90 disabled:opacity-30"
                onClick={() => {
                  if (!onActiveIndexChange || !canNext) return;
                  onActiveIndexChange(activeIndex + 1);
                }}
                disabled={!canNext}
                aria-label="下一张"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
