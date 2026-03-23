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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  ImageOff,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useBoardContext } from "../core/BoardProvider";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { ImageNodeDetail } from "./ImageNodeDetail";
import { NodeFrame } from "./NodeFrame";
import type { BoardFileContext } from "../core/BoardProvider";
import { isBoardRelativePath } from "../core/boardFilePath";
import { resolveProjectRelativePath, resolveMediaSource } from './shared/resolveMediaSource';
import { downloadMediaFile } from './shared/downloadMediaFile';
import {
  formatScopedProjectPath,
  isProjectAbsolutePath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  ProjectFilePickerDialog,
  type ProjectFilePickerSelection,
} from "@/components/project/filesystem/components/ProjectFilePickerDialog";
import { IMAGE_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { IMAGE_NODE_MAX_SIZE, IMAGE_NODE_MIN_SIZE, IMAGE_NODE_DEFAULT_MAX_SIZE } from "./node-config";
import { saveBoardAssetFile } from "../utils/board-asset";
import i18next from "i18next";
import {
  BOARD_TOOLBAR_ITEM_DEFAULT,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { ImageAiPanel, type ImageGenerateParams } from "../panels/ImageAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { submitImageGenerate } from "../services/image-generate";
import { submitUpscale } from "../services/upscale-generate";
import { MaskPaintOverlay, type MaskPaintHandle } from "./MaskPaintOverlay";
import { ImageAdjustOverlay, type ImageAdjustResult } from "./ImageAdjustOverlay";
import {
  createInputSnapshot,
  markVersionReady,
  removeFailedEntry,
  getPrimaryEntry,
  switchPrimary,
} from "../engine/version-stack";
import {
  useVersionStackState,
  useVersionStackFailureState,
  useVersionStackEditingOverride,
} from "../hooks/useVersionStack";
import { useMediaTaskPolling } from "../hooks/useMediaTaskPolling";
import { VersionStackOverlay, STACK_CARD_SCALE } from "./VersionStackOverlay";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { motion, AnimatePresence } from "framer-motion";
import { useInlinePanelSync } from './shared/useInlinePanelSync';
import { useEffectiveUpstream } from './shared/useEffectiveUpstream';
import { FailureOverlay } from './shared/FailureOverlay';
import { InlinePanelPortal } from './shared/InlinePanelPortal';
import { useMediaGeneration, type SubmitOptions } from './shared/useMediaGeneration';

/** Max bytes for image node preview fetches. */
const IMAGE_NODE_PREVIEW_MAX_BYTES = 100 * 1024;

/** Render a neutral gray loading skeleton for image nodes. */
function ImageNodeSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-muted/60">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
    </div>
  );
}

export type ImageNodeProps = {
  /** Compressed preview for rendering on the canvas. */
  previewSrc: string;
  /** Original image uri used for download/copy actions. */
  originalSrc: string;
  /** MIME type for the original image. */
  mimeType: string;
  /** Suggested file name for downloads. */
  fileName: string;
  /** Original image width in pixels. */
  naturalWidth: number;
  /** Original image height in pixels. */
  naturalHeight: number;
  /** Whether the node is waiting on a transcode job. */
  isTranscoding?: boolean;
  /** Label shown while the image is transcoding. */
  transcodingLabel?: string;
  /** Transcoding task id for async updates. */
  transcodingId?: string;
  /** How the image was created. Defaults to 'upload'. */
  origin?: import("../board-contracts").NodeOrigin;
  /** AI generation config. Present only when origin is 'ai-generate'. */
  aiConfig?: import("../board-contracts").AiGenerateConfig;
  /** Version stack tracking AI generation history. */
  versionStack?: import("../engine/types").VersionStack;
  /** Original untransformed image URI — backed up on first image adjust. */
  rawOriginalSrc?: string;
  /** Image adjustment state preserved for re-editing. */
  imageAdjust?: {
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    cropRect?: { x: number; y: number; width: number; height: number };
    aspectRatio?: string;
  };
};

/** Trigger a download for the original image. */
async function downloadOriginalImage(
  props: ImageNodeProps,
  fileContext?: BoardFileContext,
) {
  const rawName = props.fileName || 'image.png'
  const fileName = rawName.includes('.') ? rawName : `${rawName}.png`
  await downloadMediaFile({ src: props.originalSrc, fileName, fileContext, filterLabel: 'Image' })
}

/** Build the props patch for switching version stack primary. */
function buildSwitchPrimaryPatch(
  stack: import("../engine/types").VersionStack,
  entryId: string,
  projectId?: string,
): Partial<ImageNodeProps> {
  const newStack = switchPrimary(stack, entryId)
  const newPrimary = newStack.entries.find((e) => e.id === entryId)
  const patch: Partial<ImageNodeProps> = { versionStack: newStack }
  if (newPrimary?.output?.urls[0]) {
    const raw = newPrimary.output.urls[0]
    const scopedPath = parseScopedProjectPath(raw)
      ? raw
      : projectId
        ? formatScopedProjectPath({
            projectId,
            currentProjectId: projectId,
            relativePath: normalizeProjectRelativePath(raw),
            includeAt: true,
          })
        : raw
    patch.previewSrc = ''
    patch.originalSrc = scopedPath
    patch.fileName = raw.split('/').pop() || 'image.png'
    patch.naturalWidth = 1
    patch.naturalHeight = 1
  }
  return patch
}

/** Build toolbar items for image nodes. */
function createImageToolbarItems(
  ctx: CanvasToolbarContext<ImageNodeProps>,
) {
  const isEmpty = !ctx.element.props.originalSrc && !ctx.element.props.previewSrc

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
        id: "delete",
        label: i18next.t('board:board.delete'),
        icon: <Trash2 size={14} />,
        className: BOARD_TOOLBAR_ITEM_RED,
        onSelect: () => ctx.engine.deleteSelection(),
      },
    ]
  }

  const items: import("../engine/types").CanvasToolbarItem[] = []

  // 逻辑：版本堆叠 > 1 时在工具栏添加上一张/下一张导航按钮。
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
          ctx.updateNodeProps(buildSwitchPrimaryPatch(stack, stack.entries[currentIdx - 1].id, ctx.fileContext?.projectId))
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
          ctx.updateNodeProps(buildSwitchPrimaryPatch(stack, stack.entries[currentIdx + 1].id, ctx.fileContext?.projectId))
        },
      },
    )
  }

  items.push(
    {
      id: 'image-adjust',
      label: i18next.t('board:imageNode.toolbar.adjust', { defaultValue: '调整' }),
      icon: <Crop size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => {
        document.dispatchEvent(new CustomEvent('board:trigger-image-adjust', { detail: ctx.element.id }));
      },
    },
    {
      id: "download",
      label: i18next.t('board:imageNode.toolbar.download'),
      icon: <Download size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => void downloadOriginalImage(ctx.element.props, ctx.fileContext),
    },
    {
      id: "delete",
      label: i18next.t('board:board.delete'),
      icon: <Trash2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: () => ctx.engine.deleteSelection(),
    },
  )

  return items
}

// ---------------------------------------------------------------------------
// Connector templates
// ---------------------------------------------------------------------------

/** Render an image node using a compressed preview bitmap. */
export function ImageNodeView({
  element,
  selected,
  expanded,
  onUpdate,
}: CanvasNodeViewProps<ImageNodeProps>) {
  /** Guard against repeated hydration requests. */
  const hydrationRef = useRef<string | null>(null);
  const { actions, engine, fileContext } = useBoardContext();
  const upstream = useUpstreamData(engine, expanded ? element.id : null);
  const panelOverlay = usePanelOverlay();
  const { panelRef } = useInlinePanelSync({ engine, xywh: element.xywh, expanded });
  const previewSrc =
    element.props.previewSrc ||
    resolveMediaSource(element.props.originalSrc, fileContext);
  const hasPreview = Boolean(previewSrc);
  const isTranscoding = element.props.isTranscoding === true;
  const transcodingLabel = element.props.transcodingLabel || i18next.t('board:loading.transcoding');
  const projectRelativeOriginal = resolveProjectRelativePath(
    element.props.originalSrc,
    fileContext
  );
  const resolvedOriginal = projectRelativeOriginal || element.props.originalSrc;
  /** Local flag for displaying the inline detail panel. */
  const [showDetail, setShowDetail] = useState(false);
  /** Root element ref for outside click detection. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Whether the preview fetch is still in flight. */
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  /** Whether the img element is still loading. */
  const [isImageLoading, setIsImageLoading] = useState(() => Boolean(previewSrc));
  /** Whether the img element failed to load. */
  const [isImageError, setIsImageError] = useState(false);
  const lastPreviewRef = useRef<string>("");
  /** Whether the image picker dialog is open for replacing a broken image. */
  const [replacePickerOpen, setReplacePickerOpen] = useState(false);
  /** Hidden file input for replacing a broken image from computer. */
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const imageAcceptAttr = useMemo(
    () => Array.from(IMAGE_EXTS).map((ext) => `.${ext}`).join(","),
    [],
  );
  /** Whether the node or canvas is locked. */
  const isLocked = engine.isLocked() || element.locked === true;
  const { lastFailure, setLastFailure, dismissedFailure, setDismissedFailure } = useVersionStackFailureState(element.props.versionStack, onUpdate);
  /** Whether the image adjust overlay is active. */
  const [adjusting, setAdjusting] = useState(false);
  /** Whether inline mask painting is active (inpaint/erase mode). */
  const [maskPainting, setMaskPainting] = useState(false);
  /** Current mask paint result from the overlay. */
  const [maskResult, setMaskResult] = useState<import('./MaskPaintOverlay').MaskPaintResult | null>(null);
  /** Ref to mask paint overlay for exposing brush controls to the panel. */
  const maskPaintRef = useRef<MaskPaintHandle>(null);
  /** Brush size state synced from overlay — drives the panel slider. */
  const [brushSize, setBrushSize] = useState(40);
  // 逻辑：面板关闭时自动退出遮罩编辑模式。
  useEffect(() => {
    if (!expanded) setMaskPainting(false);
  }, [expanded]);

  // ---------------------------------------------------------------------------
  // Version stack state + polling
  // ---------------------------------------------------------------------------

  const { primaryEntry, generatingEntry, isGenerating: isGeneratingVersion } = useVersionStackState(element.props.versionStack);

  // 逻辑：有生成记录（ready）且存储了 upstreamRefs 时，使用冻结的上游数据；
  // 版本切换时 primaryEntry 变化，插槽内容自动跟随。
  const effectiveUpstream = useEffectiveUpstream(primaryEntry, upstream, fileContext);

  const pollingResult = useMediaTaskPolling({
    taskId: generatingEntry?.taskId,
    taskType: 'image_generate',
    projectId: fileContext?.projectId,
    boardId: fileContext?.boardId,
    enabled: Boolean(generatingEntry),
    onSuccess: useCallback(
      (resultUrls: string[]) => {
        if (!generatingEntry) return;
        const stack = element.props.versionStack;
        if (!stack) return;
        const savedPath = resultUrls[0]?.trim() || '';
        const scopedPath = (() => {
          if (!savedPath) return '';
          if (parseScopedProjectPath(savedPath)) return savedPath;
          const pid = fileContext?.projectId;
          if (!pid) return savedPath;
          const relative = normalizeProjectRelativePath(savedPath);
          return formatScopedProjectPath({
            projectId: pid,
            currentProjectId: pid,
            relativePath: relative,
            includeAt: true,
          });
        })();
        const generatedFileName = savedPath.split('/').pop() || 'image.png';
        // 从生成快照恢复 aiConfig，确保 prompt 等元数据不丢失
        const snapshot = generatingEntry.input;
        const refreshedAiConfig: import("../board-contracts").AiGenerateConfig = {
          ...(element.props.aiConfig ?? {} as import("../board-contracts").AiGenerateConfig),
          prompt: snapshot?.prompt || element.props.aiConfig?.prompt || '',
        };
        onUpdate({
          versionStack: markVersionReady(stack, generatingEntry.id, { urls: resultUrls }),
          previewSrc: '',
          originalSrc: scopedPath,
          fileName: generatedFileName,
          aiConfig: refreshedAiConfig,
          // 逻辑：重置尺寸以触发 hydration 重新检测新图片的真实宽高并自动调整节点比例。
          naturalWidth: 1,
          naturalHeight: 1,
        });
      },
      [generatingEntry, element.props.versionStack, element.props.aiConfig, onUpdate, fileContext?.projectId],
    ),
    onFailure: useCallback(
      (error: string) => {
        if (!generatingEntry) return;
        const stack = element.props.versionStack;
        if (!stack) return;
        // 逻辑：失败的生成从版本堆叠中移除，回退 primaryId 到上一个成功版本。
        // 失败信息暂存到 lastFailure 供错误浮层和重试使用。
        const { stack: newStack, removed } = removeFailedEntry(stack, generatingEntry.id);
        if (removed?.input) {
          const isCancelled = error.toLowerCase().includes('cancel')
          setLastFailure({
            input: removed.input,
            error: { code: isCancelled ? 'CANCELLED' : 'GENERATE_FAILED', message: error },
          });
          setDismissedFailure(false);
        }
        // 逻辑：回退到上一个成功版本的图片。
        const prevReady = [...newStack.entries].reverse().find((e) => e.status === 'ready');
        const patch: Partial<ImageNodeProps> = { versionStack: newStack };
        if (prevReady?.output?.urls[0]) {
          const raw = prevReady.output.urls[0];
          const scopedPath = parseScopedProjectPath(raw)
            ? raw
            : fileContext?.projectId
              ? formatScopedProjectPath({
                  projectId: fileContext.projectId,
                  currentProjectId: fileContext.projectId,
                  relativePath: normalizeProjectRelativePath(raw),
                  includeAt: true,
                })
              : raw;
          patch.previewSrc = '';
          patch.originalSrc = scopedPath;
          patch.fileName = raw.split('/').pop() || 'image.png';
          patch.naturalWidth = 1;
          patch.naturalHeight = 1;
        }
        onUpdate(patch);
      },
      [generatingEntry, element.props.versionStack, onUpdate, fileContext?.projectId],
    ),
  });

  /** Whether there is a recent failure (from lastFailure transient state). */
  const isFailedVersion = lastFailure !== null;
  /** Whether the primary version is ready. */
  const isReadyVersion = primaryEntry?.status === 'ready';
  const { editingOverride, setEditingOverride } = useVersionStackEditingOverride(element.id, expanded, isGeneratingVersion);
  // 逻辑：生成开始后清除上次失败状态。
  useEffect(() => {
    if (isGeneratingVersion) setLastFailure(null);
  }, [isGeneratingVersion]);

  // ── Image-specific callbacks for useMediaGeneration ──
  const buildSnapshot = useCallback(
    (params: ImageGenerateParams, up: UpstreamData | null) =>
      createInputSnapshot({
        prompt: params.prompt,
        parameters: {
          feature: params.feature,
          variant: params.variant,
          inputs: params.inputs,
          params: params.params,
          aspectRatio: params.aspectRatio,
          count: params.count,
          seed: params.seed,
        },
        upstreamRefs: up?.entries ?? [],
      }),
    [],
  )
  // Panel's handleGenerate already persists aiConfig (with paramsCache).
  // Returning {} avoids a stale-closure overwrite from useMediaGeneration.
  const buildGeneratePatch = useCallback(
    (_params: ImageGenerateParams) => ({}),
    [],
  )
  /** Route generation to the correct service based on variant. */
  const imageSubmitGenerate = useCallback(
    (params: ImageGenerateParams, options: SubmitOptions): Promise<{ taskId: string }> => {
      // v3 path: when variant is provided, route through v3 unified endpoint
      if (params.variant) {
        // Upscale variants: use dedicated submitUpscale for compat
        if (params.variant.startsWith('upscale-')) {
          const imageUrl = (params.inputs?.image as { url: string })?.url ?? ''
          const scale = (params.params?.scale as 2 | 4) ?? 2
          return submitUpscale(
            { sourceImageSrc: imageUrl, scale, variant: params.variant },
            options,
          )
        }
        // All other v3 variants: use submitImageGenerate (which calls submitV3Generate)
        return submitImageGenerate(
          {
            feature: params.feature,
            variant: params.variant,
            inputs: params.inputs,
            params: params.params,
            count: params.count,
            seed: params.seed,
          },
          options,
        )
      }

      // v2 fallback: legacy params without variant
      return submitImageGenerate(
        {
          feature: params.feature || 'imageGenerate',
          variant: '',
          prompt: params.prompt ?? '',
          aspectRatio: params.aspectRatio,
        },
        options,
      )
    },
    [],
  )
  const buildRetryParams = useCallback(
    (input: InputSnapshot): ImageGenerateParams => ({
      feature: (input.parameters?.feature as string) ?? 'imageGenerate',
      variant: (input.parameters?.variant as string) ?? '',
      inputs: (input.parameters?.inputs as Record<string, unknown>) ?? { prompt: input.prompt },
      params: (input.parameters?.params as Record<string, unknown>) ?? {},
      count: input.parameters?.count as number | undefined,
      seed: input.parameters?.seed as number | undefined,
      // Backward compat
      prompt: input.prompt,
      aspectRatio: (input.parameters?.aspectRatio as string) ?? '1:1',
    }),
    [],
  )
  /** Build derive-node patch with paramsCache copying. */
  const buildDeriveNodePatch = useCallback(
    (params: ImageGenerateParams) => {
      // 逻辑：将源节点的参数缓存拷贝到新节点，使新节点面板可恢复生成参数。
      const cacheKey = `${params.feature}:${params.variant}`
      const copiedParamsCache = {
        ...(element.props.aiConfig?.paramsCache ?? {}),
        [cacheKey]: {
          inputs: params.inputs,
          params: params.params,
          count: params.count,
          seed: params.seed,
        },
      }
      return {
        aiConfig: {
          feature: params.feature as import("../board-contracts").AiGenerateConfig['feature'],
          prompt: params.prompt ?? '',
          aspectRatio: params.aspectRatio as import("../board-contracts").AiGenerateConfig['aspectRatio'],
          paramsCache: copiedParamsCache,
        },
      }
    },
    [element.props.aiConfig?.paramsCache],
  )

  const {
    handleGenerate,
    handleRetryGenerate,
    handleGenerateNewNode,
  } = useMediaGeneration<ImageGenerateParams>({
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
    submitGenerate: imageSubmitGenerate,
    buildRetryParams,
    deriveNodeType: 'image',
    buildDeriveNodePatch,
  })

  /** Request opening the image preview on the canvas. */
  const requestPreview = useCallback(() => {
    const originalSrc = resolvedOriginal;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(originalSrc);
    // 逻辑：ImageViewer 仅支持特定协议，相对路径与其他来源回退到压缩预览图。
    const canUseOriginal =
      hasScheme &&
      (originalSrc.startsWith("data:") ||
        originalSrc.startsWith("blob:") ||
        originalSrc.startsWith("http://") ||
        originalSrc.startsWith("https://"));
    const finalOriginal = canUseOriginal ? originalSrc : "";
    // 逻辑：没有可用地址时不弹出预览，避免空白页面。
    if (!finalOriginal && !previewSrc) return;
    // 逻辑：点击图片触发预览，由 board action 统一接管显示。
    actions.openImagePreview({
      originalSrc: finalOriginal,
      previewSrc: previewSrc ?? '',
      fileName: element.props.fileName,
      mimeType: element.props.mimeType,
    });
  }, [actions, element.props.fileName, element.props.mimeType, previewSrc, resolvedOriginal]);

  /** Open the project file picker dialog to replace a broken image. */
  const requestReplaceImage = useCallback(() => {
    setReplacePickerOpen(true);
  }, []);

  // 逻辑：监听工具栏上传按钮的自定义事件，打开文件选择器对话框。
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === element.id) {
        requestReplaceImage();
      }
    };
    document.addEventListener('board:trigger-upload', handler);
    return () => document.removeEventListener('board:trigger-upload', handler);
  }, [element.id, requestReplaceImage]);

  // 逻辑：监听工具栏图片调整按钮的自定义事件。
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === element.id) {
        setAdjusting(true);
      }
    };
    document.addEventListener('board:trigger-image-adjust', handler);
    return () => document.removeEventListener('board:trigger-image-adjust', handler);
  }, [element.id]);

  /** Resolve the image source for the adjust overlay — use rawOriginalSrc (original untransformed) if available. */
  const adjustImageSrc = useMemo(() => {
    const raw = element.props.rawOriginalSrc;
    if (raw) {
      return resolveMediaSource(raw, fileContext) || previewSrc || '';
    }
    return resolveMediaSource(element.props.originalSrc, fileContext) || previewSrc || '';
  }, [element.props.rawOriginalSrc, element.props.originalSrc, fileContext, previewSrc]);

  /** Handle confirmed image adjustment. */
  const handleAdjustConfirm = useCallback(
    async (result: ImageAdjustResult) => {
      try {
        // 逻辑：将变换后的图片保存到画布资产目录。
        const file = new File([result.blob], 'adjusted.png', { type: 'image/png' });
        const boardFolder = fileContext?.boardFolderUri;
        if (boardFolder) {
          const boardRelPath = await saveBoardAssetFile({
            file,
            fallbackName: 'adjusted.png',
            projectId: fileContext?.projectId,
            boardFolderUri: boardFolder,
          });
          // 逻辑：首次调整时备份原始图片 URI。
          const rawOriginal = element.props.rawOriginalSrc || element.props.originalSrc;
          const patch: Partial<ImageNodeProps> = {
            originalSrc: boardRelPath,
            previewSrc: result.previewSrc,
            naturalWidth: result.width,
            naturalHeight: result.height,
            rawOriginalSrc: rawOriginal,
            imageAdjust: result.adjust,
          };
          onUpdate(patch);
          // 逻辑：裁剪后宽高比可能改变，调整节点 xywh 保持中心点不变。
          const el = engine.doc.getElementById(element.id);
          if (el && el.kind === 'node') {
            const [ex, ey, ew, eh] = el.xywh;
            const ratio = result.width / result.height;
            const newW = Math.min(Math.max(ew, IMAGE_NODE_MIN_SIZE.w), IMAGE_NODE_MAX_SIZE.w);
            const newH = Math.round(newW / ratio);
            const cx = ex + ew / 2;
            const cy = ey + eh / 2;
            engine.doc.updateElement(element.id, {
              xywh: [
                Math.round(cx - newW / 2),
                Math.round(cy - newH / 2),
                newW,
                newH,
              ],
            });
          }
        } else {
          // 逻辑：无画布目录时使用 data URL 作为 fallback。
          const rawOriginal = element.props.rawOriginalSrc || element.props.originalSrc;
          const dataUrl = result.previewSrc;
          onUpdate({
            originalSrc: dataUrl,
            previewSrc: dataUrl,
            naturalWidth: result.width,
            naturalHeight: result.height,
            rawOriginalSrc: rawOriginal,
            imageAdjust: result.adjust,
          });
        }
        hydrationRef.current = null;
      } catch {
        // 逻辑：调整失败时静默回退。
      } finally {
        setAdjusting(false);
      }
    },
    [element.id, element.props.originalSrc, element.props.rawOriginalSrc, engine, fileContext, onUpdate],
  );

  /** Apply a new image payload to the current node. */
  const applyReplacePayload = useCallback(
    (props: ImageNodeProps) => {
      engine.doc.updateNodeProps(element.id, props);
      setIsImageError(false);
      hydrationRef.current = null;
    },
    [element.id, engine],
  );

  /** Handle image selected from the project file picker. */
  const handleReplaceImageSelected = useCallback(
    async (selection: ProjectFilePickerSelection | ProjectFilePickerSelection[]) => {
      const item = Array.isArray(selection) ? selection[0] : selection;
      if (!item) return;
      try {
        const payload = await buildImageNodePayloadFromUri(item.fileRef, {
          projectId: item.projectId,
        });
        applyReplacePayload(payload.props as ImageNodeProps);
      } catch {
        // 逻辑：替换图片失败时保持当前错误状态。
      }
    },
    [applyReplacePayload],
  );

  /** Handle image imported from computer via native file input. */
  const handleReplaceFromComputer = useCallback(() => {
    const input = replaceInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);

  /** Handle the file selection from the hidden input. */
  const handleReplaceInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const payload = await engine.buildImagePayloadFromFile(file);
        applyReplacePayload(payload.props as ImageNodeProps);
      } catch {
        // 逻辑：替换图片失败时保持当前错误状态。
      }
    },
    [applyReplacePayload, engine],
  );

  useEffect(() => {
    if (!selected || isLocked) {
      // 逻辑：未选中或锁定状态时收起输入框。
      setShowDetail(false);
    }
  }, [isLocked, selected]);

  useEffect(() => {
    if (!showDetail) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      // 逻辑：点击节点外部时关闭详情面板。
      setShowDetail(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showDetail]);

  useEffect(() => {
    if (
      !resolvedOriginal ||
      isBoardRelativePath(resolvedOriginal) ||
      resolvedOriginal.startsWith("file://")
    ) {
      setIsPreviewLoading(false);
      return;
    }
    const hasPreview = Boolean(element.props.previewSrc);
    const hasSize =
      element.props.naturalWidth > 1 && element.props.naturalHeight > 1;
    if (hasPreview && hasSize) {
      setIsPreviewLoading(false);
      return;
    }
    if (hydrationRef.current === resolvedOriginal) return;
    hydrationRef.current = resolvedOriginal;

    let cancelled = false;
    const nodeId = element.id;
    // 逻辑：拉取预览与尺寸，避免外部节点重复处理。
    void (async () => {
      setIsPreviewLoading(true);
      try {
        // 逻辑：ImageNode 复用预览 URL，避免 data url 二次加载闪烁。
        // 有 boardId 且原始路径是 board-relative 时，直接传原始路径 + boardId 走专用端点。
        const useBoardEndpoint = fileContext?.boardId && isBoardRelativePath(element.props.originalSrc);
        const fetchUri = useBoardEndpoint ? element.props.originalSrc : resolvedOriginal;
        const payload = await buildImageNodePayloadFromUri(fetchUri, {
          projectId: fileContext?.projectId,
          boardId: useBoardEndpoint ? fileContext.boardId : undefined,
          maxPreviewBytes: IMAGE_NODE_PREVIEW_MAX_BYTES,
          previewMode: "none",
        });
        if (cancelled) return;
        if (!engine.doc.getElementById(nodeId)) return;
        const patch: Partial<ImageNodeProps> = {};
        if (
          (element.props.originalSrc.startsWith("file://") ||
            isProjectAbsolutePath(element.props.originalSrc)) &&
          projectRelativeOriginal &&
          projectRelativeOriginal !== element.props.originalSrc
        ) {
          patch.originalSrc = projectRelativeOriginal;
        }
        if (!element.props.previewSrc && payload.props.previewSrc) {
          patch.previewSrc = payload.props.previewSrc;
        }
        const needsSizeInit =
          element.props.naturalWidth <= 1 || element.props.naturalHeight <= 1;
        if (needsSizeInit) {
          patch.naturalWidth = payload.props.naturalWidth;
          patch.naturalHeight = payload.props.naturalHeight;
        }
        if (!element.props.mimeType && payload.props.mimeType) {
          patch.mimeType = payload.props.mimeType;
        }
        if ((!element.props.fileName || element.props.fileName === 'image.png') && payload.props.fileName) {
          patch.fileName = payload.props.fileName;
        }
        if (Object.keys(patch).length > 0) {
          engine.doc.updateNodeProps(nodeId, patch);
        }
        // 逻辑：首次获取图片尺寸后，自动调整节点宽高以适配图片比例。
        // ew 继承自源节点宽度（由 deriveNode 设定），作为最大宽度上限。
        if (needsSizeInit && payload.props.naturalWidth > 1 && payload.props.naturalHeight > 1) {
          const el = engine.doc.getElementById(nodeId);
          if (el && el.kind === "node") {
            const [ex, ey, ew, eh] = el.xywh;
            const ratio = payload.props.naturalWidth / payload.props.naturalHeight;
            const newW = Math.max(ew, IMAGE_NODE_MIN_SIZE.w);
            const newH = Math.round(newW / ratio);
            const cx = ex + ew / 2;
            const cy = ey + eh / 2;
            engine.doc.updateElement(nodeId, {
              xywh: [
                Math.round(cx - newW / 2),
                Math.round(cy - newH / 2),
                newW,
                newH,
              ],
            });
          }
        }
      } catch {
        // 逻辑：预览加载失败时保持原状，避免阻断渲染。
        hydrationRef.current = null;
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    element.id,
    element.props.fileName,
    element.props.mimeType,
    element.props.naturalHeight,
    element.props.naturalWidth,
    element.props.originalSrc,
    element.props.previewSrc,
    engine,
    fileContext?.projectId,
    resolvedOriginal,
  ]);

  useLayoutEffect(() => {
    // 逻辑：预览地址变化时同步更新加载态，避免首帧闪烁。
    if (!previewSrc) {
      lastPreviewRef.current = "";
      setIsImageLoading(false);
      setIsImageError(false);
      return;
    }
    if (previewSrc !== lastPreviewRef.current) {
      lastPreviewRef.current = previewSrc;
      setIsImageLoading(true);
      setIsImageError(false);
    }
  }, [previewSrc]);

  // 逻辑：为版本堆叠动画效果计算所有 ready 版本的缩略图 URL。
  const versionThumbnails = useMemo(() => {
    const stack = element.props.versionStack
    if (!stack || stack.entries.length <= 1) return undefined
    return stack.entries
      .filter((e) => e.status === 'ready' && e.output?.urls[0])
      .map((e) => {
        const raw = e.output!.urls[0]
        const scoped = parseScopedProjectPath(raw)
          ? raw
          : fileContext?.projectId
            ? formatScopedProjectPath({
                projectId: fileContext.projectId,
                currentProjectId: fileContext.projectId,
                relativePath: normalizeProjectRelativePath(raw),
                includeAt: true,
              })
            : raw
        return { id: e.id, src: resolveMediaSource(scoped, fileContext) }
      })
      .filter((t): t is { id: string; src: string } => Boolean(t.src))
  }, [element.props.versionStack, fileContext])

  /** Whether the node has multiple ready versions (activates card-stack visual). */
  const isStacked = (versionThumbnails?.length ?? 0) > 1

  return (
    <NodeFrame ref={rootRef} className="group" data-image-error={isImageError || undefined}>
      <VersionStackOverlay
        stack={element.props.versionStack}
        semanticColor="blue"
        thumbnails={versionThumbnails}
      />
      <div
        className={[
          "relative h-full w-full overflow-hidden box-border",
          // 逻辑：堆叠时去掉容器圆角和背景，让缩放后的卡片自带圆角。
          isStacked ? '' : 'rounded-3xl',
        ].join(" ")}
        onPointerDownCapture={event => {
          if (isLocked) return;
          if (event.button !== 0) return;
          // 逻辑：按下时先展示输入框，避免选中置顶导致 click 丢失。
          setShowDetail(true);
        }}
        onDoubleClick={event => {
          event.stopPropagation();
          // 逻辑：空节点双击打开文件选择器（展开态跳过因为面板已可见），有内容时双击始终打开预览。
          if (!hasPreview && !isPreviewLoading && !isTranscoding) {
            if (expanded) return;
            requestReplaceImage();
          } else {
            requestPreview();
          }
        }}
      >
        {hasPreview && !isImageError ? (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={primaryEntry?.id || 'initial'}
              initial={isStacked ? { opacity: 0, scale: STACK_CARD_SCALE * 0.9 } : false}
              animate={{ opacity: 1, scale: isStacked ? STACK_CARD_SCALE : 1 }}
              exit={isStacked ? { opacity: 0, scale: STACK_CARD_SCALE * 0.9 } : undefined}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={[
                "h-full w-full",
                // 逻辑：堆叠时主图作为"卡片"——圆角、实色背景、阴影，与背景卡片匹配。
                isStacked ? "rounded-2xl bg-background shadow-md overflow-hidden" : "",
              ].join(" ")}
              style={isStacked ? { transformOrigin: 'center' } : undefined}
            >
              {/* 逻辑：加载中先显示灰色骨架，图片就绪后淡入。 */}
              {isImageLoading ? (
                <div className="absolute inset-0">
                  <ImageNodeSkeleton />
                </div>
              ) : null}
              <img
                src={previewSrc}
                alt={element.props.fileName || "Image"}
                className={[
                  "h-full w-full object-contain transition-opacity duration-200 ease-out",
                  isImageLoading ? "opacity-0" : "opacity-100",
                ].join(" ")}
                draggable={false}
                onLoad={() => setIsImageLoading(false)}
                onError={() => {
                  setIsImageLoading(false);
                  setIsImageError(true);
                }}
              />
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-ol-divider bg-ol-surface-muted">
            {/* 逻辑：有失败/生成浮层时隐藏空状态内容，避免图标透出。 */}
            {(isFailedVersion && !dismissedFailure) || isGeneratingVersion ? null
            : isPreviewLoading || isTranscoding ? (
              <ImageNodeSkeleton />
            ) : !element.props.originalSrc && !element.props.previewSrc ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/40 px-4">
                <ImagePlus size={36} strokeWidth={1.2} />
                <span className="text-xs text-center leading-relaxed whitespace-pre-line">
                  {i18next.t('board:imageNode.emptyHint', { defaultValue: '双击上传图片\n或选中后 AI 生成' })}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                <ImageOff size={28} strokeWidth={1.5} />
                <span className="text-xs">
                  {isImageError
                    ? i18next.t('board:imageNode.loadFailed')
                    : i18next.t('board:imageNode.notFound')}
                </span>
              </div>
            )}
          </div>
        )}
        {isTranscoding ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-background/80 text-xs text-ol-text-secondary">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span>{transcodingLabel}</span>
          </div>
        ) : null}
        {/* ── Generating overlay (version stack) ── */}
        {isGeneratingVersion ? (
          <GeneratingOverlay
            startedAt={pollingResult.startedAt}
            estimatedSeconds={45}
            serverProgress={pollingResult.progress}
            color="blue"
          />
        ) : null}
        {/* ── Mask paint overlay (inpaint/erase) ── */}
        <MaskPaintOverlay
          ref={maskPaintRef}
          active={maskPainting && hasPreview}
          imageWidth={element.props.naturalWidth || 512}
          imageHeight={element.props.naturalHeight || 512}
          onMaskChange={setMaskResult}
          onBrushSizeChange={setBrushSize}
        />
        {/* ── Failed / Cancelled overlay (version stack) ── */}
        <FailureOverlay
          visible={isFailedVersion && !dismissedFailure}
          isCancelled={lastFailure?.error?.code === 'CANCELLED'}
          message={lastFailure?.error?.message || i18next.t('board:imageNode.generationFailed')}
          cancelledKey="board:imageNode.cancelled"
          retryKey="board:imageNode.retry"
          resendKey="board:imageNode.resend"
          onRetry={handleRetryGenerate}
          canDismiss={hasPreview}
          onDismiss={() => setDismissedFailure(true)}
        />
      </div>
      {showDetail ? (
        <div
          className="absolute left-1/2 top-full mt-3 -translate-x-1/2"
          data-board-editor
          onPointerDown={event => {
            // 逻辑：阻止画布接管输入区域的拖拽与选择。
            event.stopPropagation();
          }}
        >
          <ImageNodeDetail
            source={
              projectRelativeOriginal ||
              (!isBoardRelativePath(element.props.originalSrc)
                ? element.props.originalSrc
                : undefined)
            }
            fallbackSource={previewSrc}
            projectId={fileContext?.projectId}
          />
        </div>
      ) : null}
      <InlinePanelPortal
        expanded={expanded}
        panelOverlay={panelOverlay}
        panelRef={panelRef}
        xywh={element.xywh}
        engine={engine}
      >
        <ImageAiPanel
          element={element}
          onUpdate={onUpdate}
          upstreamText={effectiveUpstream.text}
          upstreamImages={effectiveUpstream.images}
          upstreamImagePaths={effectiveUpstream.imagePaths}
          upstreamAudioUrl={effectiveUpstream.audioUrl}
          upstreamVideoUrl={effectiveUpstream.videoUrl}
          rawUpstream={upstream}
          resolvedImageSrc={resolveMediaSource(element.props.originalSrc, fileContext) || previewSrc}
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNewNode}
          maskPainting={maskPainting}
          onToggleMaskPaint={setMaskPainting}
          maskResult={maskResult}
          maskPaintRef={maskPaintRef}
          brushSize={brushSize}
          readonly={(isReadyVersion || isGeneratingVersion) && !editingOverride}
          editing={editingOverride}
          onUnlock={() => setEditingOverride(true)}
          onCancelEdit={() => setEditingOverride(false)}
          boardId={fileContext?.boardId}
          projectId={fileContext?.projectId}
          boardFolderUri={fileContext?.boardFolderUri}
        />
      </InlinePanelPortal>
      <ProjectFilePickerDialog
        open={replacePickerOpen}
        onOpenChange={setReplacePickerOpen}
        title={i18next.t('board:imageNode.replaceTitle')}
        filterHint={i18next.t('board:imageNode.replaceHint')}
        allowedExtensions={IMAGE_EXTS}
        excludeBoardEntries
        currentBoardFolderUri={fileContext?.boardFolderUri}
        defaultRootUri={fileContext?.rootUri}
        defaultActiveUri={fileContext?.boardFolderUri}
        onSelectFile={handleReplaceImageSelected}
        onSelectFiles={handleReplaceImageSelected}
        onImportFromComputer={handleReplaceFromComputer}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={imageAcceptAttr}
        className="hidden"
        onChange={handleReplaceInputChange}
      />
      <ImageAdjustOverlay
        active={adjusting && Boolean(adjustImageSrc)}
        imageSrc={adjustImageSrc}
        initialAdjust={element.props.imageAdjust}
        onConfirm={handleAdjustConfirm}
        onCancel={() => setAdjusting(false)}
      />
    </NodeFrame>
  );
}

/** Definition for the image node. */
export const ImageNodeDefinition: CanvasNodeDefinition<ImageNodeProps> = {
  type: "image",
  schema: z.object({
    previewSrc: z.string(),
    originalSrc: z.string(),
    mimeType: z.string(),
    fileName: z.string(),
    naturalWidth: z.number(),
    naturalHeight: z.number(),
    isTranscoding: z.boolean().optional(),
    transcodingLabel: z.string().optional(),
    transcodingId: z.string().optional(),
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
      generatedAt: z.number().optional(),
    }).optional(),
    versionStack: z.any().optional(),
    rawOriginalSrc: z.string().optional(),
    imageAdjust: z.object({
      rotation: z.number(),
      flipH: z.boolean(),
      flipV: z.boolean(),
      cropRect: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }).optional(),
      aspectRatio: z.string().optional(),
    }).optional(),
  }),
  defaultProps: {
    previewSrc: "",
    originalSrc: "",
    mimeType: "image/png",
    fileName: "image.png",
    naturalWidth: 1,
    naturalHeight: 1,
    isTranscoding: false,
    transcodingLabel: "",
    transcodingId: "",
  },
  view: ImageNodeView,
  capabilities: {
    resizable: false,
    rotatable: false,
    connectable: "anchors",
    minSize: IMAGE_NODE_MIN_SIZE,
    maxSize: IMAGE_NODE_MAX_SIZE,
  },
  inlinePanel: { width: 420, height: 480 },
  outputTypes: ['image'],
  toolbar: (ctx) => createImageToolbarItems(ctx),
};
