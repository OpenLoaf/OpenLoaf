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
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import {
  Download,
  Music,
  Play,
  Upload,
} from "lucide-react";
import i18next from "i18next";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import type { BoardFileContext, AiGenerateConfig } from "../board-contracts";
import { useBoardContext } from "../core/BoardProvider";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { resolveProjectRelativePath, resolveMediaSource } from './shared/resolveMediaSource';
import { downloadMediaFile } from './shared/downloadMediaFile';
import { NodeFrame } from "./NodeFrame";
import { AudioAiPanel } from "../panels/AudioAiPanel";
import type { AudioGenerateParams } from "../panels/AudioAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { submitAudioGenerate } from "../services/audio-generate";
import { useFileUploadHandler } from './shared/useFileUploadHandler';
import { useInlinePanelSync } from './shared/useInlinePanelSync';
import { FailureOverlay } from './shared/FailureOverlay';
import { InlinePanelPortal } from './shared/InlinePanelPortal';
import { useEffectiveUpstream } from './shared/useEffectiveUpstream';
import { useMediaGeneration, type SubmitOptions } from './shared/useMediaGeneration';
import {
  createInputSnapshot,
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
import { AudioWavePlayer } from './AudioWavePlayer';
import { useCancelGeneration } from './shared/useCancelGeneration';

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

/** Trigger a download for the audio file. */
async function downloadAudioFile(
  props: AudioNodeProps,
  fileContext?: BoardFileContext,
) {
  const sourcePath = props.sourcePath?.trim()
  if (!sourcePath) return
  const fileName = props.fileName || 'audio.mp3'
  await downloadMediaFile({ src: sourcePath, fileName, fileContext, filterLabel: 'Audio' })
}

/** Build toolbar items for audio nodes. */
function createAudioToolbarItems(
  ctx: CanvasToolbarContext<AudioNodeProps>,
) {
  const isEmpty = !ctx.element.props.sourcePath?.trim()

  // 逻辑：空节点的自定义工具仅保留上传，删除走右侧通用工具组。
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
  )

  return items
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

  const audioSrc = useMemo(
    () => resolveMediaSource(element.props.sourcePath, fileContext) ?? '',
    [element.props.sourcePath, fileContext],
  );

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
  const { handleCancel: handleCancelGeneration, cancelling: cancellingGeneration } = useCancelGeneration(generatingEntry?.taskId);

  // 逻辑：有生成记录时使用冻结的上游数据，版本切换时自动跟随。
  const effectiveUpstream = useEffectiveUpstream(primaryEntry, upstream, fileContext);

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

  // ── Audio-specific callbacks for useMediaGeneration ──
  const buildSnapshot = useCallback(
    (params: AudioGenerateParams, up: UpstreamData | null) => {
      const promptText = (params.inputs?.text as string) ?? ''
      return createInputSnapshot({
        prompt: promptText,
        parameters: {
          feature: params.feature,
          variant: params.variant,
          ...params.params,
        },
        upstreamRefs: up?.entries ?? [],
      })
    },
    [],
  )
  const buildGeneratePatch = useCallback(
    (params: AudioGenerateParams) => {
      const promptText = (params.inputs?.text as string) ?? ''
      const promptLabel = promptText.slice(0, 30).trim() || undefined
      return {
        fileName: promptLabel,
        aiConfig: {
          feature: params.feature as AiGenerateConfig['feature'],
          prompt: promptText,
          paramsCache: element.props.aiConfig?.paramsCache,
        },
      }
    },
    [element.props.aiConfig?.paramsCache],
  )
  const audioSubmitGenerate = useCallback(
    (params: AudioGenerateParams, options: SubmitOptions) =>
      submitAudioGenerate(
        {
          feature: params.feature,
          variant: params.variant,
          inputs: params.inputs,
          params: params.params,
          count: params.count,
          seed: params.seed,
        },
        options,
      ),
    [],
  )
  const buildRetryParams = useCallback(
    (input: InputSnapshot): AudioGenerateParams => ({
      feature: (input.parameters?.feature as string) ?? 'tts',
      variant: (input.parameters?.variant as string) ?? 'OL-TT-001',
      inputs: { text: input.prompt },
      params: {
        ...(input.parameters?.voice ? { voice: input.parameters.voice } : {}),
      },
    }),
    [],
  )

  const {
    handleGenerate,
    handleRetryGenerate: handleRetry,
    handleGenerateNewNode,
  } = useMediaGeneration<AudioGenerateParams>({
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
    submitGenerate: audioSubmitGenerate,
    buildRetryParams,
    deriveNodeType: 'audio',
  })

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
            onCancel={handleCancelGeneration}
            cancelling={cancellingGeneration}
          />
        )}

        {/* Failed / Cancelled overlay */}
        <FailureOverlay
          visible={isFailed}
          isCancelled={lastFailure?.error?.code === 'CANCELLED'}
          message={lastFailure?.error?.message || i18next.t('board:audioNode.generateFailed', { defaultValue: 'Generation failed' })}
          cancelledKey="board:audioNode.cancelled"
          retryKey="board:audioNode.retry"
          resendKey="board:audioNode.resend"
          onRetry={handleRetry}
          canDismiss={Boolean(audioSrc)}
          onDismiss={() => setDismissedFailure(true)}
        />

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
      <InlinePanelPortal
        expanded={expanded}
        panelOverlay={panelOverlay}
        panelRef={panelRef}
        xywh={element.xywh}
        engine={engine}
      >
        <AudioAiPanel
          upstream={{
            textContent: effectiveUpstream.text,
            referenceAudioSrc: effectiveUpstream.audioUrl,
            boardId: fileContext?.boardId,
            projectId: fileContext?.projectId,
            boardFolderUri: fileContext?.boardFolderUri,
          }}
          rawUpstream={upstream}
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNewNode}
          hasResource={Boolean(element.props.sourcePath)}
          readonly={(isReadyFromAi || !!generatingEntry) && !editingOverride}
          editing={editingOverride}
          onUnlock={() => setEditingOverride(true)}
          onCancelEdit={() => setEditingOverride(false)}
        />
      </InlinePanelPortal>
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
  outputTypes: ['audio'],
  toolbar: (ctx) => createAudioToolbarItems(ctx),
};
