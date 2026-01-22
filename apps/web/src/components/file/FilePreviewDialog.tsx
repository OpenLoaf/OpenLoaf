"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ImageViewer from "@/components/file/ImageViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import CodeViewer from "@/components/file/CodeViewer";
import PdfViewer from "@/components/file/PdfViewer";
import DocViewer from "@/components/file/DocViewer";
import SheetViewer from "@/components/file/SheetViewer";
import FileViewer from "@/components/file/FileViewer";
import { getImageDialogSize, type ImageMeta } from "@/lib/image/dialog-size";
import { useFilePreviewStore, closeFilePreview } from "@/components/file/lib/file-preview-store";

/** Render a shared file preview dialog with optional navigation. */
export default function FilePreviewDialog() {
  const payload = useFilePreviewStore((state) => state.payload);
  const currentItem = payload?.items[payload.activeIndex] ?? null;
  const isImage = payload?.viewer === "image";
  const canPrev = Boolean(payload && payload.activeIndex > 0);
  const canNext = Boolean(payload && payload.activeIndex < (payload.items.length - 1));
  const [imageMeta, setImageMeta] = React.useState<ImageMeta | null>(null);
  const [dialogSize, setDialogSize] = React.useState<{ width: number; height: number } | null>(
    null
  );

  React.useEffect(() => {
    if (!payload || !currentItem?.uri) {
      setImageMeta(null);
      setDialogSize(null);
      return;
    }
    if (!isImage) {
      setImageMeta(null);
      setDialogSize(null);
      return;
    }
    setImageMeta(null);
    setDialogSize(null);
  }, [currentItem?.uri, isImage, payload]);

  React.useEffect(() => {
    if (!imageMeta) return;
    const update = () => {
      setDialogSize(getImageDialogSize(imageMeta));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [imageMeta]);

  if (!payload || !currentItem) return null;

  return (
    <Dialog
      open={Boolean(payload)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeFilePreview();
      }}
    >
      <DialogContent
        className={
          isImage
            ? `h-auto w-auto max-h-[80vh] max-w-none sm:max-w-none p-0 overflow-hidden flex flex-col gap-0 transition-opacity duration-200 ${
                dialogSize ? "opacity-100" : "opacity-100 min-h-[200px] min-w-[320px]"
              }`
            : "h-[90vh] w-[90vw] max-w-none p-0 overflow-hidden"
        }
        overlayClassName="bg-background/35 backdrop-blur-2xl"
        style={isImage && dialogSize ? { width: dialogSize.width, height: dialogSize.height } : undefined}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">文件预览</DialogTitle>
        <DialogClose
          className="fixed right-4 top-4 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </DialogClose>
        <div className="relative h-full w-full">
          {payload.viewer === "image" ? (
            <ImageViewer
              uri={currentItem.uri}
              title={currentItem.title}
              saveName={currentItem.saveName}
              mediaType={currentItem.mediaType}
              projectId={currentItem.projectId}
              showHeader
              showSave={payload.showSave}
              enableEdit={payload.enableEdit}
              initialMaskUri={currentItem.maskUri}
              onImageMeta={(meta) => setImageMeta(meta)}
              onApplyMask={payload.onApplyMask}
              onClose={() => closeFilePreview()}
              saveDefaultDir={payload.saveDefaultDir}
            />
          ) : null}

          {payload.viewer === "markdown" ? (
            <MarkdownViewer
              uri={currentItem.uri}
              openUri={currentItem.openUri}
              name={currentItem.name}
              ext={currentItem.ext}
              rootUri={currentItem.rootUri}
              projectId={currentItem.projectId}
            />
          ) : null}

          {payload.viewer === "code" ? (
            <CodeViewer
              uri={currentItem.uri}
              name={currentItem.name}
              ext={currentItem.ext}
              rootUri={currentItem.rootUri}
              projectId={currentItem.projectId}
            />
          ) : null}

          {payload.viewer === "pdf" ? (
            <PdfViewer
              uri={currentItem.uri}
              openUri={currentItem.openUri}
              name={currentItem.name}
              ext={currentItem.ext}
              projectId={currentItem.projectId}
              rootUri={currentItem.rootUri}
            />
          ) : null}

          {payload.viewer === "doc" ? (
            <DocViewer
              uri={currentItem.uri}
              openUri={currentItem.openUri}
              name={currentItem.name}
              ext={currentItem.ext}
              projectId={currentItem.projectId}
              rootUri={currentItem.rootUri}
              readOnly
            />
          ) : null}

          {payload.viewer === "sheet" ? (
            <SheetViewer
              uri={currentItem.uri}
              openUri={currentItem.openUri}
              name={currentItem.name}
              ext={currentItem.ext}
              projectId={currentItem.projectId}
              rootUri={currentItem.rootUri}
              readOnly
            />
          ) : null}

          {payload.viewer === "file" ? (
            <FileViewer
              uri={currentItem.uri}
              name={currentItem.name}
              ext={currentItem.ext}
              projectId={currentItem.projectId}
            />
          ) : null}

          {!isImage ? null : null}

          {payload.viewer === "image" && payload.items.length > 1 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-12 w-12 shrink-0 rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-md hover:bg-background/90 disabled:opacity-30"
                onClick={() => {
                  if (!payload.onActiveIndexChange || !canPrev) return;
                  payload.onActiveIndexChange(payload.activeIndex - 1);
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
                  if (!payload.onActiveIndexChange || !canNext) return;
                  payload.onActiveIndexChange(payload.activeIndex + 1);
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
