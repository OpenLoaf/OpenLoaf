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
  Download,
  ImageOff,
  ImagePlus,
  Info,
  RefreshCw,
  Trash2,
  Type,
  Video,
  ZoomIn,
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
import { isProjectAbsolutePath } from "@/components/project/filesystem/utils/file-system-utils";
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
import { submitUpscale } from "../services/upscale-generate";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { resolveDirectionalStackPlacement } from "../utils/output-placement";

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
      const fileName = props.fileName || "image.png";
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

/** Build toolbar items for image nodes. */
function createImageToolbarItems(ctx: CanvasToolbarContext<ImageNodeProps>) {
  const origin = ctx.element.props.origin;

  // AI action buttons: regenerate (ai-generate only), upscale, generate video
  const aiItems = [
    ...(origin === 'ai-generate'
      ? [
          {
            id: "ai-regenerate",
            label: i18next.t('board:aiToolbar.regenerate'),
            icon: <RefreshCw size={14} />,
            className: BOARD_TOOLBAR_ITEM_DEFAULT,
            onSelect: () => {},
          },
        ]
      : []),
    {
      id: "ai-upscale",
      label: i18next.t('board:aiToolbar.upscale'),
      icon: <ZoomIn size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => {
        const sourceProps = ctx.element.props
        const sourceImageSrc =
          resolveImageSource(sourceProps.originalSrc, ctx.fileContext) ||
          sourceProps.previewSrc
        if (!sourceImageSrc) return

        submitUpscale(
          { sourceImageSrc, scale: 2, modelId: 'auto' },
          { projectId: ctx.fileContext?.projectId },
        )
          .then((result) => {
            // 逻辑：计算 LoadingNode 放置位置 — 源节点右侧堆叠。
            const [loadingW, loadingH] = DEFAULT_NODE_SIZE
            const existingOutputs: Array<[number, number, number, number]> =
              (ctx.engine.doc.getElements() as any[])
                .filter((el: any) => el.kind === 'connector')
                .reduce(
                (rects: Array<[number, number, number, number]>, connector: any) => {
                  if (
                    !('elementId' in connector.source) ||
                    connector.source.elementId !== ctx.element.id
                  ) {
                    return rects
                  }
                  if (!('elementId' in connector.target)) return rects
                  const targetEl = ctx.engine.doc.getElementById(
                    connector.target.elementId,
                  )
                  if (!targetEl || targetEl.kind !== 'node') return rects
                  return [...rects, targetEl.xywh]
                },
                [],
              )

            const placement = resolveDirectionalStackPlacement(
              ctx.element.xywh,
              existingOutputs,
              {
                direction: 'right',
                sideGap: 60,
                stackGap: 16,
                outputSize: [loadingW, loadingH],
              },
            )
            const x = placement
              ? placement.x
              : ctx.element.xywh[0] + ctx.element.xywh[2] + 60
            const y = placement ? placement.y : ctx.element.xywh[1]

            const loadingNodeId = ctx.engine.addNodeElement(
              'loading',
              {
                taskId: result.taskId,
                taskType: 'upscale',
                sourceNodeId: ctx.element.id,
                promptText: 'upscale 2x',
                projectId: ctx.fileContext?.projectId ?? '',
                saveDir: ctx.fileContext?.boardFolderUri
                  ? `${ctx.fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
                  : '',
              },
              [x, y, loadingW, loadingH],
            )

            // 逻辑：创建从源节点到 LoadingNode 的连线。
            if (loadingNodeId) {
              ctx.engine.addConnectorElement(
                {
                  source: { elementId: ctx.element.id },
                  target: { elementId: loadingNodeId },
                  style: ctx.engine.getConnectorStyle(),
                },
                { skipHistory: true, select: false },
              )
            }
          })
          .catch((err: unknown) => {
            console.error('[board] upscale failed:', err)
          })
      },
    },
    {
      id: "ai-generate-video",
      label: i18next.t('board:aiToolbar.generateVideo'),
      icon: <Video size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => {
        deriveNode({ engine: ctx.engine, sourceNodeId: ctx.element.id, targetType: 'video' })
      },
    },
  ];

  const baseItems = [
    {
      id: "download",
      label: i18next.t('board:imageNode.toolbar.download'),
      icon: <Download size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => void downloadOriginalImage(ctx.element.props, ctx.fileContext),
    },
    {
      id: "inspect",
      label: i18next.t('board:imageNode.toolbar.detail'),
      icon: <Info size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
    {
      id: "delete",
      label: i18next.t('board:board.delete'),
      icon: <Trash2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: () => ctx.engine.deleteElements([ctx.element.id]),
    },
  ];
  return [...aiItems, ...baseItems];
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

  /** Handle image generation: submit task and create a LoadingNode to the right. */
  const handleGenerate = useCallback(
    async (params: ImageGenerateParams) => {
      try {
        const result = await submitImageGenerate(
          {
            prompt: params.prompt,
            negativePrompt: params.negativePrompt,
            modelId: params.modelId !== 'auto' ? params.modelId : undefined,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            referenceImageSrc: params.referenceImageSrc,
          },
          {
            projectId: fileContext?.projectId,
            saveDir: fileContext?.boardFolderUri
              ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
              : undefined,
            sourceNodeId: element.id,
          },
        )

        // 逻辑：计算 LoadingNode 放置位置 — 源节点右侧堆叠。
        const [loadingW, loadingH] = DEFAULT_NODE_SIZE
        const existingOutputs = engine.doc
          .getElements()
          .filter((el: any) => el.kind === 'connector')
          .reduce<Array<[number, number, number, number]>>((rects, connector: any) => {
            if (
              !('elementId' in connector.source) ||
              connector.source.elementId !== element.id
            ) {
              return rects
            }
            if (!('elementId' in connector.target)) return rects
            const targetEl = engine.doc.getElementById(connector.target.elementId)
            if (!targetEl || targetEl.kind !== 'node') return rects
            return [...rects, targetEl.xywh]
          }, [])

        const placement = resolveDirectionalStackPlacement(
          element.xywh,
          existingOutputs,
          {
            direction: 'right',
            sideGap: 60,
            stackGap: 16,
            outputSize: [loadingW, loadingH],
          },
        )
        const x = placement
          ? placement.x
          : element.xywh[0] + element.xywh[2] + 60
        const y = placement ? placement.y : element.xywh[1]

        const loadingNodeId = engine.addNodeElement(
          'loading',
          {
            taskId: result.taskId,
            taskType: 'image_generate',
            sourceNodeId: element.id,
            promptText: params.prompt,
            chatModelId: params.modelId,
            projectId: fileContext?.projectId ?? '',
            saveDir: fileContext?.boardFolderUri
              ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
              : '',
          },
          [x, y, loadingW, loadingH],
        )

        // 逻辑：创建从源节点到 LoadingNode 的连线。
        if (loadingNodeId) {
          engine.addConnectorElement(
            {
              source: { elementId: element.id },
              target: { elementId: loadingNodeId },
              style: engine.getConnectorStyle(),
            },
            { skipHistory: true, select: false },
          )
        }
      } catch (error) {
        console.error('[ImageNode] image generation failed:', error)
      }
    },
    [engine, element.id, element.xywh, fileContext],
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
        if (element.props.naturalWidth <= 1 || element.props.naturalHeight <= 1) {
          patch.naturalWidth = payload.props.naturalWidth;
          patch.naturalHeight = payload.props.naturalHeight;
        }
        if (!element.props.mimeType && payload.props.mimeType) {
          patch.mimeType = payload.props.mimeType;
        }
        if (!element.props.fileName && payload.props.fileName) {
          patch.fileName = payload.props.fileName;
        }
        if (Object.keys(patch).length > 0) {
          engine.doc.updateNodeProps(nodeId, patch);
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

  return (
    <NodeFrame ref={rootRef}>
      <div
        className={[
          "relative h-full w-full overflow-hidden rounded-lg box-border",
        ].join(" ")}
        onPointerDownCapture={event => {
          if (isLocked) return;
          if (event.button !== 0) return;
          // 逻辑：按下时先展示输入框，避免选中置顶导致 click 丢失。
          setShowDetail(true);
        }}
        onDoubleClick={event => {
          event.stopPropagation();
          // 逻辑：展开态不触发预览，因为此时双击可能是编辑面板内的操作。
          if (expanded) return;
          if (isImageError || (!hasPreview && !isPreviewLoading && !isTranscoding)) {
            requestReplaceImage();
          } else {
            requestPreview();
          }
        }}
      >
        {hasPreview && !isImageError ? (
          <>
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
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-ol-divider bg-ol-surface-muted">
            {isPreviewLoading || isTranscoding ? (
              <ImageNodeSkeleton />
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
          <ImageAiPanel
            element={element}
            onUpdate={onUpdate}
            upstreamText={upstream?.textList.join('\n')}
            upstreamImages={resolvedUpstreamImages}
            onGenerate={handleGenerate}
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
      modelId: z.string(),
      prompt: z.string(),
      negativePrompt: z.string().optional(),
      style: z.string().optional(),
      aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
      inputNodeIds: z.array(z.string()).optional(),
      taskId: z.string().optional(),
      generatedAt: z.number().optional(),
      results: z.array(z.object({
        previewSrc: z.string(),
        originalSrc: z.string(),
      })).optional(),
      selectedIndex: z.number().optional(),
    }).optional(),
  }),
  defaultProps: {
    previewSrc: "",
    originalSrc: "",
    mimeType: "image/png",
    fileName: "Image",
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
