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
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
  InputSnapshot,
} from "../engine/types";
import type { UpstreamData } from "../engine/upstream-data";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { ChevronLeft, ChevronRight, Download, Info, Loader2, Pause, Play, Scissors, Upload, Video, Volume2 } from "lucide-react";
import i18next from "i18next";
import { openVideoTrimDialog } from "../dialogs/video-trim/VideoTrimDialog";
import {
  BOARD_TOOLBAR_ITEM_DEFAULT,
} from "../ui/board-style-system";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  ProjectFilePickerDialog,
  type ProjectFilePickerSelection,
} from "@/components/project/filesystem/components/ProjectFilePickerDialog";
import { VIDEO_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { useBoardContext, type BoardFileContext } from "../core/BoardProvider";
import { isBoardRelativePath } from "../core/boardFilePath";
import { resolveServerUrl } from "@/utils/server-url";
import { resolveProjectRelativePath } from './shared/resolveMediaSource';
import { downloadMediaFile } from './shared/downloadMediaFile';
import { saveBoardAssetFile } from '../utils/board-asset';
import { NodeFrame } from "./NodeFrame";
import { VideoAiPanel } from "../panels/VideoAiPanel";
import { FailureOverlay } from './shared/FailureOverlay';
import { InlinePanelPortal } from './shared/InlinePanelPortal';
import type { VideoGenerateParams } from "../panels/VideoAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { submitVideoGenerate } from "../services/video-generate";
import { useFileUploadHandler } from './shared/useFileUploadHandler';
import { useInlinePanelSync } from './shared/useInlinePanelSync';
import { useEffectiveUpstream } from './shared/useEffectiveUpstream';
import { useMediaGeneration, type SubmitOptions } from './shared/useMediaGeneration';
import {
  createInputSnapshot,
  getPrimaryEntry,
  markVersionReady,
  removeFailedEntry,
  switchPrimary,
} from '../engine/version-stack';
import { useMediaTaskPolling } from '../hooks/useMediaTaskPolling';
import {
  useVersionStackState,
  useVersionStackFailureState,
  useVersionStackEditingOverride,
} from '../hooks/useVersionStack';
import { VersionStackOverlay } from './VersionStackOverlay';
import { GeneratingOverlay } from './GeneratingOverlay';
import { deriveNode } from '../utils/derive-node';
import type { CanvasEngine } from '../engine/CanvasEngine';
import { useCancelGeneration } from './shared/useCancelGeneration';
import {
  cancelVideoDownload,
  pollVideoDownloadProgress,
  startVideoDownload,
  type VideoDownloadPhase,
} from "../services/video-download";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";

export type { VideoNodeProps } from './node-types'
import type { VideoNodeProps } from './node-types'

/** 下载完成后按比例拟合视频节点尺寸。 */
function fitVideoSize(width: number, height: number, maxDimension: number): [number, number] {
  if (width <= 0 || height <= 0) return [maxDimension, Math.round(maxDimension * (9 / 16))];
  const scale = Math.min(maxDimension / width, maxDimension / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}


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

/** Compute the effective video path for stream playback (reused by toolbar and view). */
function computeVideoPath(sourcePath: string, resolvedPath: string): string {
  if (isBoardRelativePath(sourcePath)) return sourcePath;
  const parsed = parseScopedProjectPath(sourcePath);
  if (parsed) return parsed.relativePath;
  return resolvedPath;
}

/** Extract audio track from video and create an audio node via deriveNode. */
export async function extractAudioFromVideo(params: {
  engine: CanvasEngine;
  sourceNodeId: string;
  props: VideoNodeProps;
  fileContext?: BoardFileContext;
}) {
  const { engine, sourceNodeId, props, fileContext } = params;
  const { sourcePath, clipStart, clipEnd, duration } = props;
  if (!sourcePath?.trim()) return;

  const isBoardPath = isBoardRelativePath(sourcePath);
  const resolvedSource = isBoardPath
    ? sourcePath
    : (parseScopedProjectPath(sourcePath)?.relativePath ?? sourcePath);

  const hasClip =
    (clipStart != null && clipStart > 0) ||
    (clipEnd != null && duration != null && clipEnd < duration);

  const baseUrl = resolveServerUrl();
  const url = baseUrl ? `${baseUrl}/media/audio-extract` : '/media/audio-extract';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: resolvedSource,
        projectId: fileContext?.projectId,
        boardId: isBoardPath ? fileContext?.boardId : undefined,
        ...(hasClip ? { startTime: clipStart ?? 0, endTime: clipEnd ?? duration } : {}),
      }),
    });
    const data = await res.json();
    if (!data.success) {
      console.error('Audio extraction failed:', data.error);
      return;
    }

    const { relativePath, fileName, duration: audioDuration } = data.data;
    deriveNode({
      engine,
      sourceNodeId,
      targetType: 'audio',
      targetProps: {
        sourcePath: relativePath,
        fileName,
        duration: audioDuration,
        mimeType: 'audio/mpeg',
        origin: 'user' as const,
      },
    });
  } catch (err) {
    console.error('Audio extraction failed:', err);
  }
}

/** Build the props patch for switching video version stack primary. */
function buildVideoSwitchPrimaryPatch(
  stack: import("../engine/types").VersionStack,
  entryId: string,
): Partial<VideoNodeProps> {
  const newStack = switchPrimary(stack, entryId)
  const newPrimary = newStack.entries.find((e) => e.id === entryId)
  const patch: Partial<VideoNodeProps> = { versionStack: newStack }
  if (newPrimary?.output?.urls[0]) {
    patch.sourcePath = newPrimary.output.urls[0]
  }
  return patch
}

/** Build toolbar items for video nodes. */
function createVideoToolbarItems(ctx: CanvasToolbarContext<VideoNodeProps>) {
  const { clipStart, clipEnd, duration, sourcePath } = ctx.element.props;
  const isEmpty = !sourcePath?.trim()
    && !ctx.element.props.downloadTaskId?.trim()
    && !ctx.element.props.downloadError?.trim();

  // 逻辑：空节点的自定义工具仅保留上传，删除走右侧通用工具组。
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
    ];
  }

  const items: import("../engine/types").CanvasToolbarItem[] = []

  // 逻辑：版本堆叠 > 1 时在工具栏添加上一个/下一个导航按钮。
  const stack = ctx.element.props.versionStack
  const count = stack?.entries.length ?? 0
  if (stack && count > 1) {
    const primary = getPrimaryEntry(stack)
    const currentIdx = primary
      ? stack.entries.findIndex((e) => e.id === primary.id)
      : 0
    items.push(
      {
        id: 'version-prev',
        label: i18next.t('board:versionStack.prev'),
        showLabel: true,
        icon: <ChevronLeft size={14} />,
        className: [BOARD_TOOLBAR_ITEM_DEFAULT, currentIdx <= 0 ? 'opacity-30' : ''].join(' '),
        onSelect: () => {
          if (currentIdx <= 0) return
          ctx.updateNodeProps(buildVideoSwitchPrimaryPatch(stack, stack.entries[currentIdx - 1].id))
        },
      },
      {
        id: 'version-next',
        label: i18next.t('board:versionStack.next'),
        showLabel: true,
        icon: <ChevronRight size={14} />,
        className: [BOARD_TOOLBAR_ITEM_DEFAULT, currentIdx >= count - 1 ? 'opacity-30' : ''].join(' '),
        onSelect: () => {
          if (currentIdx >= count - 1) return
          ctx.updateNodeProps(buildVideoSwitchPrimaryPatch(stack, stack.entries[currentIdx + 1].id))
        },
      },
    )
  }

  const hasClip = (clipStart != null && clipStart > 0) || (clipEnd != null && duration != null && clipEnd < duration);

  // 逻辑：计算视频流播放所需的路径和 ID，传给剪辑对话框。
  const resolvedPath = resolveProjectRelativePath(sourcePath, ctx.fileContext) || sourcePath;
  const videoPath = computeVideoPath(sourcePath, resolvedPath);
  const effectiveProjectId = ctx.fileContext?.projectId
    ?? parseScopedProjectPath(sourcePath)?.projectId;
  const ids = {
    projectId: effectiveProjectId,
    boardId: isBoardRelativePath(sourcePath) ? ctx.fileContext?.boardId : undefined,
  };

  items.push(
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
          videoPath,
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
      id: 'extract-audio',
      label: i18next.t('board:videoNode.toolbar.extractAudio', { defaultValue: '分离音频' }),
      icon: <Volume2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => {
        void extractAudioFromVideo({
          engine: ctx.engine,
          sourceNodeId: ctx.element.id,
          props: ctx.element.props,
          fileContext: ctx.fileContext,
        });
      },
    },
  )
  return items;
}

// ---------------------------------------------------------------------------
// Connector templates
// ---------------------------------------------------------------------------

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
    const clipParams = `file=${encodeURIComponent(data.data.filePath)}&boardId=${encodeURIComponent(fileContext?.boardId ?? '')}`;
    const downloadUrl = baseUrl
      ? `${baseUrl}/media/video-clip/download?${clipParams}`
      : `/media/video-clip/download?${clipParams}`;

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

/** Build a direct stream URL for inline video playback. */
function buildStreamUrl(
  sourcePath: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl();
  const prefix = baseUrl ? `${baseUrl}/media/stream` : "/media/stream";

  if (ids.boardId && isBoardRelativePath(sourcePath)) {
    const query = new URLSearchParams({ boardId: ids.boardId, file: sourcePath });
    if (ids.projectId) query.set("projectId", ids.projectId);
    return `${prefix}?${query.toString()}`;
  }

  const query = new URLSearchParams({ path: sourcePath });
  if (ids.projectId) query.set("projectId", ids.projectId);
  return `${prefix}?${query.toString()}`;
}

type PosterResult = { dataUrl: string; width: number; height: number } | null;

/** Capture the first frame of a video as a data URL poster, returning dimensions too. */
function captureVideoPoster(streamUrl: string): Promise<PosterResult> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    let settled = false;
    const settle = (v: PosterResult) => {
      if (settled) return;
      settled = true;
      resolve(v);
      video.removeAttribute("src");
      video.load();
    };
    const timeout = setTimeout(() => settle(null), 8000);
    video.addEventListener("seeked", () => {
      clearTimeout(timeout);
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { settle(null); return; }
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        // 立即释放 canvas 占用的像素缓冲区
        canvas.width = 0;
        canvas.height = 0;
        settle({ dataUrl, width: w, height: h });
      } catch {
        settle(null);
      }
    }, { once: true });
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = 0.1;
    }, { once: true });
    video.addEventListener("error", () => {
      clearTimeout(timeout);
      settle(null);
    }, { once: true });
    video.src = streamUrl;
  });
}

/** Render a video node card with inline direct-stream playback. */
export function VideoNodeView({
  element,
  selected,
  expanded,
  onUpdate,
}: CanvasNodeViewProps<VideoNodeProps>) {
  const { fileContext, engine } = useBoardContext();
  const upstream = useUpstreamData(engine, expanded ? element.id : null);
  const panelOverlay = usePanelOverlay();
  const videoRef = useRef<HTMLVideoElement>(null);
  // 逻辑：自定义保存函数，上传视频后获取元数据并自动调整节点尺寸。
  const uploadSaveFn = useCallback(
    async (file: File, ctx: BoardFileContext) => {
      const relativePath = await saveBoardAssetFile({
        file,
        fallbackName: 'video.mp4',
        projectId: ctx.projectId,
        boardId: ctx.boardId,
        boardFolderUri: ctx.boardFolderUri,
      })
      onUpdate({
        sourcePath: relativePath,
        fileName: file.name,
        downloadTaskId: "",
        downloadUrl: "",
        downloadError: "",
      })
      const nodeId = element.id
      void (async () => {
        try {
          const metadata = await fetchVideoMetadata({
            projectId: ctx.projectId,
            boardId: ctx.boardId,
            uri: relativePath,
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
          engine.doc.updateNodeProps(nodeId, {
            naturalWidth: metadata.width,
            naturalHeight: metadata.height,
            duration: metadata.duration,
          })
          engine.doc.updateElement(nodeId, {
            xywh: [Math.round(cx - newW / 2), Math.round(cy - newH / 2), newW, newH],
          })
        } catch { /* ignore metadata fetch failure */ }
      })()
    },
    [onUpdate, element.id, engine],
  )
  const { fileInputRef, handleFileInputChange } = useFileUploadHandler<VideoNodeProps>({
    elementId: element.id,
    fileContext,
    onUpdate,
    fallbackName: 'video.mp4',
    saveFn: uploadSaveFn,
    skipTriggerEvent: true,
  });
  const { panelRef } = useInlinePanelSync({ engine, xywh: element.xywh, expanded });

  const [pickerOpen, setPickerOpen] = useState(false);

  /** Open the project file picker dialog to select a video file. */
  const requestPickVideo = useCallback(() => {
    setPickerOpen(true);
  }, []);

  /** Handle file selected from ProjectFilePickerDialog. */
  const handlePickerSelected = useCallback(
    (selection: ProjectFilePickerSelection | ProjectFilePickerSelection[]) => {
      const item = Array.isArray(selection) ? selection[0] : selection;
      if (!item) return;
      const parsed = parseScopedProjectPath(item.fileRef);
      const relativePath = parsed
        ? normalizeProjectRelativePath(parsed.relativePath)
        : item.fileRef;
      const scopedPath = formatScopedProjectPath({
        relativePath,
        projectId: item.projectId ?? fileContext?.projectId,
        currentProjectId: fileContext?.projectId,
      });
      onUpdate({
        sourcePath: scopedPath,
        fileName: relativePath.split('/').pop() || '',
        downloadTaskId: '',
        downloadUrl: '',
        downloadError: '',
      });
    },
    [fileContext, onUpdate],
  );

  /** Handle "import from computer" in the picker dialog. */
  const handleImportFromComputer = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  // 逻辑：监听工具栏上传按钮的自定义事件，打开文件选择器对话框。
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === element.id) {
        requestPickVideo();
      }
    };
    document.addEventListener('board:trigger-upload', handler);
    return () => document.removeEventListener('board:trigger-upload', handler);
  }, [element.id, requestPickVideo]);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hoverPreview, setHoverPreview] = useState(false);
  const hoverVideoRef = useRef<HTMLVideoElement>(null);
  const hoverContainerRef = useRef<HTMLDivElement>(null);
  const [downloadProgress, setDownloadProgress] = useState(-1);
  const [downloadPhase, setDownloadPhase] = useState<VideoDownloadPhase>("extracting");
  const [downloadTitle, setDownloadTitle] = useState("");
  const [retryingDownload, setRetryingDownload] = useState(false);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const xywhRef = useRef(element.xywh);
  xywhRef.current = element.xywh;

  const resolvedPath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext) || element.props.sourcePath,
    [element.props.sourcePath, fileContext]
  );
  const displayName = element.props.fileName || resolvedPath.split("/").pop() || i18next.t('board:nodeLabel.video');
  const posterSrc = element.props.posterPath?.trim() || "";
  const downloadTaskId = element.props.downloadTaskId?.trim() || "";
  const downloadUrl = element.props.downloadUrl?.trim() || "";
  const downloadError = element.props.downloadError?.trim() || "";
  const isDownloading = Boolean(downloadTaskId && !downloadError && !element.props.sourcePath?.trim());
  const hasDownloadFailure = Boolean(downloadError);

  const effectiveProjectId = useMemo(() => {
    if (fileContext?.projectId) return fileContext.projectId;
    const parsed = parseScopedProjectPath(element.props.sourcePath);
    return parsed?.projectId;
  }, [element.props.sourcePath, fileContext?.projectId]);

  // 逻辑：stream URL 需要未展开的原始路径 + ids，让服务端通过 boardId/projectId 正确解析。
  // resolvedPath 已经包含 board 目录前缀，直接传会导致服务端重复拼接。
  const videoPath = useMemo(() => {
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

  // 逻辑：挂载时检测已有视频节点的尺寸是否正确——
  // 修复历史节点因 ffprobe 未返回尺寸而回退 16:9 导致的黑边问题。
  useEffect(() => {
    if (!videoPath) return;
    // 已有合理的 naturalWidth/Height 且 > 16（排除 16x9 回退值）则认为尺寸已正确
    const nw = element.props.naturalWidth;
    const nh = element.props.naturalHeight;
    if (nw && nh && !(nw === 16 && nh === 9)) return;
    if (!ids.projectId && !ids.boardId) return;
    let cancelled = false;
    void (async () => {
      try {
        const metadata = await fetchVideoMetadata({
          projectId: ids.projectId,
          boardId: ids.boardId,
          uri: videoPath,
        });
        if (cancelled || !metadata?.width || !metadata?.height) return;
        engine.doc.updateNodeProps(element.id, {
          naturalWidth: metadata.width,
          naturalHeight: metadata.height,
          ...(metadata.duration ? { duration: metadata.duration } : {}),
        });
        const el = engine.doc.getElementById(element.id);
        if (el && el.kind === 'node') {
          const [ex, ey, ew, eh] = el.xywh;
          const ratio = metadata.width / metadata.height;
          const newW = Math.max(ew, 240);
          const newH = Math.round(newW / ratio);
          const cx = ex + ew / 2;
          const cy = ey + eh / 2;
          engine.doc.updateElement(element.id, {
            xywh: [Math.round(cx - newW / 2), Math.round(cy - newH / 2), newW, newH],
          });
        }
      } catch { /* 元数据获取失败时不阻断渲染 */ }
    })();
    return () => { cancelled = true; };
  }, [element.id, videoPath, element.props.naturalWidth, element.props.naturalHeight, ids.projectId, ids.boardId, engine]);

  // 逻辑：有视频但无 poster 时自动提取首帧作为缩略图。
  useEffect(() => {
    if (!videoPath || posterSrc || !ids.boardId && !ids.projectId) return;
    let cancelled = false;
    const url = buildStreamUrl(videoPath, ids);
    captureVideoPoster(url).then((result) => {
      if (!cancelled && result) {
        onUpdate({ posterPath: result.dataUrl });
      }
    });
    return () => { cancelled = true; };
  }, [videoPath, ids, posterSrc, onUpdate]);

  // 逻辑：pointerLeave 在 pointer capture 或画布变换时可能不触发，
  // 用全局 pointermove 做安全守卫，确保鼠标离开后暂停预览。
  useEffect(() => {
    if (!hoverPreview) return;
    const container = hoverContainerRef.current;
    if (!container) return;
    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        setHoverPreview(false);
        const v = hoverVideoRef.current;
        if (v) { v.pause(); v.currentTime = 0; }
      }
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [hoverPreview]);

  useEffect(() => {
    if (!isDownloading || !downloadTaskId) return;
    if (downloadAbortRef.current) return;

    const controller = new AbortController();
    downloadAbortRef.current = controller;

    const run = async () => {
      try {
        for (let attempt = 0; attempt < 300; attempt += 1) {
          if (controller.signal.aborted) return;
          const status = await pollVideoDownloadProgress(downloadTaskId);

          if (status.info?.title) {
            setDownloadTitle(status.info.title);
          }
          if (typeof status.progress === "number") {
            setDownloadProgress(status.progress);
          }
          if (status.phase) {
            setDownloadPhase(status.phase);
          }

          if (status.status === "completed" && status.result) {
            const fileName = status.result.fileName || "";
            const nextSourcePath = `${BOARD_ASSETS_DIR_NAME}/${fileName}`;
            const naturalWidth = status.result.width || 16;
            const naturalHeight = status.result.height || 9;
            const [nodeW, nodeH] = fitVideoSize(naturalWidth, naturalHeight, 420);
            const [x, y, w, h] = xywhRef.current;
            const centerX = x + w / 2;
            const centerY = y + h / 2;

            // 逻辑：先更新 props（让 poster 渲染出来），再更新 xywh（触发尺寸动画），
            // 避免「先变大显示空白，再显示 poster」的跳变体验。
            engine.doc.updateNodeProps(element.id, {
              sourcePath: nextSourcePath,
              fileName: fileName || undefined,
              posterPath: status.result.posterDataUrl || undefined,
              naturalWidth,
              naturalHeight,
              downloadTaskId: "",
              downloadUrl: "",
              downloadError: "",
            });
            engine.doc.updateElement(element.id, {
              xywh: [
                Math.round(centerX - nodeW / 2),
                Math.round(centerY - nodeH / 2),
                nodeW,
                nodeH,
              ],
            });
            // 逻辑：下载完成后用 ffprobe 补充精确的视频尺寸和时长，
            // 修正初始 result.width/height 为 0 时回退 16:9 导致的黑边问题。
            void (async () => {
              try {
                const metadata = await fetchVideoMetadata({
                  projectId: fileContext?.projectId,
                  boardId: fileContext?.boardId,
                  uri: nextSourcePath,
                });
                if (!metadata) return;
                const propsPatch: Partial<VideoNodeProps> = {};
                if (metadata.duration) propsPatch.duration = metadata.duration;
                if (metadata.width && metadata.height) {
                  propsPatch.naturalWidth = metadata.width;
                  propsPatch.naturalHeight = metadata.height;
                }
                if (Object.keys(propsPatch).length > 0) {
                  engine.doc.updateNodeProps(element.id, propsPatch);
                }
                // 当 ffprobe 返回的真实尺寸与初始回退值不同时，重新调整节点比例
                if (metadata.width && metadata.height &&
                    (metadata.width !== naturalWidth || metadata.height !== naturalHeight)) {
                  const el = engine.doc.getElementById(element.id);
                  if (el && el.kind === 'node') {
                    const [ex, ey, ew, eh] = el.xywh;
                    const ratio = metadata.width / metadata.height;
                    const newW = Math.max(ew, 240);
                    const newH = Math.round(newW / ratio);
                    const cx = ex + ew / 2;
                    const cy = ey + eh / 2;
                    engine.doc.updateElement(element.id, {
                      xywh: [Math.round(cx - newW / 2), Math.round(cy - newH / 2), newW, newH],
                    });
                  }
                }
              } catch {
                // 逻辑：下载成功后的补充元数据失败不影响节点落盘。
              }
            })();
            setDownloadProgress(100);
            return;
          }

          if (status.status === "failed") {
            throw new Error(
              status.error
                || i18next.t('board:loading.downloadFailed', { defaultValue: '视频下载失败' }),
            );
          }

          await new Promise((resolve) =>
            setTimeout(resolve, attempt < 30 ? 2000 : attempt < 60 ? 5000 : 10000),
          );
        }

        throw new Error(i18next.t('board:loading.videoTimeout', { defaultValue: '视频下载超时' }));
      } catch (error) {
        if (controller.signal.aborted) return;
        const raw = error instanceof Error ? error.message : '';
        const isTechnical = /\/|\\|EACCES|ENOENT|spawn|node_modules/.test(raw);
        const message = isTechnical || !raw
          ? i18next.t('board:loading.downloadFailed', { defaultValue: '视频下载失败' })
          : raw;
        engine.doc.updateNodeProps(element.id, { downloadError: message });
      } finally {
        if (downloadAbortRef.current === controller) {
          downloadAbortRef.current = null;
        }
      }
    };

    run();

    return () => {
      controller.abort();
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
      }
    };
  }, [
    downloadTaskId,
    element.id,
    element.props.sourcePath,
    engine,
    fileContext?.projectId,
    fileContext?.boardId,
    isDownloading,
  ]);

  const handleCancelDownload = useCallback(async () => {
    if (!downloadTaskId) return;
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
      downloadAbortRef.current = null;
    }
    try {
      await cancelVideoDownload(downloadTaskId);
    } catch (error) {
      console.warn("[VideoNode] cancel download failed:", error);
    } finally {
      engine.doc.deleteElement(element.id);
    }
  }, [downloadTaskId, element.id, engine]);

  const handleRetryDownload = useCallback(async () => {
    if (!downloadUrl || retryingDownload) return;
    setRetryingDownload(true);
    try {
      const nextTaskId = await startVideoDownload({
        url: downloadUrl,
        boardFolderUri: fileContext?.boardFolderUri,
        projectId: fileContext?.projectId,
        boardId: fileContext?.boardId,
      });
      setDownloadProgress(-1);
      setDownloadPhase("extracting");
      setDownloadTitle("");
      engine.doc.updateNodeProps(element.id, {
        downloadTaskId: nextTaskId,
        downloadError: "",
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : i18next.t('board:loading.downloadFailed', { defaultValue: '视频下载失败' });
      engine.doc.updateNodeProps(element.id, { downloadError: message });
    } finally {
      setRetryingDownload(false);
    }
  }, [
    downloadUrl,
    retryingDownload,
    fileContext?.boardFolderUri,
    fileContext?.projectId,
    fileContext?.boardId,
    engine,
    element.id,
  ]);

  const downloadStatusText = (() => {
    if (downloadPhase === "extracting" || downloadProgress < 0) {
      return i18next.t('board:loading.statusExtracting', { defaultValue: '解析视频信息...' });
    }
    if (downloadPhase === "merging") {
      return i18next.t('board:loading.statusMerging', { defaultValue: '合并音视频...' });
    }
    return `${i18next.t('board:loading.statusDownloading', { defaultValue: '下载中' })} ${Math.max(downloadProgress, 0)}%`;
  })();

  // 逻辑：用 ref 持有 clip 值，避免放入 useEffect deps 导致拖滑块时重建播放。
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
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setPlaying(false);
    setLoading(false);
  }, []);

  const handlePlayInline = useCallback(() => {
    if (!videoPath) return;
    stoppedRef.current = false;
    setPlaying(true);
    setLoading(true);
  }, [videoPath]);

  // 拖拽期间暂停视频播放
  useEffect(() => {
    if (!playing) return;
    return engine.subscribe(() => {
      const snap = engine.getSnapshot();
      if (snap.draggingId != null) {
        handleStop();
      }
    });
  }, [engine, playing, handleStop]);

  // 逻辑：playing 时通过 stream 端点播放视频。
  useEffect(() => {
    if (!playing || !videoPath) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const streamUrl = buildStreamUrl(videoPath, ids);
    video.muted = true;

    const onLoadedMetadata = () => {
      if (cancelled) return;
      const d = video.duration;
      if (Number.isFinite(d) && d > 0 && durationRef.current == null) {
        onUpdateRef.current({ duration: d } as Partial<VideoNodeProps>);
      }
      setLoading(false);
      const cs = clipStartRef.current;
      if (cs != null && cs > 0) {
        video.currentTime = cs;
      }
      video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);

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

    const onError = () => {
      if (!cancelled) {
        console.error("[VideoNode] playback error:", video.error);
        handleStop();
      }
    };
    video.addEventListener("error", onError);

    video.src = streamUrl;
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("error", onError);
      // 释放 Chromium 媒体解码资源，防止 video 元素持续缓冲导致 V8 OOM
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [playing, videoPath, ids, handleStop]);


  // ---------------------------------------------------------------------------
  // Version-stack based generation
  // ---------------------------------------------------------------------------
  const { primaryEntry, generatingEntry, isGenerating: isGeneratingVersion } = useVersionStackState(element.props.versionStack)
  const { handleCancel: handleCancelGeneration, cancelling: cancellingGeneration } = useCancelGeneration(generatingEntry?.taskId);

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
            // 逻辑：先更新 props 再更新 xywh，让内容先渲染再触发尺寸动画。
            engine.doc.updateNodeProps(nodeId, {
              naturalWidth: metadata.width,
              naturalHeight: metadata.height,
              duration: metadata.duration,
            })
            engine.doc.updateElement(nodeId, {
              xywh: [Math.round(cx - newW / 2), Math.round(cy - newH / 2), newW, newH],
            })
          } catch { /* ignore metadata fetch failure */ }
        })()
        // 逻辑：生成完成后自动提取首帧作为节点缩略图，
        // 同时利用浏览器 <video> 解码拿到的真实尺寸调整节点比例，
        // 作为 ffprobe 的备用方案，避免 ffprobe 未能及时返回时节点留白。
        void (async () => {
          try {
            const ids = { projectId: fileContext?.projectId, boardId: fileContext?.boardId }
            const url = buildStreamUrl(savedPath, ids)
            const result = await captureVideoPoster(url)
            if (!result) return
            engine.doc.updateNodeProps(nodeId, { posterPath: result.dataUrl })
            // 逻辑：利用浏览器解码的视频尺寸调整节点比例。
            // 仅当节点尚未被 ffprobe 修正过时才执行（避免重复调整）。
            if (result.width > 0 && result.height > 0) {
              const el = engine.doc.getElementById(nodeId)
              if (el && el.kind === 'node') {
                const curProps = el.props as VideoNodeProps
                const alreadyCorrected = curProps.naturalWidth && curProps.naturalHeight
                  && !(curProps.naturalWidth === 16 && curProps.naturalHeight === 9)
                if (!alreadyCorrected) {
                  engine.doc.updateNodeProps(nodeId, {
                    naturalWidth: result.width,
                    naturalHeight: result.height,
                  })
                  const [ex, ey, ew, eh] = el.xywh
                  const ratio = result.width / result.height
                  const newW = Math.max(ew, 240)
                  const newH = Math.round(newW / ratio)
                  const cx = ex + ew / 2
                  const cy = ey + eh / 2
                  engine.doc.updateElement(nodeId, {
                    xywh: [Math.round(cx - newW / 2), Math.round(cy - newH / 2), newW, newH],
                  })
                }
              }
            }
          } catch { /* ignore poster capture failure */ }
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

  // ── Video-specific callbacks for useMediaGeneration ──
  const buildSnapshot = useCallback(
    (params: VideoGenerateParams, up: UpstreamData | null) =>
      createInputSnapshot({
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
        upstreamRefs: up?.entries ?? [],
      }),
    [],
  )
  // Panel's handleGenerate already persists aiConfig (with cache).
  // Returning {} avoids a stale-closure overwrite from useMediaGeneration.
  const buildGeneratePatch = useCallback(
    (_params: VideoGenerateParams) => ({}),
    [],
  )
  // Derive nodes need aiConfig for initial setup (no panel involved).
  const buildDeriveNodePatch = useCallback(
    (params: VideoGenerateParams) => ({
      aiConfig: {
        lastUsed: { feature: params.feature, variant: params.variant },
        lastGeneration: {
          prompt: params.prompt ?? '',
          feature: params.feature,
          variant: params.variant,
          generatedAt: Date.now(),
        },
      },
    }),
    [],
  )
  const videoSubmitGenerate = useCallback(
    (params: VideoGenerateParams, options: SubmitOptions) =>
      submitVideoGenerate(
        {
          feature: params.feature,
          variant: params.variant,
          inputs: params.inputs,
          params: params.params,
          count: params.count,
        },
        options,
      ),
    [],
  )
  const buildRetryParams = useCallback(
    (input: InputSnapshot): VideoGenerateParams => ({
      feature: (input.parameters?.feature as VideoGenerateParams['feature']) ?? 'videoGenerate',
      variant: (input.parameters?.variant as string) ?? '',
      inputs: input.parameters?.inputs as Record<string, unknown> | undefined,
      params: input.parameters?.params as Record<string, unknown> | undefined,
      mode: (input.parameters?.mode as VideoGenerateParams['mode']) ?? 'text',
      prompt: input.prompt,
      aspectRatio: (input.parameters?.aspectRatio as string) ?? '16:9',
      duration: (input.parameters?.duration as 5 | 10 | 15) ?? 5,
      quality: input.parameters?.quality as VideoGenerateParams['quality'],
      withAudio: input.parameters?.withAudio as boolean | undefined,
    }),
    [],
  )

  const {
    handleGenerate,
    handleRetryGenerate: handleRetry,
    handleGenerateNewNode,
  } = useMediaGeneration<VideoGenerateParams>({
    elementId: element.id,
    versionStack: element.props.versionStack,
    fileContext,
    engine,
    upstream,
    onUpdate,
    setLastFailure,
    lastFailure,
    buildSnapshot,
    buildGeneratePatch,
    submitGenerate: videoSubmitGenerate,
    buildRetryParams,
    deriveNodeType: 'video',
    buildDeriveNodePatch,
  })

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
        engine={engine}
        selected={selected}
      />
      <div
        className={[
          "relative flex h-full w-full items-center justify-center rounded-3xl box-border",
          "bg-background text-ol-text-primary",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (isGenerating || isDownloading || isFailed || hasDownloadFailure) return;
          // 逻辑：空节点双击打开文件选择器对话框，有内容时双击打开视频预览。
          if (!element.props.sourcePath?.trim()) {
            requestPickVideo();
            return;
          }
          if (playing) handleStop();
          void openVideoPreview(element.props, fileContext);
        }}
      >
        {/* Generating overlay */}
        {isGenerating && (
          <GeneratingOverlay
            startedAt={generatingEntry?.createdAt ?? pollingResult.startedAt}
            estimatedSeconds={90}
            serverProgress={pollingResult.progress}
            color="blue"
            onCancel={handleCancelGeneration}
            cancelling={cancellingGeneration}
          />
        )}
        {isDownloading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl bg-background/80 px-4 text-center backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-ol-text-secondary" />
            <span className="text-xs font-medium text-ol-text-secondary">
              {downloadStatusText}
            </span>
            <span
              className="line-clamp-1 max-w-full text-[11px] text-ol-text-auxiliary"
              title={downloadTitle || downloadUrl || displayName}
            >
              {downloadTitle || downloadUrl || displayName}
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-ol-blue transition-all duration-300"
                style={{ width: `${Math.max(Math.min(downloadProgress, 100), 0)}%` }}
              />
            </div>
            <button
              type="button"
              className="mt-1 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium text-ol-text-secondary hover:bg-foreground/5 hover:text-foreground transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation();
                void handleCancelDownload();
              }}
            >
              {i18next.t('board:loading.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        ) : null}

        {/* Failed / Cancelled overlay */}
        <FailureOverlay
          visible={isFailed && !dismissedFailure}
          isCancelled={lastFailure?.error?.code === 'CANCELLED'}
          message={lastFailure?.error?.message || i18next.t('board:videoNode.generateFailed', { defaultValue: 'Generation failed' })}
          cancelledKey="board:videoNode.cancelled"
          retryKey="board:videoNode.retry"
          resendKey="board:videoNode.resend"
          onRetry={handleRetry}
          canDismiss={Boolean(posterSrc)}
          onDismiss={() => setDismissedFailure(true)}
        />
        <FailureOverlay
          visible={hasDownloadFailure}
          isCancelled={false}
          message={downloadError}
          cancelledKey="board:videoNode.cancelled"
          retryKey="board:loading.retry"
          resendKey="board:loading.retry"
          onRetry={() => void handleRetryDownload()}
        />

        {playing ? (
          <div
            className="group relative h-full w-full overflow-hidden rounded-3xl bg-black"
            data-board-scroll
          >
            <video
              ref={videoRef}
              muted
              preload="none"
              className="absolute inset-0 h-full w-full object-contain"
              onEnded={handleStop}
            />
            {/* 加载中保留 poster，避免黑屏闪烁 */}
            {loading && posterSrc ? (
              <img
                src={posterSrc}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />
            ) : null}
            {loading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              </div>
            ) : (
              <>
                {/* Pause button on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    type="button"
                    data-board-controls
                    className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-3xl border border-white/40 bg-black/40 text-white transition-transform duration-200 ease-out hover:scale-125"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleStop();
                    }}
                  >
                    <Pause className="h-[50%] w-[50%] min-h-2.5 min-w-2.5 fill-current" />
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
          <div
            ref={hoverContainerRef}
            className="relative h-full w-full overflow-hidden rounded-3xl"
            onPointerEnter={() => {
              if (!playing && videoPath) setHoverPreview(true)
            }}
            onPointerLeave={() => {
              if (hoverPreview) {
                setHoverPreview(false)
                const v = hoverVideoRef.current
                if (v) { v.pause(); v.currentTime = 0 }
              }
            }}
          >
            <img
              src={posterSrc}
              alt={displayName}
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
            {/* Hover auto-play preview */}
            {videoPath ? (
              <video
                ref={hoverVideoRef}
                src={hoverPreview ? buildStreamUrl(videoPath, ids) : undefined}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${hoverPreview ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                autoPlay
                muted
                loop
                playsInline
                preload="none"
              />
            ) : null}
            {!hoverPreview ? (
              <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover/node:opacity-0">
                  <button
                    type="button"
                    data-board-controls
                    className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-3xl border border-white/40 bg-black/40 text-white"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handlePlayInline();
                    }}
                  >
                    <Play className="h-[50%] w-[50%] min-h-2.5 min-w-2.5 translate-x-[0.5px] fill-current" />
                  </button>
              </div>
            ) : null}
          </div>
        ) : !element.props.sourcePath?.trim() && !isGenerating && !isDownloading ? (
          <div className="flex h-full w-full items-center justify-center rounded-3xl bg-ol-surface-muted">
            <div className="flex flex-col items-center gap-2 text-muted-foreground/40 px-4">
              <Video size={36} strokeWidth={1.2} />
              <span className="text-xs text-center leading-relaxed whitespace-pre-line">
                {i18next.t('board:videoNode.emptyHint', { defaultValue: '双击上传视频\n或选中后 AI 生成' })}
              </span>
            </div>
          </div>
        ) : isGenerating ? null : (
          <div className="relative h-full w-full">
            <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover/node:opacity-0">
              <button
                type="button"
                data-board-controls
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-3xl bg-ol-surface-muted text-ol-text-auxiliary"
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
      <InlinePanelPortal
        expanded={expanded}
        panelOverlay={panelOverlay}
        panelRef={panelRef}
        xywh={element.xywh}
        engine={engine}
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
          rawUpstream={upstream}
          boardId={fileContext?.boardId}
          projectId={fileContext?.projectId}
          boardFolderUri={fileContext?.boardFolderUri}
          readonly={(isReadyFromAi || !!generatingEntry) && !editingOverride}
          editing={editingOverride}
          onUnlock={() => setEditingOverride(true)}
          onCancelEdit={() => setEditingOverride(false)}
        />
      </InlinePanelPortal>
      <ProjectFilePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={i18next.t('board:videoNode.pickTitle', { defaultValue: '选择视频文件' })}
        filterHint={i18next.t('board:videoNode.pickHint', { defaultValue: '支持 mp4、mov、avi、mkv、webm' })}
        allowedExtensions={VIDEO_EXTS}
        excludeBoardEntries
        currentBoardFolderUri={fileContext?.boardFolderUri}
        defaultRootUri={fileContext?.rootUri}
        defaultActiveUri={fileContext?.boardFolderUri}
        onSelectFile={handlePickerSelected}
        onSelectFiles={handlePickerSelected}
        onImportFromComputer={handleImportFromComputer}
      />
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
      lastUsed: z.object({ feature: z.string(), variant: z.string() }).optional(),
      cache: z.record(z.string(), z.any()).optional(),
      lastGeneration: z.object({
        prompt: z.string(),
        feature: z.string(),
        variant: z.string(),
        aspectRatio: z.string().optional(),
        generatedAt: z.number(),
      }).optional(),
    }).optional(),
    versionStack: z.any().optional(),
    downloadTaskId: z.string().optional(),
    downloadUrl: z.string().optional(),
    downloadError: z.string().optional(),
  }),
  defaultProps: {
    sourcePath: "",
    fileName: "",
    downloadTaskId: "",
    downloadUrl: "",
    downloadError: "",
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
  outputTypes: ['video'],
  toolbar: (ctx) => createVideoToolbarItems(ctx),
};
