"use client";

import { type UIMessage } from "@ai-sdk/react";
import React from "react";
import {
  closeFilePreview,
  openFilePreview,
  useFilePreviewStore,
} from "@/components/file/lib/file-preview-store";
import MaskedImage from "@/components/file/MaskedImage";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useProjects } from "@/hooks/use-projects";
import { useChatSession } from "@/components/chat/context";
import { setImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveBaseName, resolveFileName } from "@/lib/image/uri";
import { handleChatMentionPointerDown } from "@/lib/chat/mention-pointer";
import { resolveProjectRootUri } from "@/lib/chat/mention-pointer";
import {
  buildUriFromRoot,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { IMAGE_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import ChatMessageText from "./ChatMessageText";
import MessageFile from "./tools/MessageFile";
import { FILE_TOKEN_REGEX } from "../input/chat-input-utils";

interface MessageHumanProps {
  message: UIMessage;
  className?: string;
  showText?: boolean;
}

type ImagePreviewState = {
  status: "loading" | "ready" | "error";
  src?: string;
};

type FileTokenMatch = {
  /** Raw token string with leading "@". */
  token: string;
  /** Token string without line range. */
  pathToken: string;
  /** Resolved project id. */
  projectId: string;
  /** Project-relative path. */
  relativePath: string;
};

function isImageFilePart(
  part: any,
): part is { type: "file"; url: string; mediaType?: string; purpose?: string } {
  return Boolean(part) && part.type === "file" && typeof part.url === "string";
}

function isImageMediaType(mediaType?: string) {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

/** Parse a text block that only contains a single file token. */
function parseSingleFileToken(text: string, defaultProjectId?: string): FileTokenMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  FILE_TOKEN_REGEX.lastIndex = 0;
  const match = FILE_TOKEN_REGEX.exec(trimmed);
  if (!match) return null;
  if (match[0] !== trimmed) return null;
  const rawToken = match[0] ?? "";
  const normalizedValue = match[1] ?? "";
  const rangeMatch = normalizedValue.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = rangeMatch?.[1] ?? normalizedValue;
  const parsed = parseScopedProjectPath(baseValue);
  const projectId = parsed?.projectId ?? defaultProjectId;
  if (!projectId || !parsed?.relativePath) return null;
  return {
    token: rawToken,
    pathToken: `@${baseValue}`,
    projectId,
    relativePath: parsed.relativePath,
  };
}

/** Resolve image media type from a relative path. */
function resolveImageMediaType(relativePath: string): string {
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  if (!IMAGE_EXTS.has(ext)) return "";
  if (ext === "jpg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  return `image/${ext}`;
}

/** Resolve the base file name from a url. */
function resolveBaseNameFromUrl(url: string) {
  const fileName = resolveFileName(url);
  return resolveBaseName(fileName);
}

/** Render a human text part with optional file preview. */
function MessageHumanTextPart(props: {
  /** Raw text content. */
  text: string;
  /** Shared text class name. */
  className?: string;
  /** Workspace id for file lookup. */
  workspaceId?: string;
  /** Default project id for scoped path resolve. */
  projectId?: string;
  /** Project tree for resolving root uri. */
  projects: Array<{ projectId?: string; rootUri?: string; title?: string; children?: any[] }>;
}) {
  const { text, className, workspaceId, projectId, projects } = props;
  const fileToken = React.useMemo(
    () => parseSingleFileToken(text, projectId),
    [text, projectId],
  );
  // 中文注释：缓存文件存在性查询结果，存在时渲染为 MessageFile。
  const [fileEntry, setFileEntry] = React.useState<any | null>();

  React.useEffect(() => {
    if (!fileToken) {
      setFileEntry(undefined);
      return;
    }
    if (!workspaceId) return;
    const rootUri = resolveProjectRootUri(projects, fileToken.projectId);
    if (!rootUri) {
      setFileEntry(null);
      return;
    }
    const uri = buildUriFromRoot(rootUri, fileToken.relativePath);
    if (!uri) {
      setFileEntry(null);
      return;
    }
    let cancelled = false;
    // 中文注释：异步校验文件是否存在，存在时再切换为 MessageFile 渲染。
    void queryClient
      .fetchQuery(
        trpc.fs.stat.queryOptions({
          workspaceId,
          projectId: fileToken.projectId,
          uri,
        }),
      )
      .then((entry) => {
        if (cancelled) return;
        setFileEntry(entry ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setFileEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileToken, projects, workspaceId]);

  if (fileToken && fileEntry?.kind === "file") {
    const mediaType = resolveImageMediaType(fileToken.relativePath);
    return (
      <MessageFile
        url={fileToken.pathToken}
        mediaType={mediaType}
        title={resolveFileName(fileToken.relativePath)}
        className={className}
      />
    );
  }

  return <ChatMessageText value={text} className={className} />;
}

export default function MessageHuman({
  message,
  className,
  showText = true,
}: MessageHumanProps) {
  const { data: projects = [] } = useProjects();
  const { projectId, workspaceId } = useChatSession();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const [imageState, setImageState] = React.useState<Record<string, ImagePreviewState>>({});
  const imageStateRef = React.useRef<Record<string, ImagePreviewState>>({});
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const previewSourceId = React.useId();
  const activePreviewSourceId = useFilePreviewStore((state) => state.payload?.sourceId);
  const handleMentionPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleChatMentionPointerDown(event, {
        activeTabId,
        workspaceId,
        projectId,
        projects,
        pushStackItem,
      });
    },
    [activeTabId, projectId, projects, pushStackItem, workspaceId]
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
    <div className={cn("flex justify-end min-w-0", className)}>
      <div
        className="max-w-[80%] min-w-0 max-h-64 overflow-auto show-scrollbar p-3 rounded-lg bg-primary/85 text-primary-foreground border border-primary/35 shadow-sm"
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
              <MessageHumanTextPart
                key={`text-${index}`}
                text={part.text}
                className="text-primary-foreground text-[12px] leading-4"
                workspaceId={workspaceId}
                projectId={projectId}
                projects={projects}
              />
            );
          })}
      </div>
    </div>
  );
}
