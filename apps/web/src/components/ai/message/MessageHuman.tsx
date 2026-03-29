/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { type UIMessage } from "@ai-sdk/react";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  closeFilePreview,
  openFilePreview,
  useFilePreviewStore,
} from "@/components/file/lib/file-preview-store";
import MaskedImage from "@/components/file/MaskedImage";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useProjects } from "@/hooks/use-projects";
import { useChatSession } from "@/components/ai/context";
import { setImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveBaseName, resolveFileName } from "@/lib/image/uri";
import { handleChatMentionPointerDown } from "@/lib/chat/mention-pointer";
import { cn } from "@/lib/utils";
import ChatMessageText from "./ChatMessageText";
import {
  Message,
  MessageContent,
  USER_MESSAGE_MUTED_TEXT_CLASS,
  USER_MESSAGE_SURFACE_CLASS,
  USER_MESSAGE_TEXT_CLASS,
} from "@/components/ai-elements/message";
import { Attachment, Attachments } from "@/components/ai-elements/attachments";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface MessageHumanProps {
  message: UIMessage;
  className?: string;
  showText?: boolean;
}

type ImagePreviewState = {
  status: "loading" | "ready" | "error";
  src?: string;
};

type HumanTextPart = {
  type: "text";
  text: string;
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

/** Merge consecutive text parts to keep user message rendering stable. */
function collectHumanTextChunks(parts: unknown[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const candidate = part as HumanTextPart;
    if (candidate.type !== "text") {
      if (current) {
        chunks.push(current);
        current = "";
      }
      continue;
    }
    const text = typeof candidate.text === "string" ? candidate.text : "";
    if (!text) continue;
    current += text;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Render a human text part as inline chips via ChatMessageText. */
function MessageHumanTextPart(props: {
  text: string;
  className?: string;
  projectId?: string;
}) {
  const { text, className, projectId } = props;
  return <ChatMessageText value={text} className={className} projectId={projectId} />;
}

export default function MessageHuman({
  message,
  className,
  showText = true,
}: MessageHumanProps) {
  const { t } = useTranslation('ai')
  const { data: projects = [] } = useProjects();
  const { projectId } = useChatSession();
  const pushStackItem = useLayoutState((s) => s.pushStackItem);
  const [imageState, setImageState] = React.useState<Record<string, ImagePreviewState>>({});
  const imageStateRef = React.useRef<Record<string, ImagePreviewState>>({});
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const previewSourceId = React.useId();
  const activePreviewSourceId = useFilePreviewStore((state) => state.payload?.sourceId);
  const handleMentionPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleChatMentionPointerDown(event, {
        activeTabId: "main",
        projectId,
        projects,
        pushStackItem: (_tabId: string, item: any) => pushStackItem(item),
      });
    },
    [projectId, projects, pushStackItem]
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
      projectId,
    }));
  }, [previewableParts, projectId]);

  const textChunks = React.useMemo(() => {
    return collectHumanTextChunks((message.parts ?? []) as unknown[]);
  }, [message.parts]);

  const handlePreviewIndexChange = React.useCallback(
    (nextIndex: number) => {
      const target = previewableParts[nextIndex];
      if (!target) return;
      setPreviewUrl(target.url);
    },
    [previewableParts]
  );

  React.useEffect(() => {
    if (previewIndex < 0) {
      if (activePreviewSourceId === previewSourceId) closeFilePreview();
      return;
    }
    const currentItem = previewItems[previewIndex];
    if (!currentItem) return;
    openFilePreview({
      viewer: "image",
      sourceId: previewSourceId,
      onClose: () => setPreviewUrl(null),
      items: previewItems,
      activeIndex: previewIndex,
      showSave: false,
      enableEdit: false,
      onActiveIndexChange: handlePreviewIndexChange,
    });
  }, [
    activePreviewSourceId,
    handlePreviewIndexChange,
    previewIndex,
    previewItems,
    previewSourceId,
  ]);

  React.useEffect(() => {
    if (!activePreviewSourceId) return;
    if (activePreviewSourceId === previewSourceId) return;
    if (!previewUrl) return;
    setPreviewUrl(null);
  }, [activePreviewSourceId, previewSourceId, previewUrl]);

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

  return (
    <Message from="user" className={cn("max-w-[88%] min-w-0", className)}>
      <MessageContent
        className={cn(
          "max-h-64 overflow-x-hidden overflow-y-auto show-scrollbar border p-3 shadow-none",
          USER_MESSAGE_SURFACE_CLASS,
        )}
        onPointerDownCapture={handleMentionPointerDown}
      >
        {displayParts.length > 0 && (
          <Attachments variant="grid" className="justify-end gap-2">
            {displayParts.map((part, index) => {
              const preview = imageState[part.url];
              const maskPreview = part.mask?.url ? imageState[part.mask.url] : null;
              return (
                <Attachment
                  data={
                    {
                      id: `human-image:${part.url}:${index}`,
                      type: "file",
                      url: part.url,
                      filename: resolveFileName(part.url),
                      mediaType: part.mediaType || "image/png",
                    } as any
                  }
                  key={`${part.url}-${index}`}
                  className="!size-auto overflow-visible rounded-3xl border border-[var(--ol-chat-human-border)] bg-transparent p-0"
                  onClick={() => {
                    if (!preview?.src) return;
                    openPreview(part.url);
                  }}
                  draggable={preview?.status === "ready" && Boolean(preview.src)}
                  onDragStart={(event) => {
                    if (!(preview?.status === "ready" && preview.src)) return;
                    // 将合并展示的图片作为可拖拽附件源。
                    event.dataTransfer.effectAllowed = "copy";
                    const fileName = resolveFileName(part.url) || "image.png";
                    setImageDragPayload(event.dataTransfer, {
                      baseUri: part.url,
                      fileName,
                      maskUri: part.mask?.url,
                    });
                  }}
                >
                  {preview?.status === "ready" && preview.src ? (
                    <MaskedImage
                      baseSrc={preview.src}
                      maskSrc={maskPreview?.status === "ready" ? maskPreview.src : undefined}
                      alt="chat image"
                      containerClassName="max-h-16 max-w-[90px] overflow-hidden rounded-3xl border border-[var(--ol-chat-human-border)]"
                      className="block max-h-16 max-w-[90px] object-contain"
                      maskClassName="max-h-16 max-w-[90px] object-contain opacity-70"
                    />
                  ) : preview?.status === "error" ? (
                    <div className={cn("text-xs", USER_MESSAGE_MUTED_TEXT_CLASS)}>{t('image.loadFailed')}</div>
                  ) : (
                    <Shimmer className={cn("text-xs", USER_MESSAGE_MUTED_TEXT_CLASS)}>
                      {t('image.loading')}
                    </Shimmer>
                  )}
                </Attachment>
              );
            })}
          </Attachments>
        )}
        {showText &&
          textChunks.map((text, index) => (
            <MessageHumanTextPart
              key={`text-${index}`}
              text={text}
              className={cn(USER_MESSAGE_TEXT_CLASS, "text-[12px] leading-4 break-words")}
              projectId={projectId}
            />
          ))}
      </MessageContent>
    </Message>
  );
}
