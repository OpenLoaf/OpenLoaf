"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import ImageViewer from "@/components/file/ImageViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import CodeViewer from "@/components/file/CodeViewer";
import PdfViewer from "@/components/file/PdfViewer";
import DocViewer from "@/components/file/DocViewer";
import ExcelViewer from "@/components/file/ExcelViewer";
import FileViewer from "@/components/file/FileViewer";
import VideoViewer from "@/components/file/VideoViewer";
import { getImageDialogSize, type ImageMeta } from "@/lib/image/dialog-size";
import { useFilePreviewStore, closeFilePreview } from "@/components/file/lib/file-preview-store";

/** Calculate preview dialog size based on media dimensions and viewport limits. */
function getVideoDialogSize(meta: { width: number; height: number; hasHeader?: boolean }) {
  const padding = 32;
  const headerHeight = meta.hasHeader ? 48 : 0;
  const minWidth = 576;
  const maxWidth = Math.floor(window.innerWidth * 0.9);
  const maxHeight = Math.floor(window.innerHeight * 0.9);
  const maxContentWidth = Math.max(maxWidth - padding, 1);
  const maxContentHeight = Math.max(maxHeight - padding - headerHeight, 1);
  const minContentWidth = Math.min(minWidth, maxContentWidth);
  const clampedWidth = Math.min(meta.width, maxContentWidth);
  // 逻辑：按视频比例等比缩放，保持弹窗适配视窗范围。
  let contentHeight = Math.round((meta.height * clampedWidth) / meta.width);
  let contentWidth = clampedWidth;
  // 逻辑：设置最小宽度避免控件进入小布局。
  if (contentWidth < minContentWidth) {
    contentWidth = minContentWidth;
    contentHeight = Math.round((meta.height * contentWidth) / meta.width);
  }
  if (contentHeight > maxContentHeight) {
    contentHeight = maxContentHeight;
    contentWidth = Math.round((meta.width * contentHeight) / meta.height);
  }
  return {
    width: contentWidth + padding,
    height: contentHeight + padding + headerHeight,
  };
}

/** Render a shared file preview dialog with optional navigation. */
export default function FilePreviewDialog() {
  const payload = useFilePreviewStore((state) => state.payload);
  const currentItem = payload?.items[payload.activeIndex] ?? null;
  const isImage = payload?.viewer === "image";
  const isVideo = payload?.viewer === "video";
  const canPrev = Boolean(payload && payload.activeIndex > 0);
  const canNext = Boolean(payload && payload.activeIndex < (payload.items.length - 1));
  const [imageMeta, setImageMeta] = React.useState<ImageMeta | null>(null);
  const [dialogSize, setDialogSize] = React.useState<{ width: number; height: number } | null>(
    null
  );
  const [videoDialogSize, setVideoDialogSize] = React.useState<
    { width: number; height: number } | null
  >(null);

  React.useEffect(() => {
    if (!payload || !currentItem?.uri) {
      setImageMeta(null);
      setDialogSize(null);
      setVideoDialogSize(null);
      return;
    }
    if (!isImage) {
      setImageMeta(null);
      setDialogSize(null);
    }
    if (!isVideo) {
      setVideoDialogSize(null);
    }
    setImageMeta(null);
    setDialogSize(null);
  }, [currentItem?.uri, isImage, isVideo, payload]);

  React.useEffect(() => {
    if (!imageMeta) return;
    const update = () => {
      setDialogSize(getImageDialogSize(imageMeta));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [imageMeta]);

  React.useEffect(() => {
    if (!isVideo) return;
    const width = currentItem?.width;
    const height = currentItem?.height;
    const hasHeader = Boolean(currentItem?.title?.trim());
    if (!width || !height || width <= 0 || height <= 0) {
      console.info("[FilePreviewDialog] video size missing", {
        uri: currentItem?.uri,
        width,
        height,
      });
      setVideoDialogSize(null);
      return;
    }
    const update = () => {
      const size = getVideoDialogSize({ width, height, hasHeader });
      console.info("[FilePreviewDialog] video dialog size", {
        uri: currentItem?.uri,
        width,
        height,
        size,
      });
      setVideoDialogSize(size);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [currentItem?.height, currentItem?.width, isVideo]);

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
            ? `h-auto w-auto max-h-[80vh] max-w-none sm:max-w-none p-0 overflow-hidden grid gap-4 border border-border/60 bg-background shadow-lg data-[state=open]:animate-none data-[state=closed]:animate-none ${
                dialogSize ? "opacity-100" : "opacity-100 min-h-[200px] min-w-[320px]"
              }`
            : isVideo && videoDialogSize
              ? "h-auto w-auto max-h-[90vh] max-w-none sm:max-w-none p-0 overflow-hidden transition-opacity duration-200"
              : "h-[90vh] w-[90vw] max-w-none sm:max-w-none p-0 overflow-hidden"
        }
        overlayClassName="bg-background/35 backdrop-blur-2xl"
        style={
          isImage && dialogSize
            ? { width: dialogSize.width, height: dialogSize.height }
            : isVideo && videoDialogSize
              ? { width: videoDialogSize.width, height: videoDialogSize.height }
              : undefined
        }
        showCloseButton={false}
        overlaySlot={
          <button
            type="button"
            className="fixed right-5 top-5 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="关闭"
            onClick={() => closeFilePreview()}
          >
            <X className="h-5 w-5" />
          </button>
        }
      >
        <DialogTitle className="sr-only">文件预览</DialogTitle>
        <DialogDescription className="sr-only">文件预览弹窗</DialogDescription>
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
              readOnly={payload.readOnly}
            />
          ) : null}

          {payload.viewer === "code" ? (
            <CodeViewer
              uri={currentItem.uri}
              name={currentItem.name}
              ext={currentItem.ext}
              rootUri={currentItem.rootUri}
              projectId={currentItem.projectId}
              readOnly={payload.readOnly}
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
              readOnly={payload.readOnly ?? true}
            />
          ) : null}

          {payload.viewer === "sheet" ? (
            <ExcelViewer
              uri={currentItem.uri}
              openUri={currentItem.openUri}
              name={currentItem.name}
              ext={currentItem.ext}
              projectId={currentItem.projectId}
              rootUri={currentItem.rootUri}
              readOnly={payload.readOnly ?? true}
            />
          ) : null}

          {payload.viewer === "video" ? (
            <VideoViewer
              uri={currentItem.uri}
              openUri={currentItem.openUri}
              name={currentItem.name}
              projectId={currentItem.projectId}
              rootUri={currentItem.rootUri}
              thumbnailSrc={currentItem.thumbnailSrc}
              width={currentItem.width}
              height={currentItem.height}
              forceLargeLayout
            />
          ) : null}

          {payload.viewer === "file" ? (
            <FileViewer
              uri={currentItem.uri}
              name={currentItem.name}
              ext={currentItem.ext}
              projectId={currentItem.projectId}
              rootUri={currentItem.rootUri}
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
