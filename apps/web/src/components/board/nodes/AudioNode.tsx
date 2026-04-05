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
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Mic,
  Music,
  Play,
  Square,
  Upload,
} from "lucide-react";
import i18next from "i18next";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import type { BoardFileContext } from "../board-contracts";
import { BOARD_TOOLBAR_ITEM_DEFAULT } from "../ui/board-style-system";
import { useBoardContext } from "../core/BoardProvider";
import {
  formatScopedProjectPath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  ProjectFilePickerDialog,
  type ProjectFilePickerSelection,
} from "@/components/project/filesystem/components/ProjectFilePickerDialog";
import { AUDIO_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
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
import { AudioWavePlayer } from './AudioWavePlayer';
import { useCancelGeneration } from './shared/useCancelGeneration';
import { useAudioRecorder } from './shared/useAudioRecorder';

/** Format elapsed seconds as mm:ss. */
function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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

/** Build the props patch for switching audio version stack primary. */
function buildAudioSwitchPrimaryPatch(
  stack: import("../engine/types").VersionStack,
  entryId: string,
): Partial<AudioNodeProps> {
  const newStack = switchPrimary(stack, entryId)
  const newPrimary = newStack.entries.find((e) => e.id === entryId)
  const patch: Partial<AudioNodeProps> = { versionStack: newStack }
  if (newPrimary?.output?.urls[0]) {
    patch.sourcePath = newPrimary.output.urls[0]
  }
  return patch
}

/** Build toolbar items for audio nodes. */
function createAudioToolbarItems(
  ctx: CanvasToolbarContext<AudioNodeProps>,
) {
  const isEmpty = !ctx.element.props.sourcePath?.trim()

  // 逻辑：空节点的自定义工具保留上传和录音，删除走右侧通用工具组。
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
        id: 'record',
        label: i18next.t('board:audioNode.toolbar.record', { defaultValue: '录音' }),
        icon: <Mic size={14} />,
        className: BOARD_TOOLBAR_ITEM_DEFAULT,
        onSelect: () => {
          document.dispatchEvent(new CustomEvent('board:trigger-record', { detail: ctx.element.id }));
        },
      },
    ]
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
          ctx.updateNodeProps(buildAudioSwitchPrimaryPatch(stack, stack.entries[currentIdx - 1].id))
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
          ctx.updateNodeProps(buildAudioSwitchPrimaryPatch(stack, stack.entries[currentIdx + 1].id))
        },
      },
    )
  }

  items.push(
    {
      id: 'play',
      label: i18next.t('board:audioNode.toolbar.play'),
      icon: <Play size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
    {
      id: 'download',
      label: i18next.t('board:audioNode.toolbar.download'),
      icon: <Download size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () =>
        void downloadAudioFile(ctx.element.props, ctx.fileContext),
    },
  )

  return items
}

/** Render an audio node card with inline playback. */
export function AudioNodeView({
  element,
  selected,
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
    skipTriggerEvent: true,
  });
  const { panelRef } = useInlinePanelSync({ engine, xywh: element.xywh, expanded });

  const [pickerOpen, setPickerOpen] = useState(false);

  /** Open the project file picker dialog to select an audio file. */
  const requestPickAudio = useCallback(() => {
    setPickerOpen(true);
  }, []);

  // ── Audio recording ──
  const handleRecordingSaved = useCallback(
    (relativePath: string, fileName: string, _duration: number) => {
      onUpdate({ sourcePath: relativePath, fileName, origin: 'user' as const });
    },
    [onUpdate],
  );
  const recorder = useAudioRecorder({ fileContext, onSaved: handleRecordingSaved });

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
        requestPickAudio();
      }
    };
    document.addEventListener('board:trigger-upload', handler);
    return () => document.removeEventListener('board:trigger-upload', handler);
  }, [element.id, requestPickAudio]);

  // 逻辑：监听工具栏录音按钮的自定义事件，开始/停止录音。
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === element.id) {
        if (recorder.state === 'recording') {
          recorder.stopRecording();
        } else {
          void recorder.startRecording();
        }
      }
    };
    document.addEventListener('board:trigger-record', handler);
    return () => document.removeEventListener('board:trigger-record', handler);
  }, [element.id, recorder]);

  const projectRelativePath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext),
    [element.props.sourcePath, fileContext],
  );
  const resolvedPath = projectRelativePath || element.props.sourcePath;
  const displayName =
    element.props.fileName || resolvedPath.split("/").pop() || i18next.t('board:nodeLabel.audio');
  const boardId = fileContext?.boardId ?? "";

  // 逻辑：从 @[[proj_xxx]/path] 格式中提取 projectId 作为 fallback。
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
          || element.props.aiConfig?.lastGeneration?.prompt?.slice(0, 30).trim()
        onUpdate({
          versionStack: markVersionReady(stack, generatingEntry.id, { urls: resultUrls }),
          sourcePath: scopedPath,
          fileName: promptLabel || savedPath.split('/').pop() || undefined,
          aiConfig: {
            ...(element.props.aiConfig ?? {}),
            lastGeneration: {
              ...(element.props.aiConfig?.lastGeneration ?? { prompt: '', feature: '', variant: '', generatedAt: 0 }),
              prompt: snapshot?.prompt || element.props.aiConfig?.lastGeneration?.prompt || '',
            },
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
      return {
        fileName: promptText.slice(0, 30).trim() || undefined,
        aiConfig: {
          lastUsed: { feature: params.feature, variant: params.variant },
          lastGeneration: {
            prompt: promptText,
            feature: params.feature,
            variant: params.variant,
            generatedAt: Date.now(),
          },
        },
      }
    },
    [],
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
        engine={engine}
        selected={selected}
        compact
      />
      <div
        className={[
          "relative flex h-full w-full flex-col rounded-3xl box-border",
          "bg-background text-ol-text-primary",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (isGenerating || isFailed) return;
          // 逻辑：空节点双击打开文件选择器对话框，有内容时双击打开预览。
          if (!element.props.sourcePath?.trim()) {
            requestPickAudio();
            return;
          }
          if (expanded) return;
          handleOpenPreview();
        }}
      >
        {/* Generating overlay */}
        {isGenerating && (
          <GeneratingOverlay
            startedAt={generatingEntry?.createdAt ?? pollingResult.startedAt}
            estimatedSeconds={30}
            serverProgress={pollingResult.progress}
            color="blue"
            onCancel={handleCancelGeneration}
            cancelling={cancellingGeneration}
            compact
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
            <div className="flex h-full w-full items-center rounded-3xl border border-dashed border-ol-divider bg-ol-surface-muted">
              {/* 左侧：录音按钮区域 */}
              <div className="flex flex-col items-center justify-center gap-1.5 pl-5 pr-4">
                {recorder.state === 'recording' ? (
                  <>
                    <button
                      type="button"
                      className="flex items-center justify-center w-11 h-11 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors duration-150"
                      onClick={() => recorder.stopRecording()}
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                    <span className="text-[10px] text-red-500 tabular-nums font-medium">
                      {formatRecordingTime(recorder.elapsed)}
                    </span>
                  </>
                ) : recorder.state === 'saving' ? (
                  <>
                    <div className="flex items-center justify-center w-11 h-11 rounded-full bg-ol-surface-hover animate-pulse">
                      <Mic size={18} className="text-muted-foreground/60" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">
                      {i18next.t('board:audioNode.saving', { defaultValue: '保存中' })}
                    </span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex items-center justify-center w-11 h-11 rounded-full border border-ol-divider text-muted-foreground/40 hover:text-muted-foreground hover:border-muted-foreground/40 hover:bg-ol-surface-hover transition-colors duration-150"
                      onClick={() => void recorder.startRecording()}
                    >
                      <Mic size={18} />
                    </button>
                    <span className="text-[10px] text-muted-foreground/30">
                      {i18next.t('board:audioNode.startRecord', { defaultValue: '录音' })}
                    </span>
                  </>
                )}
              </div>
              {/* 分隔线 */}
              <div className="w-px self-stretch my-5 bg-ol-divider/60" />
              {/* 右侧：上传 / AI 提示区域 */}
              <div className="flex flex-1 flex-col items-center justify-center gap-1 min-w-0">
                <Music size={28} strokeWidth={1.2} className="text-muted-foreground/30" />
                <span className="text-[11px] text-muted-foreground/40 text-center leading-relaxed whitespace-pre-line">
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
          element={element}
          onUpdate={onUpdate}
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
      <ProjectFilePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={i18next.t('board:audioNode.pickTitle', { defaultValue: '选择音频文件' })}
        filterHint={i18next.t('board:audioNode.pickHint', { defaultValue: '支持 mp3、wav、flac、ogg、m4a、aac' })}
        allowedExtensions={AUDIO_EXTS}
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
