"use client";

import { type UIMessage } from "@ai-sdk/react";
import React from "react";
import ImagePreviewDialog from "@/components/file/ImagePreviewDialog";
import MaskedImage from "@/components/file/MaskedImage";
import { useTabs } from "@/hooks/use-tabs";
import { useProjects } from "@/hooks/use-projects";
import { useChatContext } from "@/components/chat/ChatProvider";
import { setImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveBaseName, resolveFileName } from "@/lib/image/uri";
import { handleChatMentionPointerDown } from "@/lib/chat/mention-pointer";
import { cn } from "@/lib/utils";
import ChatMessageText from "./ChatMessageText";

interface MessageHumanProps {
  message: UIMessage;
  className?: string;
  showText?: boolean;
}

type ImagePreviewState = {
  status: "loading" | "ready" | "error";
  src?: string;
};

function isImageFilePart(
  part: any,
): part is { type: "file"; url: string; mediaType?: string; purpose?: string } {
  return Boolean(part) && part.type === "file" && typeof part.url === "string";
}

function isImageMediaType(mediaType?: string) {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

/** Resolve the base file name from a url. */
function resolveBaseNameFromUrl(url: string) {
  const fileName = resolveFileName(url);
  return resolveBaseName(fileName);
}

export default function MessageHuman({
  message,
  className,
  showText = true,
}: MessageHumanProps) {
  const { data: projects = [] } = useProjects();
  const { projectId } = useChatContext();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const [imageState, setImageState] = React.useState<Record<string, ImagePreviewState>>({});
  const imageStateRef = React.useRef<Record<string, ImagePreviewState>>({});
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const handleMentionPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleChatMentionPointerDown(event, {
        activeTabId,
        projectId,
        projects,
        pushStackItem,
      });
    },
    [activeTabId, projectId, projects, pushStackItem]
  );

  React.useEffect(() => {
    imageStateRef.current = imageState;
  }, [imageState]);

  const imageParts = React.useMemo(() => {
    return (message.parts ?? []).filter((part: any) => {
      if (!isImageFilePart(part)) return false;
      return isImageMediaType(part.mediaType);
    }) as Array<{ type: "file"; url: string; mediaType?: string; purpose?: string }>;
  }, [message.parts]);

  const displayParts = React.useMemo(() => {
    const maskMap = new Map<string, { type: "file"; url: string; mediaType?: string }>();
    for (const part of imageParts) {
      if (part.purpose !== "mask") continue;
      const baseName = resolveBaseNameFromUrl(part.url).replace(/_mask$/i, "");
      if (!baseName) continue;
      maskMap.set(baseName, part);
    }
    // 将 mask 叠加到对应原图之上。
    return imageParts
      .filter((part) => part.purpose !== "mask")
      .map((part) => {
        const baseName = resolveBaseNameFromUrl(part.url);
        const mask = baseName ? maskMap.get(baseName) : undefined;
        return { ...part, mask };
      });
  }, [imageParts]);

  const previewableParts = React.useMemo(() => {
    return displayParts.filter((part) => {
      const preview = imageState[part.url];
      return preview?.status === "ready" && Boolean(preview.src);
    });
  }, [displayParts, imageState]);

  const previewIndex = React.useMemo(() => {
    if (!previewUrl) return -1;
    return previewableParts.findIndex((part) => part.url === previewUrl);
  }, [previewUrl, previewableParts]);

  const previewItems = React.useMemo(() => {
    return previewableParts.map((part) => ({
      uri: part.url,
      maskUri: part.mask?.url,
      title: resolveFileName(part.url),
      saveName: resolveFileName(part.url),
      mediaType: part.mediaType,
    }));
  }, [previewableParts]);

  React.useEffect(() => {
    let aborted = false;
    const objectUrls: string[] = [];

    const loadPreview = async (url: string) => {
      if (imageStateRef.current[url]) return;
      setImageState((prev) => ({ ...prev, [url]: { status: "loading" } }));
      try {
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
          const blob = await fetchBlobFromUri(url, { projectId });
          const objectUrl = URL.createObjectURL(blob);
          objectUrls.push(objectUrl);
          if (aborted) return;
          setImageState((prev) => ({
            ...prev,
            [url]: { status: "ready", src: objectUrl },
          }));
          return;
        }
        if (aborted) return;
        setImageState((prev) => ({
          ...prev,
          [url]: { status: "ready", src: url },
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
      void loadPreview(url);
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

  const handlePreviewIndexChange = React.useCallback(
    (nextIndex: number) => {
      const target = previewableParts[nextIndex];
      if (!target) return;
      setPreviewUrl(target.url);
    },
    [previewableParts]
  );

  return (
    <div className={cn("flex justify-end min-w-0", className)}>
      <div
        className="max-w-[80%] min-w-0 p-3 rounded-lg bg-primary/85 text-primary-foreground border border-primary/35 shadow-sm"
        onPointerDownCapture={handleMentionPointerDown}
      >
        {displayParts.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {displayParts.map((part, index) => {
              const preview = imageState[part.url];
              const maskPreview = part.mask?.url ? imageState[part.mask.url] : null;
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
                    <MaskedImage
                      baseSrc={preview.src}
                      maskSrc={maskPreview?.status === "ready" ? maskPreview.src : undefined}
                      alt="chat image"
                      containerClassName="max-h-16 max-w-[90px] overflow-hidden rounded-md border border-primary/40"
                      className="block max-h-16 max-w-[90px] object-contain"
                      maskClassName="max-h-16 max-w-[90px] object-contain opacity-70"
                      draggable
                      onDragStart={(event) => {
                        // 将合并展示的图片作为可拖拽附件源。
                        event.dataTransfer.effectAllowed = "copy";
                        const fileName = resolveFileName(part.url) || "image.png";
                        setImageDragPayload(event.dataTransfer, {
                          baseUri: part.url,
                          fileName,
                          maskUri: part.mask?.url,
                        });
                      }}
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
        {showText &&
          (message.parts ?? []).map((part: any, index: number) => {
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
      <ImagePreviewDialog
        open={previewIndex >= 0}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null);
        }}
        items={previewItems}
        activeIndex={previewIndex}
        onActiveIndexChange={handlePreviewIndexChange}
        showSave={false}
        enableEdit={false}
      />
    </div>
  );
}
