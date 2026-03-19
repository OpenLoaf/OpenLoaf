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
import { Download, Info, Loader2, Pause, Play, Scissors, ZoomIn } from "lucide-react";
import i18next from "i18next";
import { openVideoTrimDialog } from "../dialogs/video-trim/VideoTrimDialog";
import {
  BOARD_TOOLBAR_ITEM_AMBER,
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_GREEN,
  BOARD_TOOLBAR_ITEM_PURPLE,
} from "../ui/board-style-system";
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
import { createPortal } from "react-dom";
import { VideoAiPanel } from "../panels/VideoAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";

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
  /** Clip start time in seconds (default 0). */
  clipStart?: number;
  /** Clip end time in seconds (default duration). */
  clipEnd?: number;
  /** How the video was created. Defaults to 'upload'. */
  origin?: import("../board-contracts").NodeOrigin;
  /** AI generation config. Present only when origin is 'ai-generate'. */
  aiConfig?: import("../board-contracts").AiGenerateConfig;
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
        clipStart: props.clipStart,
        clipEnd: props.clipEnd,
      },
    ],
    activeIndex: 0,
    showSave: false,
    enableEdit: false,
  });
}

/** Compute HLS path for the video node (reused by toolbar and view). */
function computeHlsPath(sourcePath: string, resolvedPath: string): string {
  if (isBoardRelativePath(sourcePath)) return sourcePath;
  const parsed = parseScopedProjectPath(sourcePath);
  if (parsed) return parsed.relativePath;
  return resolvedPath;
}

/** Build toolbar items for video nodes. */
function createVideoToolbarItems(ctx: CanvasToolbarContext<VideoNodeProps>) {
  const { clipStart, clipEnd, duration, sourcePath } = ctx.element.props;
  const hasClip = (clipStart != null && clipStart > 0) || (clipEnd != null && duration != null && clipEnd < duration);

  // 逻辑：计算 HLS 所需的路径和 ID，传给剪辑对话框。
  const resolvedPath = resolveProjectRelativePath(sourcePath, ctx.fileContext) || sourcePath;
  const hlsPath = computeHlsPath(sourcePath, resolvedPath);
  const effectiveProjectId = ctx.fileContext?.projectId
    ?? parseScopedProjectPath(sourcePath)?.projectId;
  const ids = {
    projectId: effectiveProjectId,
    boardId: isBoardRelativePath(sourcePath) ? ctx.fileContext?.boardId : undefined,
  };

  // AI action buttons prepended before base items
  const aiItems = [
    {
      id: 'ai-upscale-video',
      label: i18next.t('board:aiToolbar.upscaleVideo'),
      icon: <ZoomIn size={14} />,
      className: BOARD_TOOLBAR_ITEM_PURPLE,
      onSelect: () => {},
    },
  ];

  const baseItems = [
    {
      id: 'play',
      label: i18next.t('board:videoNode.toolbar.play'),
      icon: <Play size={14} />,
      className: BOARD_TOOLBAR_ITEM_GREEN,
      onSelect: () => void openVideoPreview(ctx.element.props, ctx.fileContext),
    },
    {
      id: 'trim',
      label: i18next.t('board:videoNode.toolbar.trim', { defaultValue: 'Trim' }),
      icon: <Scissors size={14} />,
      className: BOARD_TOOLBAR_ITEM_AMBER,
      active: hasClip,
      onSelect: () => {
        openVideoTrimDialog({
          hlsPath,
          ids,
          duration: duration ?? 0,
          clipStart: clipStart ?? 0,
          clipEnd: clipEnd ?? duration ?? 0,
          posterSrc: ctx.element.props.posterPath?.trim() || undefined,
          onConfirm: (start, end, posterDataUrl) => {
            const update: Partial<VideoNodeProps> = { clipStart: start, clipEnd: end };
            if (posterDataUrl) update.posterPath = posterDataUrl;
            ctx.updateNodeProps(update);
          },
        });
      },
    },
    ...(hasClip
      ? [
          {
            id: 'export-clip',
            label: i18next.t('board:videoNode.toolbar.exportClip', { defaultValue: 'Export Clip' }),
            icon: <Download size={14} />,
            className: BOARD_TOOLBAR_ITEM_GREEN,
            onSelect: () => {
              void exportVideoClip(ctx.element.props, ctx.fileContext);
            },
          },
        ]
      : []),
    {
      id: 'inspect',
      label: i18next.t('board:videoNode.toolbar.detail'),
      icon: <Info size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
  return [...aiItems, ...baseItems];
}

/** Export the clipped segment via server-side ffmpeg. */
async function exportVideoClip(props: VideoNodeProps, fileContext?: BoardFileContext) {
  const startTime = props.clipStart ?? 0;
  const endTime = props.clipEnd ?? props.duration ?? 0;

  if (endTime <= startTime) {
    return;
  }

  // 逻辑：服务端需要原始未解析路径 + boardId/projectId 来定位文件，
  // 不能传 resolveProjectRelativePath 的结果（已包含 board 目录前缀），否则会双重拼接。
  const isBoardPath = isBoardRelativePath(props.sourcePath);
  let sourcePath: string;
  if (isBoardPath) {
    sourcePath = props.sourcePath; // e.g. "asset/video.mp4"
  } else {
    const parsed = parseScopedProjectPath(props.sourcePath);
    sourcePath = parsed?.relativePath ?? props.sourcePath;
  }

  const baseUrl = resolveServerUrl();
  const url = baseUrl
    ? `${baseUrl}/media/video-clip/export`
    : "/media/video-clip/export";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourcePath,
        projectId: fileContext?.projectId,
        boardId: isBoardPath ? fileContext?.boardId : undefined,
        startTime,
        endTime,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      console.error("Export clip failed:", data.error);
      return;
    }

    // Trigger download
    const downloadUrl = baseUrl
      ? `${baseUrl}/media/video-clip/download?file=${encodeURIComponent(data.data.filePath)}`
      : `/media/video-clip/download?file=${encodeURIComponent(data.data.filePath)}`;

    const electronApi = (window as unknown as Record<string, unknown>).openloafElectron as
      | { saveFile?: (opts: { url: string; fileName: string }) => void }
      | undefined;
    if (electronApi?.saveFile) {
      electronApi.saveFile({ url: downloadUrl, fileName: data.data.fileName });
    } else {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = data.data.fileName;
      a.click();
    }
  } catch (err) {
    console.error("Export clip error:", err);
  }
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
  expanded,
  onUpdate,
}: CanvasNodeViewProps<VideoNodeProps>) {
  const { fileContext, engine } = useBoardContext();
  const upstream = useUpstreamData(engine, expanded ? element.id : null);
  const panelOverlay = usePanelOverlay();
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 逻辑：通过 subscribeView 直接操作 DOM 同步面板缩放，避免 React 渲染延迟。
  // 面板通过 Portal 渲染到 panelOverlay 层（笔画上方），用 scale(1/zoom) 保持固定屏幕大小。
  useEffect(() => {
    if (!expanded) return;
    const syncPanelScale = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const zoom = engine.viewport.getState().zoom;
      panel.style.transform = `translateX(-50%) scale(${1 / zoom})`;
    };
    syncPanelScale();
    const unsub = engine.subscribeView(syncPanelScale);
    return unsub;
  }, [engine, expanded]);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

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

  // 逻辑：用 ref 持有 clip 值，避免放入 useEffect deps 导致拖滑块时重建 HLS 播放。
  const clipStartRef = useRef(element.props.clipStart);
  clipStartRef.current = element.props.clipStart;
  const clipEndRef = useRef(element.props.clipEnd);
  clipEndRef.current = element.props.clipEnd;
  const durationRef = useRef(element.props.duration);
  durationRef.current = element.props.duration;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const stoppedRef = useRef(false);

  const handleStop = useCallback(() => {
    if (stoppedRef.current) return; // 防止 timeupdate + onEnded 双重触发
    stoppedRef.current = true;
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

  const handlePlayInline = useCallback(() => {
    if (!hlsPath) return;
    stoppedRef.current = false;
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

    // 逻辑：视频加载后检测时长，若节点未记录 duration 则自动回写，使剪切面板可用。
    const onLoadedMetadata = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0 && durationRef.current == null) {
        onUpdateRef.current({ duration: d } as Partial<VideoNodeProps>);
      }
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    const applyClipAndPlay = () => {
      const cs = clipStartRef.current;
      if (cs != null && cs > 0) {
        video.currentTime = cs;
      }
      video.play();
    };

    const onTimeUpdate = () => {
      const cs = clipStartRef.current ?? 0;
      const ce = clipEndRef.current;
      if (ce != null && video.currentTime >= ce) {
        handleStop();
        return;
      }
      const dur = (ce ?? video.duration) - cs;
      if (dur > 0) {
        setProgress(((video.currentTime - cs) / dur) * 100);
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);

    const startPlayback = (url: string) => {
      if (cancelled) return;
      setLoading(false);
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) applyClipAndPlay();
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        applyClipAndPlay();
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
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playing, hlsPath, ids, handleStop]);

  // 逻辑：组件卸载时销毁 hls 实例。
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
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
            className="group relative h-full w-full overflow-hidden rounded-lg bg-black"
            data-board-scroll
            data-board-editor="true"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <video
              ref={videoRef}
              muted
              className="absolute inset-0 h-full w-full object-contain"
              onEnded={handleStop}
            />
            {loading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              </div>
            ) : (
              <>
                {/* Pause button on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    type="button"
                    data-board-controls
                    className="flex h-[12%] min-h-5 aspect-square cursor-pointer items-center justify-center rounded-md border border-white/40 bg-black/40 text-white transition-transform duration-200 ease-out hover:scale-125"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleStop();
                    }}
                  >
                    <Pause className="h-[50%] w-[50%] min-h-2.5 min-w-2.5" />
                  </button>
                </div>
                {/* Progress bar at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 group-hover:h-1 transition-all duration-150">
                  <div
                    className="h-full bg-white/80"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
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
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-neutral-900/10 to-transparent" />
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
            <div className="absolute top-2 left-2 right-2 line-clamp-2 text-[11px] text-white/90 drop-shadow">
              {displayName}
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full">
            <div className="absolute top-2 left-2 right-2 line-clamp-2 text-[11px] text-ol-text-secondary">
              {displayName}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
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
            </div>
          </div>
        )}
      </div>
      {expanded && panelOverlay ? createPortal(
        <div
          ref={panelRef}
          className="pointer-events-auto absolute"
          data-board-editor
          style={{
            left: element.xywh[0] + element.xywh[2] / 2,
            top: element.xywh[1] + element.xywh[3] + 8,
            transformOrigin: 'top center',
          }}
          onPointerDown={event => {
            event.stopPropagation();
          }}
        >
          <VideoAiPanel
            element={element}
            onUpdate={onUpdate}
            upstreamText={upstream?.textList.join('\n')}
            upstreamImages={upstream?.imageList}
          />
        </div>,
        panelOverlay,
      ) : null}
    </NodeFrame>
  );
}


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
    clipStart: z.number().optional(),
    clipEnd: z.number().optional(),
    origin: z.enum(['user', 'upload', 'ai-generate', 'paste']).optional(),
    aiConfig: z.object({
      modelId: z.string(),
      prompt: z.string(),
      negativePrompt: z.string().optional(),
      style: z.string().optional(),
      aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
      inputNodeIds: z.array(z.string()).optional(),
      taskId: z.string().optional(),
      generatedAt: z.number().optional(),
    }).optional(),
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
  inlinePanel: { width: 420, height: 360 },
  connectorTemplates: () => [],
  toolbar: (ctx) => createVideoToolbarItems(ctx),
};
