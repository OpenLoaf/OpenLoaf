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
import { createPortal } from "react-dom";
import { z } from "zod";
import {
  AlertTriangle,
  Download,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Trash2,
  Type,
  Video,
} from "lucide-react";
import i18next from "i18next";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import type { BoardFileContext } from "../board-contracts";
import { useBoardContext } from "../core/BoardProvider";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { arrayBufferToBase64 } from "../utils/base64";
import { NodeFrame } from "./NodeFrame";
import { AudioAiPanel } from "../panels/AudioAiPanel";
import type { AudioPanelUpstream } from "../panels/AudioAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { submitAudioGenerate } from "../services/audio-generate";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import {
  createInputSnapshot,
  createGeneratingEntry,
  pushVersion,
  markVersionReady,
  markVersionFailed,
  getPrimaryEntry,
  getGeneratingEntry,
  switchPrimary,
} from '../engine/version-stack';
import { useMediaTaskPolling } from '../hooks/useMediaTaskPolling';
import { VersionStackOverlay } from './VersionStackOverlay';

/** Inline panel gap from node bottom edge in screen pixels (zoom-independent). */
const PANEL_GAP_PX = 8;

export type AudioNodeProps = {
  /** Board-relative path for the audio file. */
  sourcePath: string;
  /** Display name. */
  fileName?: string;
  /** Duration in seconds. */
  duration?: number;
  /** MIME type. */
  mimeType?: string;
  /** How the audio was created. Defaults to 'upload'. */
  origin?: import("../board-contracts").NodeOrigin;
  /** AI generation config. Present only when origin is 'ai-generate'. */
  aiConfig?: import("../board-contracts").AiGenerateConfig;
  /** Version stack tracking AI generation history. */
  versionStack?: import("../engine/types").VersionStack;
};

/** Resolve a board-scoped path into a project-relative path. */
function resolveProjectRelativePath(
  path: string,
  fileContext?: BoardFileContext,
) {
  const scope = resolveBoardFolderScope(fileContext);
  return resolveProjectPathFromBoardUri({
    uri: path,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
}

/** Format seconds to mm:ss. */
function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Resolve the default directory for download dialogs. */
function resolveDownloadDefaultDir(fileContext?: BoardFileContext) {
  const boardFolderUri = fileContext?.boardFolderUri?.trim()
  if (boardFolderUri) {
    if (boardFolderUri.startsWith('file://')) return boardFolderUri
  }
  const rootUri = fileContext?.rootUri?.trim()
  if (rootUri && rootUri.startsWith('file://')) return rootUri
  return ''
}

/** Trigger a download for the audio file. */
async function downloadAudioFile(
  props: AudioNodeProps,
  fileContext?: BoardFileContext,
) {
  const resolvedPath =
    resolveProjectRelativePath(props.sourcePath, fileContext) ||
    props.sourcePath
  if (!resolvedPath) return

  let href = resolvedPath
  if (
    !resolvedPath.startsWith('data:') &&
    !resolvedPath.startsWith('blob:') &&
    !resolvedPath.startsWith('http://') &&
    !resolvedPath.startsWith('https://')
  ) {
    const parsed = parseScopedProjectPath(props.sourcePath)
    href = getPreviewEndpoint(resolvedPath, {
      projectId: fileContext?.projectId ?? parsed?.projectId,
    })
  }

  const saveFile = window.openloafElectron?.saveFile
  if (saveFile) {
    try {
      const response = await fetch(href)
      if (!response.ok) throw new Error('download failed')
      const buffer = await response.arrayBuffer()
      const contentBase64 = arrayBufferToBase64(buffer)
      const defaultDir = resolveDownloadDefaultDir(fileContext)
      const fileName = props.fileName || 'audio.mp3'
      const extension = fileName.split('.').pop() || 'mp3'
      const result = await saveFile({
        contentBase64,
        defaultDir: defaultDir || undefined,
        suggestedName: fileName,
        filters: [{ name: 'Audio', extensions: [extension] }],
      })
      if (result?.ok || result?.canceled) return
    } catch {
      // fallback to browser download
    }
  }
  const link = document.createElement('a')
  link.href = href
  link.download = props.fileName || 'audio'
  link.rel = 'noreferrer'
  link.click()
}

/**
 * Module-level set tracking which nodes have been unlocked for editing.
 * Set by toolbar "regenerate" action, read by the component to override readonly.
 */
const editingUnlockedIds = new Set<string>();

/** Build toolbar items for audio nodes. */
function createAudioToolbarItems(
  ctx: CanvasToolbarContext<AudioNodeProps>,
) {
  const items = []
  const origin = ctx.element.props.origin
  const tbPrimaryEntry = getPrimaryEntry(ctx.element.props.versionStack)
  const isAiReady = origin === 'ai-generate' && tbPrimaryEntry?.status === 'ready'

  if (isAiReady) {
    items.push({
      id: 'regenerate',
      label: i18next.t('board:audioNode.toolbar.regenerate'),
      icon: <RefreshCw size={14} />,
      onSelect: () => {
        editingUnlockedIds.add(ctx.element.id);
        ctx.engine.setExpandedNodeId(ctx.element.id);
      },
    })
    items.push({ id: 'divider-1', label: '', icon: null } as never)
  }

  items.push(
    {
      id: 'play',
      label: i18next.t('board:audioNode.toolbar.play'),
      icon: <Play size={14} />,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
    {
      id: 'download',
      label: i18next.t('board:audioNode.toolbar.download'),
      icon: <Download size={14} />,
      onSelect: () =>
        void downloadAudioFile(ctx.element.props, ctx.fileContext),
    },
    {
      id: 'inspect',
      label: i18next.t('board:audioNode.toolbar.detail'),
      icon: <Music size={14} />,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
    {
      id: 'delete',
      label: i18next.t('board:audioNode.toolbar.delete'),
      icon: <Trash2 size={14} />,
      className: 'text-destructive',
      onSelect: () => {
        ctx.engine.doc.removeElement(ctx.element.id)
        ctx.engine.commitHistory()
      },
    },
  )

  return items
}

/** Connector templates offered by the audio node. */
function getAudioNodeConnectorTemplates(): CanvasConnectorTemplateDefinition[] {
  return [
    {
      id: 'text',
      label: i18next.t('board:connector.speechRecognition'),
      description: i18next.t('board:connector.speechRecognitionDesc'),
      size: [200, 200],
      icon: <Type size={14} />,
      createNode: () => ({
        type: 'text',
        props: { style: 'sticky', stickyColor: 'yellow' },
      }),
    },
    {
      id: 'video',
      label: i18next.t('board:connector.addAudioToVideo'),
      description: i18next.t('board:connector.addAudioToVideoDesc'),
      size: [320, 180],
      icon: <Video size={14} />,
      createNode: () => ({
        type: 'video',
        props: {},
      }),
    },
    {
      id: 'audio',
      label: i18next.t('board:connector.voiceClone'),
      description: i18next.t('board:connector.voiceCloneDesc'),
      size: [320, 120],
      icon: <Music size={14} />,
      createNode: () => ({
        type: 'audio',
        props: {},
      }),
    },
  ]
}

/** Render an audio node card with inline playback. */
export function AudioNodeView({
  element,
  expanded,
  onUpdate,
}: CanvasNodeViewProps<AudioNodeProps>) {
  const { fileContext, engine } = useBoardContext();
  const upstream = useUpstreamData(engine, expanded ? element.id : null);
  const panelOverlay = usePanelOverlay();
  const panelRef = useRef<HTMLDivElement>(null);

  // 逻辑：通过 subscribeView 直接操作 DOM 同步面板缩放，避免 React 渲染延迟。
  // 面板通过 Portal 渲染到 panelOverlay 层（笔画上方），用 scale(1/zoom) 保持固定屏幕大小。
  // 间距用 PANEL_GAP_PX / zoom 保证屏幕上恒定像素间距。
  const xywhRef = useRef(element.xywh);
  xywhRef.current = element.xywh;
  useEffect(() => {
    if (!expanded) return;
    const syncPanelScale = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const zoom = engine.viewport.getState().zoom;
      const [, ny, , nh] = xywhRef.current;
      panel.style.transform = `translateX(-50%) scale(${1 / zoom})`;
      panel.style.top = `${ny + nh + PANEL_GAP_PX / zoom}px`;
    };
    syncPanelScale();
    const unsub = engine.subscribeView(syncPanelScale);
    return unsub;
  }, [engine, expanded]);

  const projectRelativePath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext),
    [element.props.sourcePath, fileContext],
  );
  const resolvedPath = projectRelativePath || element.props.sourcePath;
  const displayName =
    element.props.fileName || resolvedPath.split("/").pop() || i18next.t('board:nodeLabel.audio');
  const durationText = formatDuration(element.props.duration);
  const boardId = fileContext?.boardId ?? "";

  // 逻辑：从 @{[proj_xxx]/path} 格式中提取 projectId 作为 fallback。
  const effectiveProjectId = useMemo(() => {
    if (fileContext?.projectId) return fileContext.projectId;
    const parsed = parseScopedProjectPath(element.props.sourcePath);
    return parsed?.projectId;
  }, [element.props.sourcePath, fileContext?.projectId]);

  const audioSrc = useMemo(() => {
    if (!resolvedPath) return "";
    if (
      resolvedPath.startsWith("data:") ||
      resolvedPath.startsWith("blob:") ||
      resolvedPath.startsWith("http://") ||
      resolvedPath.startsWith("https://")
    ) {
      return resolvedPath;
    }
    return getPreviewEndpoint(resolvedPath, {
      projectId: effectiveProjectId,
    });
  }, [effectiveProjectId, resolvedPath]);

  const handleOpenPreview = useCallback(() => {
    if (!resolvedPath) return;
    openFilePreview({
      viewer: "file",
      items: [
        {
          uri: element.props.sourcePath,
          openUri: resolvedPath,
          name: displayName,
          title: displayName,
          projectId: effectiveProjectId,
          rootUri: fileContext?.rootUri,
          boardId,
        },
      ],
      activeIndex: 0,
      showSave: false,
      enableEdit: false,
    });
  }, [
    boardId,
    displayName,
    effectiveProjectId,
    element.props.sourcePath,
    fileContext?.rootUri,
    resolvedPath,
  ]);

  // ---------------------------------------------------------------------------
  // Version-stack based generation
  // ---------------------------------------------------------------------------
  const primaryEntry = getPrimaryEntry(element.props.versionStack)
  const generatingEntry = getGeneratingEntry(element.props.versionStack)

  const saveDir = useMemo(
    () =>
      fileContext?.boardFolderUri
        ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
        : undefined,
    [fileContext?.boardFolderUri],
  )

  const pollingResult = useMediaTaskPolling({
    taskId: generatingEntry?.taskId,
    taskType: 'audio_generate',
    projectId: fileContext?.projectId,
    saveDir,
    enabled: !!generatingEntry,
    onSuccess: useCallback(
      (resultUrls: string[]) => {
        if (!generatingEntry) return
        const stack = element.props.versionStack
        if (!stack) return
        const savedPath = resultUrls[0]?.trim() || ''
        onUpdate({
          versionStack: markVersionReady(stack, generatingEntry.id, { urls: resultUrls }),
          sourcePath: savedPath,
        })
      },
      [generatingEntry, element.props.versionStack, onUpdate],
    ),
    onFailure: useCallback(
      (error: string) => {
        if (!generatingEntry) return
        const stack = element.props.versionStack
        if (!stack) return
        onUpdate({
          versionStack: markVersionFailed(stack, generatingEntry.id, {
            code: 'GENERATE_FAILED',
            message: error,
          }),
        })
      },
      [generatingEntry, element.props.versionStack, onUpdate],
    ),
  })

  const handleGenerate = useCallback(
    async (params: {
      mode: import('../panels/AudioAiPanel').AudioGenerateMode
      prompt: string
      modelId: string
      duration: import('../panels/AudioAiPanel').AudioDurationOption | 'auto'
      textContent?: string
      referenceAudioSrc?: string
    }) => {
      try {
        const result = await submitAudioGenerate(
          {
            prompt: params.prompt,
            modelId: params.modelId === 'auto' ? undefined : params.modelId,
            audioType: params.mode === 'tts' ? 'voiceover' : params.mode,
            duration: params.duration === 'auto' ? undefined : params.duration,
          },
          {
            projectId: fileContext?.projectId,
            saveDir,
            sourceNodeId: element.id,
          },
        )

        const snapshot = createInputSnapshot({
          prompt: params.prompt,
          modelId: params.modelId,
          parameters: {
            mode: params.mode,
            duration: params.duration,
            textContent: params.textContent,
            referenceAudioSrc: params.referenceAudioSrc,
          },
        })
        const entry = createGeneratingEntry(snapshot, result.taskId)
        onUpdate({
          versionStack: pushVersion(element.props.versionStack, entry),
          origin: 'ai-generate',
        })
      } catch (err) {
        console.error('[AudioNode] submitAudioGenerate failed:', err)
        onUpdate({
          aiConfig: {
            ...(element.props.aiConfig ?? { modelId: params.modelId, prompt: params.prompt }),
            taskId: undefined,
          },
        })
      }
    },
    [element.id, element.props.versionStack, element.props.aiConfig, fileContext?.projectId, saveDir, onUpdate],
  )

  /** Retry generation using the failed entry's input snapshot. */
  const handleRetry = useCallback(() => {
    if (!primaryEntry?.input) return
    const input = primaryEntry.input
    handleGenerate({
      mode: (input.parameters?.mode as import('../panels/AudioAiPanel').AudioGenerateMode) ?? 'music',
      prompt: input.prompt,
      modelId: input.modelId,
      duration: (input.parameters?.duration as import('../panels/AudioAiPanel').AudioDurationOption | 'auto') ?? 'auto',
      textContent: input.parameters?.textContent as string | undefined,
      referenceAudioSrc: input.parameters?.referenceAudioSrc as string | undefined,
    })
  }, [primaryEntry, handleGenerate])

  const isGenerating = primaryEntry?.status === 'generating'
  const isFailed = primaryEntry?.status === 'failed'
  const isReadyFromAi = primaryEntry?.status === 'ready' && element.props.origin === 'ai-generate'

  /**
   * Editing override — check module-level editingUnlockedIds set.
   * Set by toolbar "regenerate" action, cleared when generation starts.
   */
  const [editingOverride, setEditingOverride] = useState(
    () => editingUnlockedIds.has(element.id),
  );
  // 逻辑：每次 expanded 变化时检查是否被标记为编辑模式。
  useEffect(() => {
    if (editingUnlockedIds.has(element.id)) {
      editingUnlockedIds.delete(element.id);
      setEditingOverride(true);
    }
  }, [expanded, element.id]);
  // 逻辑：生成开始后或面板关闭后自动关闭编辑覆盖。
  useEffect(() => {
    if (isGenerating || !expanded) setEditingOverride(false);
  }, [isGenerating, expanded]);

  /** Switch the version stack primary entry and update the node source. */
  const handleSwitchPrimary = useCallback(
    (entryId: string) => {
      const stack = element.props.versionStack
      if (!stack) return
      const newStack = switchPrimary(stack, entryId)
      const newPrimary = newStack.entries.find((e) => e.id === entryId)
      const patch: Partial<AudioNodeProps> = { versionStack: newStack }
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
        semanticColor="green"
        onSwitchPrimary={handleSwitchPrimary}
      />
      <div
        className={[
          "relative flex h-full w-full flex-col rounded-lg border box-border",
          "border-ol-divider bg-background text-ol-text-primary",
          isGenerating ? "openloaf-thinking-border openloaf-thinking-border-on border-transparent" : "",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          // 逻辑：展开态不触发预览，因为此时双击可能是编辑面板内的操作。
          if (expanded) return;
          if (isGenerating || isFailed) return;
          handleOpenPreview();
        }}
      >
        {/* Generating overlay */}
        {isGenerating && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {pollingResult.progressText || i18next.t('board:audioNode.generating', { defaultValue: 'Generating...' })}
            </span>
          </div>
        )}

        {/* Failed overlay */}
        {isFailed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ol-red-bg/60 p-4 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-ol-red" />
            <span className="text-xs text-center text-ol-red">
              {primaryEntry.error?.message || i18next.t('board:audioNode.generateFailed', { defaultValue: 'Generation failed' })}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRetry();
              }}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] bg-ol-blue-bg text-ol-blue hover:bg-ol-blue/20 transition-colors duration-150"
            >
              <RefreshCw className="h-3 w-3" />
              {i18next.t('board:audioNode.retry', { defaultValue: 'Retry' })}
            </button>
          </div>
        )}

        {/* Header: icon + name + duration */}
        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ol-amber-bg text-ol-amber">
            <Music className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12px] font-medium leading-tight">
              {displayName}
            </span>
            {durationText ? (
              <span className="text-[10px] text-muted-foreground">
                {durationText}
              </span>
            ) : null}
          </div>
        </div>

        {/* Inline audio player */}
        <div
          className="flex flex-1 items-end px-2.5 pb-2"
          data-board-scroll
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          {audioSrc ? (
            <audio
              controls
              controlsList="nodownload"
              preload="metadata"
              className="h-8 w-full [&::-webkit-media-controls-panel]:bg-neutral-50 dark:[&::-webkit-media-controls-panel]:bg-neutral-800"
              src={audioSrc}
            />
          ) : (
            <div className="flex h-8 w-full items-center justify-center text-[10px] text-muted-foreground">
              {i18next.t("board:audioNode.noSource")}
            </div>
          )}
        </div>
      </div>
      {expanded && panelOverlay ? createPortal(
        <div
          ref={panelRef}
          className="pointer-events-auto absolute"
          data-board-editor
          style={{
            left: element.xywh[0] + element.xywh[2] / 2,
            top: element.xywh[1] + element.xywh[3],
            transformOrigin: 'top center',
          }}
          onPointerDown={event => {
            event.stopPropagation();
          }}
          onContextMenu={event => {
            event.stopPropagation();
          }}
        >
          <AudioAiPanel
            upstream={{
              textContent: upstream?.textList.join('\n'),
              referenceAudioSrc: upstream?.audioList?.[0],
            }}
            onGenerate={handleGenerate}
            readonly={isReadyFromAi && !editingOverride}
            onUnlock={() => setEditingOverride(true)}
          />
        </div>,
        panelOverlay,
      ) : null}
    </NodeFrame>
  );
}

/** Definition for the audio node. */
export const AudioNodeDefinition: CanvasNodeDefinition<AudioNodeProps> = {
  type: 'audio',
  schema: z.object({
    sourcePath: z.string(),
    fileName: z.string().optional(),
    duration: z.number().optional(),
    mimeType: z.string().optional(),
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
    versionStack: z.any().optional(),
  }),
  defaultProps: {
    sourcePath: '',
    fileName: '',
  },
  view: AudioNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: 'anchors',
    minSize: { w: 200, h: 100 },
    maxSize: { w: 480, h: 160 },
  },
  inlinePanel: { width: 420, height: 320 },
  connectorTemplates: () => getAudioNodeConnectorTemplates(),
  toolbar: (ctx) => createAudioToolbarItems(ctx),
};
