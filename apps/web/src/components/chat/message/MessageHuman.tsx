"use client";

import { type UIMessage } from "@ai-sdk/react";
import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ChatMessageText from "./ChatMessageText";

interface MessageHumanProps {
  message: UIMessage;
  className?: string;
}

type ImagePreviewState = {
  status: "loading" | "ready" | "error";
  src?: string;
};

function isImageFilePart(part: any): part is { type: "file"; url: string; mediaType?: string } {
  return Boolean(part) && part.type === "file" && typeof part.url === "string";
}

function isImageMediaType(mediaType?: string) {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

export default function MessageHuman({
  message,
  className,
}: MessageHumanProps) {
  const [imageState, setImageState] = React.useState<Record<string, ImagePreviewState>>({});
  const imageStateRef = React.useRef<Record<string, ImagePreviewState>>({});
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    imageStateRef.current = imageState;
  }, [imageState]);

  const imageParts = React.useMemo(() => {
    return (message.parts ?? []).filter((part: any) => {
      if (!isImageFilePart(part)) return false;
      return isImageMediaType(part.mediaType);
    }) as Array<{ type: "file"; url: string; mediaType?: string }>;
  }, [message.parts]);

  const previewableParts = React.useMemo(() => {
    return imageParts.filter((part) => {
      const preview = imageState[part.url];
      return preview?.status === "ready" && Boolean(preview.src);
    });
  }, [imageParts, imageState]);

  const previewIndex = React.useMemo(() => {
    if (!previewUrl) return -1;
    return previewableParts.findIndex((part) => part.url === previewUrl);
  }, [previewUrl, previewableParts]);

  const previewImage = React.useMemo(() => {
    if (!previewUrl) return null;
    const preview = imageState[previewUrl];
    if (!preview?.src) return null;
    return preview.src;
  }, [imageState, previewUrl]);

  React.useEffect(() => {
    let aborted = false;
    const objectUrls: string[] = [];

    const loadPreview = async (url: string) => {
      if (imageStateRef.current[url]) return;
      setImageState((prev) => ({ ...prev, [url]: { status: "loading" } }));
      try {
        const apiBase = process.env.NEXT_PUBLIC_SERVER_URL;
        const endpoint = apiBase
          ? `${apiBase}/chat/attachments/preview?url=${encodeURIComponent(url)}`
          : `/chat/attachments/preview?url=${encodeURIComponent(url)}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("preview failed");
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        if (aborted) return;
        setImageState((prev) => ({
          ...prev,
          [url]: { status: "ready", src: objectUrl },
        }));
      } catch {
        if (aborted) return;
        setImageState((prev) => ({ ...prev, [url]: { status: "error" } }));
      }
    };

    for (const part of imageParts) {
      const url = part.url;
      if (!url) continue;
      if (url.startsWith("data:")) {
        if (!imageStateRef.current[url]) {
          setImageState((prev) => ({
            ...prev,
            [url]: { status: "ready", src: url },
          }));
        }
        continue;
      }
      if (url.startsWith("teatime-file://")) {
        void loadPreview(url);
      }
    }

    return () => {
      aborted = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [imageParts]);

  const openPreview = React.useCallback((url: string) => {
    if (!url) return;
    setPreviewUrl(url);
  }, []);

  const goToPrevPreview = React.useCallback(() => {
    if (previewIndex <= 0) return;
    const prev = previewableParts[previewIndex - 1];
    if (!prev) return;
    setPreviewUrl(prev.url);
  }, [previewIndex, previewableParts]);

  const goToNextPreview = React.useCallback(() => {
    if (previewIndex < 0) return;
    const next = previewableParts[previewIndex + 1];
    if (!next) return;
    setPreviewUrl(next.url);
  }, [previewIndex, previewableParts]);

  return (
    <div className={cn("flex justify-end min-w-0", className)}>
      <div className="max-w-[80%] min-w-0 p-3 rounded-lg bg-primary text-primary-foreground">
        {imageParts.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {imageParts.map((part, index) => {
              const preview = imageState[part.url];
              return (
                <button
                  key={`${part.url}-${index}`}
                  type="button"
                  className="text-left"
                  onClick={() => {
                    if (!preview?.src) return;
                    openPreview(part.url);
                  }}
                >
                  {preview?.status === "ready" && preview.src ? (
                    <img
                      src={preview.src}
                      alt="chat image"
                      className="max-h-16 max-w-[90px] rounded-md border border-primary/30 object-contain"
                    />
                  ) : preview?.status === "error" ? (
                    <div className="text-xs text-primary-foreground/80">图片加载失败</div>
                  ) : (
                    <div className="text-xs text-primary-foreground/80">图片加载中...</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {(message.parts ?? []).map((part: any, index: number) => {
          if (part?.type !== "text") return null;
          if (typeof part.text !== "string" || !part.text) return null;
          return (
            <ChatMessageText
              key={`text-${index}`}
              value={part.text}
              className="text-primary-foreground"
            />
          );
        })}
      </div>
      <Dialog
        open={Boolean(previewImage)}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null);
        }}
      >
        <DialogContent
          className="w-fit max-w-[calc(100vw-1rem)] p-0 overflow-hidden sm:max-w-[calc(100vw-2rem)]"
          overlayClassName="bg-background/35 backdrop-blur-2xl"
        >
          <DialogTitle className="sr-only">图片预览</DialogTitle>
          {previewImage && (
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

                <div className="flex items-center justify-center">
                  <img
                    src={previewImage}
                    alt="chat image preview"
                    className="max-h-[70vh] max-w-[80vw] object-contain"
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 shrink-0 rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-md hover:bg-background/90 disabled:opacity-30"
                  onClick={goToNextPreview}
                  disabled={previewIndex < 0 || previewIndex >= previewableParts.length - 1}
                  aria-label="下一张"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
