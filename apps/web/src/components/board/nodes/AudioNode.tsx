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
  Download,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from "lucide-react";
import i18next from "i18next";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import type { BoardFileContext } from "../board-contracts";
import { useBoardContext } from "../core/BoardProvider";
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { getBoardPreviewEndpoint, getPreviewEndpoint } from "@/lib/image/uri";
import { arrayBufferToBase64 } from "../utils/base64";
import { NodeFrame } from "./NodeFrame";
import { AudioAiPanel } from "../panels/AudioAiPanel";
import type { AudioPanelUpstream, AudioGenerateParams } from "../panels/AudioAiPanel";
import { deriveNode } from "../utils/derive-node";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { submitAudioGenerate } from "../services/audio-generate";
import { saveBoardAssetFile } from "../utils/board-asset";
import {
  createInputSnapshot,
  createGeneratingEntry,
  pushVersion,
  markVersionReady,
  removeFailedEntry,
  getPrimaryEntry,
  getGeneratingEntry,
  switchPrimary,
} from '../engine/version-stack';
import { useMediaTaskPolling } from '../hooks/useMediaTaskPolling';
import { VersionStackOverlay } from './VersionStackOverlay';
import { GeneratingOverlay } from './GeneratingOverlay';
import { AudioWavePlayer } from './AudioWavePlayer';

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
    if (fileContext?.boardId && isBoardRelativePath(props.sourcePath)) {
      href = getBoardPreviewEndpoint(props.sourcePath, {
        boardId: fileContext.boardId,
        projectId: fileContext.projectId,
      })
    } else {
      const parsed = parseScopedProjectPath(props.sourcePath)
      href = getPreviewEndpoint(resolvedPath, {
        projectId: fileContext?.projectId ?? parsed?.projectId,
      })
    }
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
  const isEmpty = !ctx.element.props.sourcePath?.trim()

  // 逻辑：空节点只显示上传和删除按钮。
  if (isEmpty) {
    return [
      {
        id: 'upload',
        label: i18next.t('board:toolbar.upload', { defaultValue: '上传' }),
        icon: <Upload size={14} />,
        onSelect: () => {
          document.dispatchEvent(new CustomEvent('board:trigger-upload', { detail: ctx.element.id }));
        },
      },
      {
        id: 'delete',
        label: i18next.t('board:audioNode.toolbar.delete'),
        icon: <Trash2 size={14} />,
        className: 'text-destructive',
        onSelect: () => ctx.engine.deleteSelection(),
      },
    ]
  }

  const items: ReturnType<typeof Array<any>>  = []

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
      onSelect: () => ctx.engine.deleteSelection(),
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Handle file selection from hidden input — save to board assets and update node. */
  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !fileContext?.boardFolderUri) return;
      e.target.value = '';
      try {
        const relativePath = await saveBoardAssetFile({
          file,
          fallbackName: 'audio.mp3',
          projectId: fileContext.projectId,
          boardFolderUri: fileContext.boardFolderUri,
        });
        onUpdate({ sourcePath: relativePath, fileName: file.name });
      } catch { /* ignore save failure */ }
    },
    [fileContext, onUpdate],
  );

  // 逻辑：监听工具栏上传按钮的自定义事件，触发隐藏文件选择器。
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === element.id) {
        fileInputRef.current?.click();
      }
    };
    document.addEventListener('board:trigger-upload', handler);
    return () => document.removeEventListener('board:trigger-upload', handler);
  }, [element.id]);

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
    if (fileContext?.boardId && isBoardRelativePath(element.props.sourcePath)) {
      return getBoardPreviewEndpoint(element.props.sourcePath, {
        boardId: fileContext.boardId,
        projectId: effectiveProjectId,
      });
    }
    return getPreviewEndpoint(resolvedPath, {
      projectId: effectiveProjectId,
    });
  }, [effectiveProjectId, resolvedPath, fileContext?.boardId, element.props.sourcePath]);

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

  // 逻辑：有生成记录时使用冻结的上游数据，版本切换时自动跟随。
  const effectiveUpstream = useMemo(() => {
    const refs = primaryEntry?.input?.upstreamRefs;
    if (primaryEntry?.status === 'ready' && refs && refs.length > 0) {
      return {
        textContent: refs.filter(r => r.nodeType === 'text').map(r => r.data).join('\n') || undefined,
        referenceAudioSrc: refs.find(r => r.nodeType === 'audio')?.data,
      };
    }
    return {
      textContent: upstream?.textList.join('\n') || undefined,
      referenceAudioSrc: upstream?.audioList?.[0],
    };
  }, [primaryEntry, upstream]);

  const pollingResult = useMediaTaskPolling({
    taskId: generatingEntry?.taskId,
    taskType: 'audio_generate',
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
      },
      [generatingEntry, element.props.versionStack, onUpdate, fileContext?.projectId],
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

  /** Last failure info — stored transiently after removing the failed entry from the version stack. */
  const [lastFailure, setLastFailure] = useState<{
    input: import('../engine/types').InputSnapshot
    error: { code: string; message: string }
  } | null>(null)

  // 逻辑：primaryEntry 变为 failed 时，提取到 lastFailure 并清理 stack。
  useEffect(() => {
    const pe = getPrimaryEntry(element.props.versionStack)
    if (pe?.status === 'failed' && pe.input && pe.error) {
      setLastFailure({ input: pe.input, error: { code: pe.error.code, message: pe.error.message } })
      setDismissedFailure(false)
      const { stack: cleaned } = removeFailedEntry(element.props.versionStack!, pe.id)
      onUpdate({ versionStack: cleaned })
    }
  }, [element.props.versionStack, onUpdate])

  const handleGenerate = useCallback(
    async (params: AudioGenerateParams) => {
      const promptText = (params.inputs?.text as string) ?? ''
      try {
        const result = await submitAudioGenerate(
          {
            feature: params.feature,
            variant: params.variant,
            inputs: params.inputs,
            params: params.params,
            count: params.count,
            seed: params.seed,
          },
          {
            projectId: fileContext?.projectId,
            boardId: fileContext?.boardId,
            sourceNodeId: element.id,
          },
        )

        const snapshot = createInputSnapshot({
          prompt: promptText,
          parameters: {
            feature: params.feature,
            variant: params.variant,
            ...params.params,
          },
          upstreamRefs: upstream?.entries ?? [],
        })
        const entry = createGeneratingEntry(snapshot, result.taskId)
        onUpdate({
          versionStack: pushVersion(element.props.versionStack, entry),
          origin: 'ai-generate',
        })
      } catch (err) {
        console.error('[AudioNode] submitAudioGenerate failed:', err)
        const inputSnapshot = createInputSnapshot({
          prompt: promptText,
          parameters: { feature: params.feature, variant: params.variant, ...params.params },
        })
        const raw = err instanceof Error ? err.message.toLowerCase() : ''
        let msgKey = 'board:polling.errorGeneric'
        if (raw.includes('insufficient') || raw.includes('balance') || raw.includes('credit') || raw.includes('quota') || raw.includes('402')) {
          msgKey = 'board:polling.errorInsufficientBalance'
        } else if (raw.includes('network') || raw.includes('fetch') || raw.includes('econnrefused')) {
          msgKey = 'board:polling.errorNetwork'
        } else if (raw.includes('401') || raw.includes('403') || raw.includes('unauthorized') || raw.includes('access denied')) {
          msgKey = 'board:polling.errorAuth'
        } else if (raw.includes('429') || raw.includes('rate') || raw.includes('too many')) {
          msgKey = 'board:polling.errorRateLimit'
        } else if (raw.includes('500') || raw.includes('502') || raw.includes('503')) {
          msgKey = 'board:polling.errorServer'
        }
        setLastFailure({
          input: inputSnapshot,
          error: { code: 'SUBMIT_FAILED', message: i18next.t(msgKey, { defaultValue: '生成失败，请重试' }) },
        })
      }
    },
    [element.id, element.props.versionStack, element.props.aiConfig, fileContext?.projectId, fileContext?.boardId, onUpdate],
  )

  /** Retry generation using the last failure's input snapshot. */
  const handleRetry = useCallback(() => {
    if (!lastFailure?.input) return
    const input = lastFailure.input
    handleGenerate({
      feature: (input.parameters?.feature as string) ?? 'tts',
      variant: (input.parameters?.variant as string) ?? 'OL-TT-001',
      inputs: { text: input.prompt },
      params: {
        ...(input.parameters?.voice ? { voice: input.parameters.voice } : {}),
      },
    })
  }, [lastFailure, handleGenerate])

  /** Generate into a new derived audio node with the same params. */
  const handleGenerateNewNode = useCallback(
    async (params: AudioGenerateParams) => {
      const promptText = (params.inputs?.text as string) ?? ''
      let newNodeId: string | null = null
      try {
        newNodeId = deriveNode({
          engine,
          sourceNodeId: element.id,
          targetType: 'audio',
          targetProps: { origin: 'ai-generate' },
        })
        if (!newNodeId) return

        // 逻辑：先写入 generating 状态，让新节点立即显示 loading。
        const snapshot = createInputSnapshot({
          prompt: promptText,
          parameters: {
            feature: params.feature,
            variant: params.variant,
            ...params.params,
          },
        })
        const pendingEntry = createGeneratingEntry(snapshot, '')
        engine.doc.updateNodeProps(newNodeId, {
          versionStack: pushVersion(undefined, pendingEntry),
          origin: 'ai-generate',
          aiConfig: { feature: params.feature, prompt: promptText },
        })

        const result = await submitAudioGenerate(
          {
            feature: params.feature,
            variant: params.variant,
            inputs: params.inputs,
            params: params.params,
            count: params.count,
            seed: params.seed,
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
        console.error('[AudioNode] new node generation failed:', err)
        if (newNodeId) {
          const raw = err instanceof Error ? err.message.toLowerCase() : ''
          let msgKey = 'board:polling.errorGeneric'
          if (raw.includes('insufficient') || raw.includes('balance') || raw.includes('credit') || raw.includes('402')) {
            msgKey = 'board:polling.errorInsufficientBalance'
          } else if (raw.includes('401') || raw.includes('403') || raw.includes('unauthorized') || raw.includes('access denied')) {
            msgKey = 'board:polling.errorAuth'
          } else if (raw.includes('500') || raw.includes('502') || raw.includes('503')) {
            msgKey = 'board:polling.errorServer'
          }
          const msg = i18next.t(msgKey, { defaultValue: '生成失败，请重试' })
          const snapshot = createInputSnapshot({ prompt: promptText, parameters: { feature: params.feature } })
          const failedEntry: import('../engine/types').VersionStackEntry = {
            id: `fail-${Date.now()}`, status: 'failed', input: snapshot, createdAt: Date.now(),
            error: { code: 'SUBMIT_FAILED', message: msg },
          }
          engine.doc.updateNodeProps(newNodeId, {
            versionStack: pushVersion(undefined, failedEntry),
            aiConfig: { feature: params.feature, prompt: promptText },
          })
        }
      }
    },
    [engine, element.id, fileContext?.projectId, fileContext?.boardId],
  )

  const isGenerating = primaryEntry?.status === 'generating'
  const isReadyFromAi = primaryEntry?.status === 'ready' && element.props.origin === 'ai-generate'
  const [dismissedFailure, setDismissedFailure] = useState(false)
  const isFailed = lastFailure !== null

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
  // 逻辑：新的失败状态出现时重置 dismiss。
  useEffect(() => {
    if (lastFailure) setDismissedFailure(false);
  }, [lastFailure]);
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
          "relative flex h-full w-full flex-col rounded-3xl border box-border",
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
          handleOpenPreview();
        }}
      >
        {/* Generating overlay */}
        {isGenerating && (
          <GeneratingOverlay
            startedAt={pollingResult.startedAt}
            estimatedSeconds={30}
            serverProgress={pollingResult.progress}
            color="green"
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
                ? i18next.t('board:audioNode.cancelled', { defaultValue: '已取消' })
                : (lastFailure?.error?.message || i18next.t('board:audioNode.generateFailed', { defaultValue: 'Generation failed' }))}
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
                  ? i18next.t('board:audioNode.resend', { defaultValue: '重新发送' })
                  : i18next.t('board:audioNode.retry', { defaultValue: 'Retry' })}
              </button>
              {audioSrc && (
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

        {/* Audio waveform player — fills entire node */}
        <div
          className="flex flex-1 min-h-0"
          data-board-scroll
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          {audioSrc ? (
            <AudioWavePlayer src={audioSrc} />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-ol-divider bg-ol-surface-muted">
              <div className="flex flex-col items-center gap-2 text-muted-foreground/40 px-4">
                <Music size={36} strokeWidth={1.2} />
                <span className="text-xs text-center leading-relaxed whitespace-pre-line">
                  {i18next.t('board:audioNode.emptyHint', { defaultValue: '双击上传音频\n或选中后 AI 生成' })}
                </span>
              </div>
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
              textContent: effectiveUpstream.textContent,
              referenceAudioSrc: effectiveUpstream.referenceAudioSrc,
            }}
            onGenerate={handleGenerate}
            onGenerateNewNode={handleGenerateNewNode}
            hasResource={Boolean(element.props.sourcePath)}
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
        accept="audio/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
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
    sourcePath: '',
    fileName: '',
  },
  view: AudioNodeView,
  capabilities: {
    resizable: false,
    rotatable: false,
    connectable: 'anchors',
    minSize: { w: 320, h: 120 },
    maxSize: { w: 320, h: 120 },
  },
  inlinePanel: { width: 420, height: 320 },
  connectorTemplates: () => getAudioNodeConnectorTemplates(),
  toolbar: (ctx) => createAudioToolbarItems(ctx),
};
