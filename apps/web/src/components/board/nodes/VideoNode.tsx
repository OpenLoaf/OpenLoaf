/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasConnectorTemplateDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import Hls from "hls.js";
import { Info, Loader2, Play, Sparkles } from "lucide-react";
import i18next from "i18next";
import { BOARD_TOOLBAR_ITEM_BLUE, BOARD_TOOLBAR_ITEM_GREEN } from "../ui/board-style-system";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "./imagePromptGenerate";
import { getBoardChatMessageMeta } from "../utils/board-chat-message";
import { createBoardChatMessageToolbarItems } from "../utils/board-chat-toolbar";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";
import { useBoardContext, type BoardFileContext } from "../core/BoardProvider";
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { resolveServerUrl } from "@/utils/server-url";
import { NodeFrame } from "./NodeFrame";

export type VideoNodeProps = {
  /** Project-relative path for the video. */
  sourcePath: string;
  /** Display name for the video. */
  fileName?: string;
  /** Optional poster path for preview. */
  posterPath?: string;
  /** Optional duration in seconds. */
  duration?: number;
  /** Optional video width in pixels. */
  naturalWidth?: number;
  /** Optional video height in pixels. */
  naturalHeight?: number;
};

/** Resolve a board-scoped path into a project-relative path. */
function resolveProjectRelativePath(path: string, fileContext?: BoardFileContext) {
  const scope = resolveBoardFolderScope(fileContext);
  return resolveProjectPathFromBoardUri({
    uri: path,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
}

/** Open video in the file preview dialog (same as double-click). */
async function openVideoPreview(props: VideoNodeProps, fileContext?: BoardFileContext) {
  const boardId = isBoardRelativePath(props.sourcePath) ? (fileContext?.boardId ?? "") : "";
  const projectRelativePath = resolveProjectRelativePath(props.sourcePath, fileContext);
  const resolvedPath = projectRelativePath || props.sourcePath;
  const displayName = props.fileName || resolvedPath.split("/").pop() || "Video";

  const metadata = await fetchVideoMetadata({
    projectId: fileContext?.projectId,
    uri: projectRelativePath || props.sourcePath,
  });
  openFilePreview({
    viewer: "video",
    items: [
      {
        uri: props.sourcePath,
        openUri: resolvedPath,
        name: displayName,
        title: displayName,
        width: metadata?.width ?? props.naturalWidth,
        height: metadata?.height ?? props.naturalHeight,
        projectId: fileContext?.projectId,
        rootUri: fileContext?.rootUri,
        boardId,
      },
    ],
    activeIndex: 0,
    showSave: false,
    enableEdit: false,
  });
}

/** Build toolbar items for video nodes. */
function createVideoToolbarItems(ctx: CanvasToolbarContext<VideoNodeProps>) {
  const baseItems = [
    {
      id: 'play',
      label: i18next.t('board:videoNode.toolbar.play'),
      icon: <Play size={14} />,
      className: BOARD_TOOLBAR_ITEM_GREEN,
      onSelect: () => void openVideoPreview(ctx.element.props, ctx.fileContext),
    },
    {
      id: 'inspect',
      label: i18next.t('board:videoNode.toolbar.detail'),
      icon: <Info size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
  const messageMeta = getBoardChatMessageMeta(ctx.element);
  if (!messageMeta) return baseItems;
  const chatItems = createBoardChatMessageToolbarItems(ctx, messageMeta);
  return (messageMeta.status ?? "streaming") === "complete"
    ? [...chatItems, ...baseItems]
    : chatItems;
}

/** Build an HLS manifest URL for a project-relative video path. */
function buildHlsManifestUrl(
  path: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path });
  if (ids.projectId) query.set("projectId", ids.projectId);
  if (ids.boardId) query.set("boardId", ids.boardId);
  const prefix = baseUrl ? `${baseUrl}/media/hls/manifest` : "/media/hls/manifest";
  return `${prefix}?${query.toString()}`;
}

/** Build an HLS quality manifest URL. */
function buildHlsQualityUrl(
  path: string,
  quality: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path, quality });
  if (ids.projectId) query.set("projectId", ids.projectId);
  if (ids.boardId) query.set("boardId", ids.boardId);
  const prefix = baseUrl ? `${baseUrl}/media/hls/manifest` : "/media/hls/manifest";
  return `${prefix}?${query.toString()}`;
}

/** Render a video node card with inline HLS playback. */
export function VideoNodeView({
  element,
}: CanvasNodeViewProps<VideoNodeProps>) {
  const { fileContext } = useBoardContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const resolvedPath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext) || element.props.sourcePath,
    [element.props.sourcePath, fileContext]
  );
  const displayName = element.props.fileName || resolvedPath.split("/").pop() || "Video";
  const posterSrc = element.props.posterPath?.trim() || "";

  const effectiveProjectId = useMemo(() => {
    if (fileContext?.projectId) return fileContext.projectId;
    const parsed = parseScopedProjectPath(element.props.sourcePath);
    return parsed?.projectId;
  }, [element.props.sourcePath, fileContext?.projectId]);

  // 逻辑：HLS URL 需要未展开的原始路径 + ids，让服务端通过 boardId/projectId 正确解析。
  // resolvedPath 已经包含 board 目录前缀，直接传会导致服务端重复拼接。
  const hlsPath = useMemo(() => {
    if (isBoardRelativePath(element.props.sourcePath)) {
      return element.props.sourcePath; // "asset/Kapture..." — 服务端用 boardId 解析
    }
    const parsed = parseScopedProjectPath(element.props.sourcePath);
    if (parsed) return parsed.relativePath; // "jimeng.mp4" — 服务端用 projectId 解析
    return resolvedPath;
  }, [element.props.sourcePath, resolvedPath]);

  const ids = useMemo(
    () => ({
      projectId: effectiveProjectId,
      // 逻辑：仅 board-relative 路径需要 boardId，否则服务端会错误拼接板路径前缀。
      boardId: isBoardRelativePath(element.props.sourcePath) ? fileContext?.boardId : undefined,
    }),
    [effectiveProjectId, fileContext?.boardId, element.props.sourcePath],
  );

  const handlePlayInline = useCallback(() => {
    if (!hlsPath) return;
    setPlaying(true);
    setLoading(true);
  }, [hlsPath]);

  // 逻辑：playing 后轮询 HLS 转码状态，就绪后用 hls.js 或原生 HLS 播放。
  useEffect(() => {
    if (!playing || !hlsPath) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const qualityUrl = buildHlsQualityUrl(hlsPath, "720p", ids);
    const masterUrl = buildHlsManifestUrl(hlsPath, ids);

    const startPlayback = (url: string) => {
      if (cancelled) return;
      setLoading(false);
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) video.play();
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.play();
      }
    };

    const pollManifest = async () => {
      try {
        const res = await fetch(qualityUrl, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 200) {
          startPlayback(masterUrl);
          return;
        }
        if (res.status === 202) {
          pollTimer = setTimeout(pollManifest, 1500);
          return;
        }
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    pollManifest();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playing, hlsPath, ids]);

  // 逻辑：组件卸载时销毁 hls 实例。
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const handleStop = useCallback(() => {
    setPlaying(false);
    setLoading(false);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  return (
    <NodeFrame>
      <div
        className={[
          "flex h-full w-full items-center justify-center rounded-lg border box-border",
          "border-ol-divider bg-background text-ol-text-primary",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (playing) handleStop();
          void openVideoPreview(element.props, fileContext);
        }}
      >
        {playing ? (
          <div
            className="relative h-full w-full overflow-hidden rounded-lg bg-black"
            data-board-scroll
            data-board-editor="true"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <video
              ref={videoRef}
              controls
              controlsList="nodownload nofullscreen"
              muted
              className="absolute inset-0 h-full w-full object-contain"
              onEnded={handleStop}
            />
            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              </div>
            )}
          </div>
        ) : posterSrc ? (
          <div className="relative h-full w-full overflow-hidden rounded-lg">
            <img
              src={posterSrc}
              alt={displayName}
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/50 via-neutral-900/10 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                data-board-controls
                className="flex h-[12%] min-h-5 aspect-square cursor-pointer items-center justify-center rounded-md border border-white/40 bg-black/40 text-white transition-transform duration-200 ease-out hover:scale-125"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handlePlayInline();
                }}
              >
                <Play className="h-[50%] w-[50%] min-h-2.5 min-w-2.5 translate-x-[0.5px]" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 right-2 line-clamp-2 text-[11px] text-white/90 drop-shadow">
              {displayName}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-3 text-center">
            <button
              type="button"
              data-board-controls
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md bg-ol-surface-muted text-ol-text-auxiliary transition-transform duration-200 ease-out hover:scale-125"
              onPointerDown={(e) => {
                e.stopPropagation();
                handlePlayInline();
              }}
            >
              <Play className="h-5 w-5" />
            </button>
            <div className="line-clamp-2 text-[11px] text-ol-text-secondary">
              {displayName}
            </div>
          </div>
        )}
      </div>
    </NodeFrame>
  );
}

/** Connector templates offered by the video node – resolved at render time. */
const getVideoNodeConnectorTemplates = (): CanvasConnectorTemplateDefinition[] => [
  {
    id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    label: i18next.t('board:connector.imagePromptGenerate'),
    description: i18next.t('board:connector.imagePromptGenerateDesc'),
    size: [320, 220],
    icon: <Sparkles size={14} />,
    color: { bg: 'bg-ol-amber-bg', text: 'text-ol-amber', hoverBg: 'hover:bg-ol-amber-bg-hover' },
    createNode: () => ({
      type: IMAGE_PROMPT_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

/** Definition for the video node. */
export const VideoNodeDefinition: CanvasNodeDefinition<VideoNodeProps> = {
  type: "video",
  schema: z.object({
    sourcePath: z.string(),
    fileName: z.string().optional(),
    posterPath: z.string().optional(),
    duration: z.number().optional(),
    naturalWidth: z.number().optional(),
    naturalHeight: z.number().optional(),
  }),
  defaultProps: {
    sourcePath: "",
    fileName: "",
  },
  view: VideoNodeView,
  capabilities: {
    resizable: true,
    resizeMode: "uniform",
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 200, h: 112 },
    maxSize: { w: 1280, h: 720 },
  },
  connectorTemplates: () => getVideoNodeConnectorTemplates(),
  toolbar: () => [],
};
