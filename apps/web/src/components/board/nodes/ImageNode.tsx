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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  ImagePlus,
  Loader2,
  RotateCw,
  Trash2,
  Type,
  Video,
  X,
} from "lucide-react";
import { useBoardContext } from "../core/BoardProvider";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { ImageNodeDetail } from "./ImageNodeDetail";
import { NodeFrame } from "./NodeFrame";
import type { BoardFileContext } from "../core/BoardProvider";
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { arrayBufferToBase64 } from "../utils/base64";
import { getPreviewEndpoint } from "@/lib/image/uri";
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
import { IMAGE_NODE_MAX_SIZE, IMAGE_NODE_MIN_SIZE } from "./node-config";
import i18next from "i18next";
import {
  BOARD_TOOLBAR_ITEM_DEFAULT,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { createPortal } from "react-dom";
import { ImageAiPanel, type ImageGenerateParams } from "../panels/ImageAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { deriveNode } from "../utils/derive-node";
import { submitImageGenerate } from "../services/image-generate";
import { MaskPaintOverlay, type MaskPaintHandle } from "./MaskPaintOverlay";
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
} from "../engine/version-stack";
import { useMediaTaskPolling } from "../hooks/useMediaTaskPolling";
import { VersionStackOverlay, STACK_CARD_SCALE } from "./VersionStackOverlay";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { motion, AnimatePresence } from "framer-motion";

/** Inline panel gap from node bottom edge in screen pixels (zoom-independent). */
const PANEL_GAP_PX = 8;

/** Max bytes for image node preview fetches. */
const IMAGE_NODE_PREVIEW_MAX_BYTES = 100 * 1024;

/** Render a checkerboard skeleton for image nodes. */
function ImageNodeSkeleton() {
  return (
    <div
      className="h-full w-full animate-pulse rounded-lg"
      style={{
        backgroundColor: "#fafafa",
        backgroundImage:
          "linear-gradient(45deg, #e5e5e5 25%, transparent 25%, transparent 75%, #e5e5e5 75%, #e5e5e5), linear-gradient(45deg, #e5e5e5 25%, transparent 25%, transparent 75%, #e5e5e5 75%, #e5e5e5)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0, 8px 8px",
      }}
    />
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
};

/** Resolve a board-scoped uri into a project-scoped path. */
function resolveProjectRelativePath(uri: string, fileContext?: BoardFileContext) {
  const scope = resolveBoardFolderScope(fileContext);
  return resolveProjectPathFromBoardUri({
    uri,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
}

/** Resolve image uri to a browser-friendly source. */
function resolveImageSource(uri: string, fileContext?: BoardFileContext) {
  if (!uri) return "";
  if (
    uri.startsWith("data:") ||
    uri.startsWith("blob:") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  ) {
    return uri;
  }
  const projectPath = resolveProjectRelativePath(uri, fileContext);
  if (!projectPath) return "";
  return getPreviewEndpoint(projectPath, {
    projectId: fileContext?.projectId,
  });
}

/** Resolve the default directory for download dialogs. */
function resolveDownloadDefaultDir(fileContext?: BoardFileContext) {
  const boardFolderUri = fileContext?.boardFolderUri?.trim();
  if (boardFolderUri) {
    if (boardFolderUri.startsWith("file://")) return boardFolderUri;
  }
  const rootUri = fileContext?.rootUri?.trim();
  if (rootUri && rootUri.startsWith("file://")) return rootUri;
  return "";
}

/** Trigger a download for the original image. */
async function downloadOriginalImage(
  props: ImageNodeProps,
  fileContext?: BoardFileContext,
) {
  const href = resolveImageSource(props.originalSrc, fileContext);
  if (!href) return;
  const saveFile = window.openloafElectron?.saveFile;
  if (saveFile) {
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("download failed");
      const buffer = await response.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buffer);
      const defaultDir = resolveDownloadDefaultDir(fileContext);
      const rawName = props.fileName || "image.png";
      const hasExt = rawName.includes(".");
      const fileName = hasExt ? rawName : `${rawName}.png`;
      const extension = fileName.split(".").pop() || "png";
      const result = await saveFile({
        contentBase64,
        defaultDir: defaultDir || undefined,
        suggestedName: fileName,
        filters: [{ name: "Image", extensions: [extension] }],
      });
      if (result?.ok || result?.canceled) return;
    } catch {
      // 逻辑：桌面保存失败时回退到浏览器下载方式。
    }
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = props.fileName || "image";
  link.rel = "noreferrer";
  link.click();
}

/**
 * Module-level set tracking which nodes have been unlocked for editing.
 * Set by toolbar "regenerate" action, read by the component to override readonly.
 */
const editingUnlockedIds = new Set<string>();

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

/** Connector templates offered by the image node. */
const getImageNodeConnectorTemplates = (): CanvasConnectorTemplateDefinition[] => [
  {
    id: 'text',
    label: i18next.t('board:connector.textNode'),
    description: i18next.t('board:connector.textNodeDesc'),
    size: [200, 200],
    icon: <Type size={14} />,
    createNode: () => ({
      type: 'text',
      props: { style: 'sticky', stickyColor: 'yellow' },
    }),
  },
  {
    id: 'image',
    label: i18next.t('board:connector.imageGenerate'),
    description: i18next.t('board:connector.imageGenerateDesc'),
    size: [320, 180],
    icon: <ImagePlus size={14} />,
    createNode: () => ({
      type: 'image',
      props: {},
    }),
  },
  {
    id: 'video',
    label: i18next.t('board:connector.videoGenerate'),
    description: i18next.t('board:connector.videoGenerateDesc'),
    size: [320, 180],
    icon: <Video size={14} />,
    createNode: () => ({
      type: 'video',
      props: {},
    }),
  },
];

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
  // 把 upstream imageList 中的 board 相对路径解析为浏览器可访问 URL
  const resolvedUpstreamImages = useMemo(
    () => upstream?.imageList
      .map((src) => resolveImageSource(src, fileContext))
      .filter(Boolean) ?? [],
    [upstream?.imageList, fileContext],
  );
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
  const previewSrc =
    element.props.previewSrc ||
    resolveImageSource(element.props.originalSrc, fileContext);
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
  /** Whether the user has dismissed the failed overlay to view old content. */
  const [dismissedFailure, setDismissedFailure] = useState(false);
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

  const primaryEntry = getPrimaryEntry(element.props.versionStack);
  const generatingEntry = getGeneratingEntry(element.props.versionStack);

  // 逻辑：有生成记录（ready）且存储了 upstreamRefs 时，使用冻结的上游数据；
  // 版本切换时 primaryEntry 变化，插槽内容自动跟随。
  const effectiveUpstream = useMemo(() => {
    const refs = primaryEntry?.input?.upstreamRefs;
    if (primaryEntry?.status === 'ready' && refs && refs.length > 0) {
      const text = refs.filter(r => r.nodeType === 'text').map(r => r.data).join('\n') || undefined;
      const images = refs
        .filter(r => r.nodeType === 'image')
        .map(r => resolveImageSource(r.data, fileContext))
        .filter(Boolean) as string[];
      return { text, images };
    }
    return {
      text: upstream?.textList.join('\n') || undefined,
      images: resolvedUpstreamImages,
    };
  }, [primaryEntry, upstream, resolvedUpstreamImages, fileContext]);

  const pollingResult = useMediaTaskPolling({
    taskId: generatingEntry?.taskId,
    taskType: 'image_generate',
    projectId: fileContext?.projectId,
    saveDir: fileContext?.boardFolderUri
      ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
      : undefined,
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
        onUpdate({
          versionStack: markVersionReady(stack, generatingEntry.id, { urls: resultUrls }),
          previewSrc: '',
          originalSrc: scopedPath,
          fileName: generatedFileName,
          // 逻辑：重置尺寸以触发 hydration 重新检测新图片的真实宽高并自动调整节点比例。
          naturalWidth: 1,
          naturalHeight: 1,
        });
      },
      [generatingEntry, element.props.versionStack, onUpdate, fileContext?.projectId],
    ),
    onFailure: useCallback(
      (error: string) => {
        if (!generatingEntry) return;
        const stack = element.props.versionStack;
        if (!stack) return;
        onUpdate({
          versionStack: markVersionFailed(stack, generatingEntry.id, {
            code: 'GENERATE_FAILED',
            message: error,
          }),
        });
      },
      [generatingEntry, element.props.versionStack, onUpdate],
    ),
  });

  /** Whether the node is in a generating state (version stack). */
  const isGeneratingVersion = primaryEntry?.status === 'generating';
  /** Whether the primary version failed. */
  const isFailedVersion = primaryEntry?.status === 'failed';
  /** Whether the primary version is ready. */
  const isReadyVersion = primaryEntry?.status === 'ready';
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
    if (isGeneratingVersion || !expanded) setEditingOverride(false);
  }, [isGeneratingVersion, expanded]);
  // 逻辑：新的失败状态出现时重置 dismiss。
  useEffect(() => {
    if (isFailedVersion) setDismissedFailure(false);
  }, [primaryEntry?.id]);

  /** Handle image generation: submit task and push a generating entry to the version stack. */
  const handleGenerate = useCallback(
    async (params: ImageGenerateParams) => {
      try {
        const result = await submitImageGenerate(
          {
            prompt: params.prompt ?? '',
            negativePrompt: params.negativePrompt,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            mode: params.generateMode,
            referenceImageSrcs: params.inputImages,
            count: params.count,
            quality: params.quality,
            seed: params.seed,
          },
          {
            projectId: fileContext?.projectId,
            saveDir: fileContext?.boardFolderUri
              ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
              : undefined,
            sourceNodeId: element.id,
          },
        )

        // 逻辑：创建 InputSnapshot 和 VersionStackEntry，在节点自身上追踪生成状态。
        // 逻辑：将当前上游数据快照保存到 InputSnapshot，使生成后插槽内容固定。
        const inputSnapshot = createInputSnapshot({
          prompt: params.prompt,
          negativePrompt: params.negativePrompt,
          parameters: {
            feature: params.feature,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            generateMode: params.generateMode,
            inputImages: params.inputImages,
            quality: params.quality,
            count: params.count,
            seed: params.seed,
          },
          upstreamRefs: [
            ...(upstream?.textList ?? []).map(text => ({ nodeId: '', nodeType: 'text', data: text })),
            ...(upstream?.imageList ?? []).map(src => ({ nodeId: '', nodeType: 'image', data: src })),
          ],
        })
        const entry = createGeneratingEntry(inputSnapshot, result.taskId)
        const config: import("../board-contracts").AiGenerateConfig = {
          feature: params.feature,
          prompt: params.prompt ?? '',
          negativePrompt: params.negativePrompt,
          aspectRatio: params.aspectRatio as import("../board-contracts").AiGenerateConfig['aspectRatio'],
          quality: params.quality,
          taskId: result.taskId,
        }

        onUpdate({
          versionStack: pushVersion(element.props.versionStack, entry),
          origin: 'ai-generate',
          aiConfig: config,
        })
      } catch (error) {
        console.error('[ImageNode] image generation failed:', error)
      }
    },
    [element.id, element.props.versionStack, fileContext, upstream, onUpdate],
  )

  /** Retry generation using the failed entry's input snapshot. */
  const handleRetryGenerate = useCallback(() => {
    if (!primaryEntry?.input) return;
    const input = primaryEntry.input;
    const params: ImageGenerateParams = {
      feature: (input.parameters?.feature as ImageGenerateParams['feature']) ?? 'imageGenerate',
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: (input.parameters?.aspectRatio as string) ?? '1:1',
      resolution: (input.parameters?.resolution as string) ?? '1K',
      generateMode: input.parameters?.generateMode as ImageGenerateParams['generateMode'],
      inputImages: input.parameters?.inputImages as string[] | undefined,
      quality: input.parameters?.quality as ImageGenerateParams['quality'],
      count: input.parameters?.count as ImageGenerateParams['count'],
      seed: input.parameters?.seed as number | undefined,
    };
    handleGenerate(params);
  }, [primaryEntry, handleGenerate]);

  /** Generate into a new derived image node with the same params. */
  const handleGenerateNewNode = useCallback(
    async (params: ImageGenerateParams) => {
      try {
        // 逻辑：创建新的图片节点并在其上提交生成任务。
        const newNodeId = deriveNode({
          engine,
          sourceNodeId: element.id,
          targetType: 'image',
          targetProps: { origin: 'ai-generate' },
        })
        if (!newNodeId) return

        const result = await submitImageGenerate(
          {
            prompt: params.prompt ?? '',
            negativePrompt: params.negativePrompt,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            mode: params.generateMode,
            referenceImageSrcs: params.inputImages,
            count: params.count,
            quality: params.quality,
            seed: params.seed,
          },
          {
            projectId: fileContext?.projectId,
            saveDir: fileContext?.boardFolderUri
              ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
              : undefined,
            sourceNodeId: newNodeId,
          },
        )

        const inputSnapshot = createInputSnapshot({
          prompt: params.prompt,
          negativePrompt: params.negativePrompt,
          parameters: {
            feature: params.feature,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            generateMode: params.generateMode,
            quality: params.quality,
            count: params.count,
            seed: params.seed,
          },
        })
        const entry = createGeneratingEntry(inputSnapshot, result.taskId)

        engine.doc.updateNodeProps(newNodeId, {
          versionStack: pushVersion(undefined, entry),
          origin: 'ai-generate',
          aiConfig: {
            feature: params.feature,
            prompt: params.prompt ?? '',
            negativePrompt: params.negativePrompt,
            aspectRatio: params.aspectRatio as import("../board-contracts").AiGenerateConfig['aspectRatio'],
            quality: params.quality,
            taskId: result.taskId,
          },
        })
      } catch (error) {
        console.error('[ImageNode] new node generation failed:', error)
      }
    },
    [engine, element.id, fileContext],
  )

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
      previewSrc,
      fileName: element.props.fileName,
      mimeType: element.props.mimeType,
    });
  }, [actions, element.props.fileName, element.props.mimeType, previewSrc, resolvedOriginal]);

  /** Open the project file picker dialog to replace a broken image. */
  const requestReplaceImage = useCallback(() => {
    setReplacePickerOpen(true);
  }, []);

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
        const payload = await buildImageNodePayloadFromUri(resolvedOriginal, {
          projectId: fileContext?.projectId,
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
        return { id: e.id, src: resolveImageSource(scoped, fileContext) }
      })
      .filter((t): t is { id: string; src: string } => Boolean(t.src))
  }, [element.props.versionStack, fileContext])

  /** Whether the node has multiple ready versions (activates card-stack visual). */
  const isStacked = (versionThumbnails?.length ?? 0) > 1

  return (
    <NodeFrame ref={rootRef} className="group">
      <VersionStackOverlay
        stack={element.props.versionStack}
        semanticColor="blue"
        thumbnails={versionThumbnails}
      />
      <div
        className={[
          "relative h-full w-full overflow-hidden box-border",
          // 逻辑：堆叠时去掉容器圆角和背景，让缩放后的卡片自带圆角。
          isStacked ? '' : 'rounded-lg',
        ].join(" ")}
        onPointerDownCapture={event => {
          if (isLocked) return;
          if (event.button !== 0) return;
          // 逻辑：按下时先展示输入框，避免选中置顶导致 click 丢失。
          setShowDetail(true);
        }}
        onDoubleClick={event => {
          event.stopPropagation();
          if (expanded) return;
          // 逻辑：空节点双击打开文件选择器，有内容时双击打开预览。
          if (!hasPreview && !isPreviewLoading && !isTranscoding) {
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
              {isImageLoading ? (
                <div className="absolute inset-0">
                  <ImageNodeSkeleton />
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-ol-divider bg-ol-surface-muted">
            {isPreviewLoading || isTranscoding ? (
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 text-xs text-ol-text-secondary">
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
        {/* ── Failed overlay (version stack) ── */}
        {isFailedVersion && !dismissedFailure ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/75 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
              <X className="h-4 w-4 text-ol-text-auxiliary" />
            </div>
            <span className="text-xs text-ol-text-auxiliary font-medium">
              {primaryEntry?.error?.message || i18next.t('board:imageNode.generationFailed')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryGenerate();
                }}
                className="flex items-center gap-1 rounded-full px-3 py-1 text-[11px] bg-white/[0.08] text-ol-text-secondary hover:bg-white/[0.12] transition-colors duration-150"
              >
                <RotateCw className="h-3 w-3" />
                {i18next.t('board:imageNode.retry')}
              </button>
              {hasPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissedFailure(true);
                  }}
                  className="text-[11px] text-ol-text-auxiliary underline underline-offset-2 hover:text-ol-text-secondary transition-colors duration-150"
                >
                  {i18next.t('board:loading.dismiss')}
                </button>
              )}
            </div>
          </div>
        ) : null}
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
      {expanded && panelOverlay ? createPortal(
        <div
          ref={panelRef}
          className="pointer-events-auto absolute"
          data-board-editor
          style={{
            // 逻辑：面板在 panelOverlay 层（与 DomNodeLayer 同坐标系），
            // 用节点 xywh 定位在节点正下方居中。
            // top 由 syncPanelScale 实时更新（间距 = PANEL_GAP_PX / zoom，屏幕恒定像素）。
            // 初始值也需包含间距，避免 useEffect 执行前出现 0 间距闪烁。
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
          <ImageAiPanel
            element={element}
            onUpdate={onUpdate}
            upstreamText={effectiveUpstream.text}
            upstreamImages={effectiveUpstream.images}
            resolvedImageSrc={previewSrc}
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
          />
        </div>,
        panelOverlay,
      ) : null}
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
      feature: z.enum(['imageGenerate', 'poster', 'imageEdit', 'upscale', 'outpaint', 'videoGenerate', 'digitalHuman', 'tts']).optional(),
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
      results: z.array(z.object({
        previewSrc: z.string(),
        originalSrc: z.string(),
      })).optional(),
      selectedIndex: z.number().optional(),
    }).optional(),
    versionStack: z.any().optional(),
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
    resizable: true,
    resizeMode: "uniform",
    rotatable: false,
    connectable: "anchors",
    minSize: IMAGE_NODE_MIN_SIZE,
    maxSize: IMAGE_NODE_MAX_SIZE,
  },
  inlinePanel: { width: 420, height: 480 },
  connectorTemplates: () => getImageNodeConnectorTemplates(),
  toolbar: (ctx) => createImageToolbarItems(ctx),
};
