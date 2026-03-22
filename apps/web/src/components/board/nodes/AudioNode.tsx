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
import { useCallback, useEffect, useMemo, useRef } from "react";
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
import type { BoardFileContext, AiGenerateConfig } from "../board-contracts";
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
import { useFileUploadHandler } from './shared/useFileUploadHandler';
import { useInlinePanelSync, PANEL_GAP_PX } from './shared/useInlinePanelSync';
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
import { AudioWavePlayer } from './AudioWavePlayer';

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
  const { fileInputRef, handleFileInputChange } = useFileUploadHandler<AudioNodeProps>({
    elementId: element.id,
    fileContext,
    onUpdate,
    fallbackName: 'audio.mp3',
  });
  const { panelRef } = useInlinePanelSync({ engine, xywh: element.xywh, expanded });

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
  const { primaryEntry, generatingEntry, isGenerating } = useVersionStackState(element.props.versionStack)

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
        const snapshot = generatingEntry.input
        const promptLabel = snapshot?.prompt?.slice(0, 30).trim()
          || element.props.aiConfig?.prompt?.slice(0, 30).trim()
        onUpdate({
          versionStack: markVersionReady(stack, generatingEntry.id, { urls: resultUrls }),
          sourcePath: scopedPath,
          fileName: promptLabel || savedPath.split('/').pop() || undefined,
          aiConfig: {
            ...(element.props.aiConfig ?? {} as AiGenerateConfig),
            prompt: snapshot?.prompt || element.props.aiConfig?.prompt || '',
          },
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

  const { lastFailure, setLastFailure, dismissedFailure, setDismissedFailure, isFailed } = useVersionStackFailureState(element.props.versionStack, onUpdate)

  const handleGenerate = useCallback(
    async (params: AudioGenerateParams) => {
      const promptText = (params.inputs?.text as string) ?? ''
      // 逻辑：先写入 generating 状态（无 taskId），让节点立即显示 loading，再等 API 返回后补上 taskId。
      const inputSnapshot = createInputSnapshot({
        prompt: promptText,
        parameters: {
          feature: params.feature,
          variant: params.variant,
          ...params.params,
        },
        upstreamRefs: upstream?.entries ?? [],
      })
      const pendingEntry = createGeneratingEntry(inputSnapshot, '')
      const promptLabel = promptText.slice(0, 30).trim() || undefined
      onUpdate({
        versionStack: pushVersion(element.props.versionStack, pendingEntry),
        origin: 'ai-generate',
        fileName: promptLabel,
        aiConfig: {
          feature: params.feature as AiGenerateConfig['feature'],
          prompt: promptText,
          paramsCache: element.props.aiConfig?.paramsCache,
        },
      })

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

        // 逻辑：API 返回后补上 taskId，轮询开始。
        const currentStack = element.props.versionStack
        const updatedEntries = (currentStack?.entries ?? [pendingEntry]).map(e =>
          e.id === pendingEntry.id ? { ...e, taskId: result.taskId } : e,
        )
        onUpdate({
          versionStack: {
            entries: updatedEntries,
            primaryId: pendingEntry.id,
          },
        })
      } catch (err) {
        console.error('[AudioNode] submitAudioGenerate failed:', err)
        // 逻辑：提交失败时从 stack 中移除 pending entry，设置 lastFailure 显示错误浮层。
        const msgKey = mapErrorToMessageKey(err)
        const { stack: cleaned } = removeFailedEntry(
          pushVersion(element.props.versionStack, pendingEntry),
          pendingEntry.id,
        )
        onUpdate({ versionStack: cleaned })
        setLastFailure({
          input: inputSnapshot,
          error: { code: 'SUBMIT_FAILED', message: i18next.t(msgKey, { defaultValue: '生成失败，请重试' }) },
        })
      }
    },
    [element.id, element.props.versionStack, fileContext?.projectId, fileContext?.boardId, upstream, onUpdate],
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
          const msgKey = mapErrorToMessageKey(err)
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
        {isFailed && (() => {
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
          ) : !isGenerating ? (
            <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-ol-divider bg-ol-surface-muted">
              <div className="flex flex-col items-center gap-2 text-muted-foreground/40 px-4">
                <Music size={36} strokeWidth={1.2} />
                <span className="text-xs text-center leading-relaxed whitespace-pre-line">
                  {i18next.t('board:audioNode.emptyHint', { defaultValue: '双击上传音频\n或选中后 AI 生成' })}
                </span>
              </div>
            </div>
          ) : null}
        </div>
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
          <AudioAiPanel
            upstream={{
              textContent: effectiveUpstream.textContent,
              referenceAudioSrc: effectiveUpstream.referenceAudioSrc,
              boardId: fileContext?.boardId,
              projectId: fileContext?.projectId,
              boardFolderUri: fileContext?.boardFolderUri,
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
