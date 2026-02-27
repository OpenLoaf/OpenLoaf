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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  Download,
  Info,
  Play,
  Sparkles,
} from "lucide-react";
import { useBoardContext } from "../core/BoardProvider";
import { buildImageNodePayloadFromUri } from "../utils/image";
import { ImageNodeDetail } from "./ImageNodeDetail";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "./imagePromptGenerate";
import { IMAGE_GENERATE_NODE_TYPE } from "./imageGenerate";
import { VIDEO_GENERATE_NODE_TYPE } from "./videoGenerate";
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
import { IMAGE_NODE_MAX_SIZE, IMAGE_NODE_MIN_SIZE } from "./node-config";

/** Max bytes for image node preview fetches. */
const IMAGE_NODE_PREVIEW_MAX_BYTES = 100 * 1024;

/** Render a checkerboard skeleton for image nodes. */
function ImageNodeSkeleton() {
  return (
    <div
      className="h-full w-full animate-pulse"
      style={{
        backgroundColor: "#f8fafc",
        backgroundImage:
          "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0)",
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
  return getPreviewEndpoint(projectPath, { projectId: fileContext?.projectId });
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
  return [
    {
      id: "download",
      label: "下载",
      icon: <Download size={14} />,
      onSelect: () => void downloadOriginalImage(ctx.element.props, ctx.fileContext),
    },
    {
      id: "inspect",
      label: "详情",
      icon: <Info size={14} />,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

/** Connector templates offered by the image node. */
const IMAGE_NODE_CONNECTOR_TEMPLATES: CanvasConnectorTemplateDefinition[] = [
  {
    id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    label: "图片提示词",
    description: "分析图片并生成描述",
    size: [320, 220],
    icon: <Sparkles size={14} />,
    createNode: () => ({
      type: IMAGE_PROMPT_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
  {
    id: IMAGE_GENERATE_NODE_TYPE,
    label: "图片生成",
    description: "输入图片与文字生成新图",
    size: [320, 260],
    icon: <Sparkles size={14} />,
    createNode: () => ({
      type: IMAGE_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
  {
    id: VIDEO_GENERATE_NODE_TYPE,
    label: "生成视频",
    description: "基于图片与提示词生成视频",
    size: [360, 280],
    icon: <Play size={14} />,
    createNode: () => ({
      type: VIDEO_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

/** Render an image node using a compressed preview bitmap. */
export function ImageNodeView({
  element,
  selected,
}: CanvasNodeViewProps<ImageNodeProps>) {
  /** Guard against repeated hydration requests. */
  const hydrationRef = useRef<string | null>(null);
  const { actions, engine, fileContext } = useBoardContext();
  const previewSrc =
    element.props.previewSrc ||
    resolveImageSource(element.props.originalSrc, fileContext);
  const hasPreview = Boolean(previewSrc);
  const isTranscoding = element.props.isTranscoding === true;
  const transcodingLabel = element.props.transcodingLabel || "转码中";
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
  const lastPreviewRef = useRef<string>("");
  /** Whether the node or canvas is locked. */
  const isLocked = engine.isLocked() || element.locked === true;
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
      return;
    }
    if (previewSrc !== lastPreviewRef.current) {
      lastPreviewRef.current = previewSrc;
      setIsImageLoading(true);
    }
  }, [previewSrc]);

  return (
    <NodeFrame ref={rootRef}>
      <div
        className={[
          "relative h-full w-full overflow-hidden rounded-sm box-border",
        ].join(" ")}
        onPointerDownCapture={event => {
          if (isLocked) return;
          if (event.button !== 0) return;
          // 逻辑：按下时先展示输入框，避免选中置顶导致 click 丢失。
          setShowDetail(true);
        }}
        onDoubleClick={event => {
          event.stopPropagation();
          requestPreview();
        }}
      >
        {hasPreview ? (
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
              onError={() => setIsImageLoading(false)}
            />
            {isImageLoading ? (
              <div className="absolute inset-0">
                <ImageNodeSkeleton />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
            {isPreviewLoading || isTranscoding ? (
              <ImageNodeSkeleton />
            ) : (
              "Image"
            )}
          </div>
        )}
        {isTranscoding ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 text-xs text-slate-600">
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
  }),
  defaultProps: {
    previewSrc: "",
    originalSrc: "",
    mimeType: "image/png",
    fileName: "Image",
    naturalWidth: 1,
    naturalHeight: 1,
    isTranscoding: false,
    transcodingLabel: "转码中",
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
  connectorTemplates: () => IMAGE_NODE_CONNECTOR_TEMPLATES,
  // 逻辑：图片节点提供下载/复制原图入口，保持编辑与导出分离。
  toolbar: ctx => createImageToolbarItems(ctx),
};
