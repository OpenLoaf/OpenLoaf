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
import { Download, Image, Info, Loader2, Pause, Play, RefreshCw, Scissors, Trash2, Type, Upload, Video, X } from "lucide-react";
import i18next from "i18next";
import { openVideoTrimDialog } from "../dialogs/video-trim/VideoTrimDialog";
import {
  BOARD_TOOLBAR_ITEM_DEFAULT,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { useBoardContext, type BoardFileContext } from "../core/BoardProvider";
import { isBoardRelativePath } from "../core/boardFilePath";
import { resolveServerUrl } from "@/utils/server-url";
import { resolveProjectRelativePath } from './shared/resolveMediaSource';
import { downloadMediaFile } from './shared/downloadMediaFile';
import { NodeFrame } from "./NodeFrame";
import { createPortal } from "react-dom";
import { VideoAiPanel } from "../panels/VideoAiPanel";
import type { VideoGenerateParams } from "../panels/VideoAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { deriveNode } from "../utils/derive-node";
import { submitVideoGenerate } from "../services/video-generate";
import { resolveAllMediaInputs } from "@/lib/media-upload";
import { useFileUploadHandler } from './shared/useFileUploadHandler';
import { useInlinePanelSync, PANEL_GAP_PX } from './shared/useInlinePanelSync';
import { useEffectiveUpstream } from './shared/useEffectiveUpstream';
import {
  createInputSnapshot,
  createGeneratingEntry,
  pushVersion,
  markVersionReady,
  removeFailedEntry,
  switchPrimary,
} from '../engine/version-stack';
import { useMediaTaskPolling } from '../hooks/useMediaTaskPolling';
import {
  mapErrorToMessageKey,
  useVersionStackState,
  useVersionStackFailureState,
  useVersionStackEditingOverride,
} from '../hooks/useVersionStack';
import { VersionStackOverlay } from './VersionStackOverlay';
import { GeneratingOverlay } from './GeneratingOverlay';

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
  /** Version stack tracking AI generation history. */
  versionStack?: import("../engine/types").VersionStack;
};


/** Open video in the file preview dialog (same as double-click). */
async function openVideoPreview(props: VideoNodeProps, fileContext?: BoardFileContext) {
  const boardId = isBoardRelativePath(props.sourcePath) ? (fileContext?.boardId ?? "") : "";
  const projectRelativePath = resolveProjectRelativePath(props.sourcePath, fileContext);
  const resolvedPath = projectRelativePath || props.sourcePath;
  const displayName = props.fileName || resolvedPath.split("/").pop() || i18next.t('board:nodeLabel.video');

  const metadata = await fetchVideoMetadata({
    projectId: fileContext?.projectId,
    boardId: fileContext?.boardId,
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

/** Trigger a download for the original video file. */
async function downloadVideo(props: VideoNodeProps, fileContext?: BoardFileContext) {
  const sourcePath = (props.sourcePath ?? '').trim();
  if (!sourcePath) return;
  const fileName = props.fileName || sourcePath.split('/').pop() || 'video.mp4';
  await downloadMediaFile({ src: sourcePath, fileName, fileContext, filterLabel: 'Video' });
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
  const isEmpty = !sourcePath?.trim();

  // 逻辑：空节点只显示上传和删除按钮。
  if (isEmpty) {
    return [
      {
        id: 'upload',
        label: i18next.t('board:toolbar.upload', { defaultValue: '上传' }),
        icon: <Upload size={14} />,
        className: BOARD_TOOLBAR_ITEM_DEFAULT,
        onSelect: () => {
          document.dispatchEvent(new CustomEvent('board:trigger-upload', { detail: ctx.element.id }));
        },
      },
      {
        id: 'delete',
        label: i18next.t('board:contextMenu.delete'),
        icon: <Trash2 size={14} />,
        className: BOARD_TOOLBAR_ITEM_RED,
        onSelect: () => ctx.engine.deleteSelection(),
      },
    ];
  }

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

  const baseItems = [
    {
      id: 'play',
      label: i18next.t('board:videoNode.toolbar.play'),
      icon: <Play size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => void openVideoPreview(ctx.element.props, ctx.fileContext),
    },
    {
      id: 'download',
      label: i18next.t('board:videoNode.toolbar.download', { defaultValue: 'Download' }),
      icon: <Download size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => void downloadVideo(ctx.element.props, ctx.fileContext),
    },
    {
      id: 'trim',
      label: i18next.t('board:videoNode.toolbar.trim', { defaultValue: 'Trim' }),
      icon: <Scissors size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
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
            className: BOARD_TOOLBAR_ITEM_DEFAULT,
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
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
    {
      id: 'delete',
      label: i18next.t('board:contextMenu.delete'),
      icon: <Trash2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: () => ctx.engine.deleteSelection(),
    },
  ];
  return baseItems;
}

// ---------------------------------------------------------------------------
// Connector templates
// ---------------------------------------------------------------------------

/** Connector templates offered by the video node. */
const getVideoNodeConnectorTemplates = (): CanvasConnectorTemplateDefinition[] => [
  {
    id: 'text',
    label: i18next.t('board:connector.videoUnderstanding', { defaultValue: 'Video Understanding' }),
    description: i18next.t('board:connector.videoUnderstandingDesc', { defaultValue: 'Analyze video and generate description' }),
    size: [200, 200],
    icon: <Type size={14} />,
    createNode: () => ({
      type: 'text',
      props: { style: 'sticky', stickyColor: 'yellow' },
    }),
  },
  {
    id: 'image',
    label: i18next.t('board:connector.extractFrame', { defaultValue: 'Extract Frame' }),
    description: i18next.t('board:connector.extractFrameDesc', { defaultValue: 'Extract a frame from video' }),
    size: [320, 180],
    icon: <Image size={14} />,
    createNode: () => ({
      type: 'image',
      props: {},
    }),
  },
  {
    id: 'video',
    label: i18next.t('board:connector.continueVideo', { defaultValue: 'Continue Video' }),
    description: i18next.t('board:connector.continueVideoDesc', { defaultValue: 'Generate continuation from video' }),
    size: [320, 180],
    icon: <Video size={14} />,
    createNode: () => ({
      type: 'video',
      props: {},
    }),
  },
]

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const { fileInputRef, handleFileInputChange } = useFileUploadHandler<VideoNodeProps>({
    elementId: element.id,
    fileContext,
    onUpdate,
    fallbackName: 'video.mp4',
  });
  const { panelRef } = useInlinePanelSync({ engine, xywh: element.xywh, expanded });
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const resolvedPath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext) || element.props.sourcePath,
    [element.props.sourcePath, fileContext]
  );
  const displayName = element.props.fileName || resolvedPath.split("/").pop() || i18next.t('board:nodeLabel.video');
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
    // 逻辑：先销毁 HLS 实例再设 playing=false。
    // setPlaying(false) 会卸载 video 元素，无需额外 pause/load。
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setPlaying(false);
    setLoading(false);
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
      video.play().catch(() => {});
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
        // 逻辑：等待首个片段缓冲完成再播放，避免 MANIFEST_PARSED 时 SourceBuffer 尚未就绪导致 play() 被中断。
        let started = false;
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (!cancelled && !started) {
            started = true;
            applyClipAndPlay();
          }
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal && !cancelled) {
            console.error("[HLS] fatal error:", data.type, data.details);
            handleStop();
          }
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

  // ---------------------------------------------------------------------------
  // Version-stack based generation
  // ---------------------------------------------------------------------------
  const { primaryEntry, generatingEntry, isGenerating: isGeneratingVersion } = useVersionStackState(element.props.versionStack)

  // 逻辑：有生成记录时使用冻结的上游数据，版本切换时自动跟随。
  const effectiveUpstream = useEffectiveUpstream(primaryEntry, upstream, fileContext);

  const pollingResult = useMediaTaskPolling({
    taskId: generatingEntry?.taskId,
    taskType: 'video_generate',
    projectId: fileContext?.projectId,
    boardId: fileContext?.boardId,
    enabled: !!generatingEntry,
    onSuccess: useCallback(
      (resultUrls: string[]) => {
        if (!generatingEntry) return
        const stack = element.props.versionStack
        if (!stack) return
        const savedPath = resultUrls[0]?.trim() || ''
        const scopedPath = (() => {
          if (!savedPath) return ''
          if (parseScopedProjectPath(savedPath)) return savedPath
          const pid = fileContext?.projectId
          if (!pid) return savedPath
          const relative = normalizeProjectRelativePath(savedPath)
          return formatScopedProjectPath({
            projectId: pid,
            currentProjectId: pid,
            relativePath: relative,
            includeAt: true,
          })
        })()
        onUpdate({
          versionStack: markVersionReady(stack, generatingEntry.id, { urls: resultUrls }),
          sourcePath: scopedPath,
          fileName: savedPath.split('/').pop() || undefined,
        })
        // 逻辑：生成完成后获取视频元数据并自动调整节点尺寸。
        const nodeId = element.id
        void (async () => {
          try {
            const metadata = await fetchVideoMetadata({
              projectId: fileContext?.projectId,
              boardId: fileContext?.boardId,
              uri: scopedPath,
            })
            if (!metadata?.width || !metadata?.height) return
            const el = engine.doc.getElementById(nodeId)
            if (!el || el.kind !== 'node') return
            const [ex, ey, ew, eh] = el.xywh
            const ratio = metadata.width / metadata.height
            const newW = Math.max(ew, 240)
            const newH = Math.round(newW / ratio)
            const cx = ex + ew / 2
            const cy = ey + eh / 2
            engine.doc.updateElement(nodeId, {
              xywh: [Math.round(cx - newW / 2), Math.round(cy - newH / 2), newW, newH],
            })
            engine.doc.updateNodeProps(nodeId, {
              naturalWidth: metadata.width,
              naturalHeight: metadata.height,
              duration: metadata.duration,
            })
          } catch { /* ignore metadata fetch failure */ }
        })()
      },
      [generatingEntry, element.props.versionStack, onUpdate, fileContext?.projectId, element.id, engine],
    ),
    onFailure: useCallback(
      (error: string) => {
        if (!generatingEntry) return
        const stack = element.props.versionStack
        if (!stack) return
        const { stack: newStack, removed } = removeFailedEntry(stack, generatingEntry.id)
        if (removed?.input) {
          const isCancelled = error.toLowerCase().includes('cancel')
          setLastFailure({
            input: removed.input,
            error: { code: isCancelled ? 'CANCELLED' : 'GENERATE_FAILED', message: error },
          })
          setDismissedFailure(false)
        }
        onUpdate({ versionStack: newStack })
      },
      [generatingEntry, element.props.versionStack, onUpdate],
    ),
  })

  const { lastFailure, setLastFailure, dismissedFailure, setDismissedFailure, isFailed } =
    useVersionStackFailureState(element.props.versionStack, onUpdate)

  const handleGenerate = useCallback(
    async (params: VideoGenerateParams) => {
      try {
        const result = await submitVideoGenerate(
          {
            // v3 fields
            feature: params.feature,
            variant: params.variant,
            inputs: params.inputs,
            params: params.params,
            count: params.count,
            seed: params.seed,
            // legacy fields (backward compat)
            prompt: params.prompt,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            mode: params.mode as any,
            firstFrameImageSrc: params.firstFrameImageSrc,
            endFrameImageSrc: params.endFrameImageSrc,
            referenceImageSrcs: params.referenceImageSrcs,
            withAudio: params.withAudio,
            quality: params.quality,
          },
          {
            projectId: fileContext?.projectId,
            boardId: fileContext?.boardId,
            sourceNodeId: element.id,
          },
        )

        const snapshot = createInputSnapshot({
          prompt: params.prompt,
          parameters: {
            feature: params.feature,
            variant: params.variant,
            inputs: params.inputs,
            params: params.params,
            mode: params.mode,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            quality: params.quality,
            withAudio: params.withAudio,
          },
          upstreamRefs: upstream?.entries ?? [],
        })
        const entry = createGeneratingEntry(snapshot, result.taskId)
        onUpdate({
          versionStack: pushVersion(element.props.versionStack, entry),
          origin: 'ai-generate',
        })
      } catch (err) {
        console.error('[VideoNode] submitVideoGenerate failed:', err)
        const inputSnapshot = createInputSnapshot({
          prompt: params.prompt,
          parameters: { feature: params.feature, variant: params.variant, inputs: params.inputs, params: params.params, aspectRatio: params.aspectRatio, quality: params.quality },
        })
        const msgKey = mapErrorToMessageKey(err)
        const msg = i18next.t(msgKey, { defaultValue: '生成失败，请重试' })
        setLastFailure({
          input: inputSnapshot,
          error: { code: 'SUBMIT_FAILED', message: msg },
        })
      }
    },
    [element.id, element.props.versionStack, element.props.aiConfig, fileContext?.projectId, fileContext?.boardId, onUpdate],
  )

  /** Retry generation using the failed entry's input snapshot. */
  const handleRetry = useCallback(() => {
    if (!lastFailure?.input) return
    const input = lastFailure.input
    const params: VideoGenerateParams = {
      feature: (input.parameters?.feature as VideoGenerateParams['feature']) ?? 'videoGenerate',
      variant: input.parameters?.variant as string | undefined,
      inputs: input.parameters?.inputs as Record<string, unknown> | undefined,
      params: input.parameters?.params as Record<string, unknown> | undefined,
      mode: (input.parameters?.mode as VideoGenerateParams['mode']) ?? 'text',
      prompt: input.prompt,
      aspectRatio: (input.parameters?.aspectRatio as string) ?? '16:9',
      duration: (input.parameters?.duration as 5 | 10 | 15) ?? 5,
      quality: input.parameters?.quality as VideoGenerateParams['quality'],
      withAudio: input.parameters?.withAudio as boolean | undefined,
    }
    handleGenerate(params)
  }, [lastFailure, handleGenerate])

  /** Generate into a new derived video node with the same params. */
  const handleGenerateNewNode = useCallback(
    async (params: VideoGenerateParams) => {
      let newNodeId: string | null = null
      try {
        newNodeId = deriveNode({
          engine,
          sourceNodeId: element.id,
          targetType: 'video',
          targetProps: { origin: 'ai-generate' },
        })
        if (!newNodeId) return

        // 逻辑：先写入 generating 状态，让新节点立即显示 loading。
        const snapshot = createInputSnapshot({
          prompt: params.prompt,
          parameters: {
            feature: params.feature,
            variant: params.variant,
            inputs: params.inputs,
            params: params.params,
            mode: params.mode,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            quality: params.quality,
            withAudio: params.withAudio,
          },
        })
        const pendingEntry = createGeneratingEntry(snapshot, '')
        engine.doc.updateNodeProps(newNodeId, {
          versionStack: pushVersion(undefined, pendingEntry),
          origin: 'ai-generate',
          aiConfig: { feature: params.feature, prompt: params.prompt ?? '' },
        })

        // 逻辑：上传媒体输入到公网 URL，在子节点创建后再执行以避免阻塞。
        const resolvedInputs = await resolveAllMediaInputs(params.inputs ?? {}, fileContext?.boardId)

        const result = await submitVideoGenerate(
          {
            // v3 fields
            feature: params.feature,
            variant: params.variant,
            inputs: resolvedInputs,
            params: params.params,
            count: params.count,
            seed: params.seed,
            // legacy fields (backward compat)
            prompt: params.prompt,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            mode: params.mode as any,
            firstFrameImageSrc: params.firstFrameImageSrc,
            endFrameImageSrc: params.endFrameImageSrc,
            referenceImageSrcs: params.referenceImageSrcs,
            withAudio: params.withAudio,
            quality: params.quality,
          },
          {
            projectId: fileContext?.projectId,
            boardId: fileContext?.boardId,
            sourceNodeId: newNodeId,
          },
        )

        // 逻辑：API 返回后补上 taskId。
        engine.doc.updateNodeProps(newNodeId, {
          versionStack: {
            entries: [{ ...pendingEntry, taskId: result.taskId }],
            primaryId: pendingEntry.id,
          },
        })
      } catch (err) {
        console.error('[VideoNode] new node generation failed:', err)
        if (newNodeId) {
          const msgKey = mapErrorToMessageKey(err)
          const msg = i18next.t(msgKey, { defaultValue: '生成失败，请重试' })
          const snapshot = createInputSnapshot({ prompt: params.prompt, parameters: { feature: params.feature, variant: params.variant, inputs: params.inputs, params: params.params } })
          const failedEntry: import('../engine/types').VersionStackEntry = {
            id: `fail-${Date.now()}`, status: 'failed', input: snapshot, createdAt: Date.now(),
            error: { code: 'SUBMIT_FAILED', message: msg },
          }
          engine.doc.updateNodeProps(newNodeId, {
            versionStack: pushVersion(undefined, failedEntry),
            aiConfig: { feature: params.feature, prompt: params.prompt ?? '' },
          })
        }
      }
    },
    [engine, element.id, fileContext?.projectId, fileContext?.boardId],
  )

  const isGenerating = isGeneratingVersion
  const isReadyFromAi = primaryEntry?.status === 'ready' && element.props.origin === 'ai-generate'

  const { editingOverride, setEditingOverride } = useVersionStackEditingOverride(
    element.id,
    expanded,
    isGenerating,
  );

  // 逻辑：生成开始后清除上次失败状态。
  useEffect(() => {
    if (isGenerating) setLastFailure(null);
  }, [isGenerating]);

  /** Switch the version stack primary entry and update the node source. */
  const handleSwitchPrimary = useCallback(
    (entryId: string) => {
      const stack = element.props.versionStack
      if (!stack) return
      const newStack = switchPrimary(stack, entryId)
      const newPrimary = newStack.entries.find((e) => e.id === entryId)
      const patch: Partial<VideoNodeProps> = { versionStack: newStack }
      if (newPrimary?.output?.urls[0]) {
        patch.sourcePath = newPrimary.output.urls[0]
      }
      onUpdate(patch)
    },
    [element.props.versionStack, onUpdate],
  )

  return (
    <NodeFrame className="group">
      <VersionStackOverlay
        stack={element.props.versionStack}
        semanticColor="purple"
        onSwitchPrimary={handleSwitchPrimary}
      />
      <div
        className={[
          "relative flex h-full w-full items-center justify-center rounded-3xl border box-border",
          "border-ol-divider bg-background text-ol-text-primary",
          "",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (expanded) return;
          if (isGenerating || isFailed) return;
          // 逻辑：空节点双击打开文件选择器，有内容时双击打开预览。
          if (!element.props.sourcePath?.trim()) {
            fileInputRef.current?.click();
            return;
          }
          if (playing) handleStop();
          void openVideoPreview(element.props, fileContext);
        }}
      >
        {/* Generating overlay */}
        {isGenerating && (
          <GeneratingOverlay
            startedAt={pollingResult.startedAt}
            estimatedSeconds={90}
            serverProgress={pollingResult.progress}
            color="purple"
          />
        )}

        {/* Failed / Cancelled overlay */}
        {isFailed && !dismissedFailure && (() => {
          const isCancelled = lastFailure?.error?.code === 'CANCELLED'
          return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-sm p-4 rounded-3xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
              <X className="h-4 w-4 text-ol-text-auxiliary" />
            </div>
            <span className="text-xs text-center text-ol-text-auxiliary font-medium">
              {isCancelled
                ? i18next.t('board:videoNode.cancelled', { defaultValue: '已取消' })
                : (lastFailure?.error?.message || i18next.t('board:videoNode.generateFailed', { defaultValue: 'Generation failed' }))}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetry();
                }}
                className="flex items-center gap-1 rounded-full px-3 py-1 text-[11px] bg-white/[0.08] text-ol-text-secondary hover:bg-white/[0.12] transition-colors duration-150"
              >
                <RefreshCw className="h-3 w-3" />
                {isCancelled
                  ? i18next.t('board:videoNode.resend', { defaultValue: '重新发送' })
                  : i18next.t('board:videoNode.retry', { defaultValue: 'Retry' })}
              </button>
              {posterSrc && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissedFailure(true);
                  }}
                  className="text-[11px] text-ol-text-auxiliary underline underline-offset-2 hover:text-ol-text-secondary transition-colors duration-150"
                >
                  {i18next.t('board:loading.dismiss', { defaultValue: 'Dismiss' })}
                </button>
              )}
            </div>
          </div>
          )
        })()}

        {playing ? (
          <div
            className="group relative h-full w-full overflow-hidden rounded-3xl bg-black"
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
                    className="flex h-[12%] min-h-5 aspect-square cursor-pointer items-center justify-center rounded-3xl border border-white/40 bg-black/40 text-white transition-transform duration-200 ease-out hover:scale-125"
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
          <div className="relative h-full w-full overflow-hidden rounded-3xl">
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
                className="flex h-[12%] min-h-5 aspect-square cursor-pointer items-center justify-center rounded-3xl border border-white/40 bg-black/40 text-white transition-transform duration-200 ease-out hover:scale-125"
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
        ) : !element.props.sourcePath?.trim() ? (
          <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-ol-divider bg-ol-surface-muted">
            <div className="flex flex-col items-center gap-2 text-muted-foreground/40 px-4">
              <Video size={36} strokeWidth={1.2} />
              <span className="text-xs text-center leading-relaxed whitespace-pre-line">
                {i18next.t('board:videoNode.emptyHint', { defaultValue: '双击上传视频\n或选中后 AI 生成' })}
              </span>
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
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-3xl bg-ol-surface-muted text-ol-text-auxiliary transition-transform duration-200 ease-out hover:scale-125"
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
            top: element.xywh[1] + element.xywh[3] + PANEL_GAP_PX / engine.viewport.getState().zoom,
            transform: `translateX(-50%) scale(${1 / engine.viewport.getState().zoom})`,
            transformOrigin: 'top center',
          }}
          onPointerDown={event => {
            event.stopPropagation();
          }}
          onContextMenu={event => {
            event.stopPropagation();
          }}
        >
          <VideoAiPanel
            element={element}
            onUpdate={onUpdate}
            onGenerate={handleGenerate}
            onGenerateNewNode={handleGenerateNewNode}
            upstreamText={effectiveUpstream.text}
            upstreamImages={effectiveUpstream.images}
            upstreamImagePaths={effectiveUpstream.imagePaths}
            upstreamAudioUrl={effectiveUpstream.audioUrl}
            upstreamVideoUrl={effectiveUpstream.videoUrl}
            boardId={fileContext?.boardId}
            projectId={fileContext?.projectId}
            boardFolderUri={fileContext?.boardFolderUri}
            readonly={(isReadyFromAi || !!generatingEntry) && !editingOverride}
            editing={editingOverride}
            onUnlock={() => setEditingOverride(true)}
            onCancelEdit={() => setEditingOverride(false)}
          />
        </div>,
        panelOverlay,
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
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
      feature: z.enum(['imageGenerate', 'imageEdit', 'imageInpaint', 'imageStyleTransfer', 'upscale', 'outpaint', 'videoGenerate', 'lipSync', 'tts', 'poster', 'matting', 'videoEdit', 'digitalHuman', 'motionTransfer', 'music', 'sfx']).optional(),
      modelId: z.string().optional(),
      prompt: z.string(),
      negativePrompt: z.string().optional(),
      style: z.string().optional(),
      aspectRatio: z.enum(['auto', '1:1', '16:9', '9:16', '4:3', '3:2']).optional(),
      quality: z.enum(['draft', 'standard', 'hd']).optional(),
      count: z.number().optional(),
      seed: z.number().optional(),
      inputNodeIds: z.array(z.string()).optional(),
      taskId: z.string().optional(),
      generatedAt: z.number().optional(),
    }).optional(),
    versionStack: z.any().optional(),
  }),
  defaultProps: {
    sourcePath: "",
    fileName: "",
  },
  view: VideoNodeView,
  capabilities: {
    resizable: false,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 200, h: 112 },
    maxSize: { w: 1280, h: 720 },
  },
  inlinePanel: { width: 420, height: 360 },
  connectorTemplates: () => getVideoNodeConnectorTemplates(),
  toolbar: (ctx) => createVideoToolbarItems(ctx),
};
