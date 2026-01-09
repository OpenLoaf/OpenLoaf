import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Download, Info } from "lucide-react";
import { useBoardContext } from "../core/BoardProvider";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { ImageNodeInput } from "./ImageNodeInput";

export type ImageNodeProps = {
  /** Compressed preview for rendering on the canvas. */
  previewSrc: string;
  /** Original image data url used for download/copy actions. */
  originalSrc: string;
  /** MIME type for the original image. */
  mimeType: string;
  /** Suggested file name for downloads. */
  fileName: string;
  /** Original image width in pixels. */
  naturalWidth: number;
  /** Original image height in pixels. */
  naturalHeight: number;
};

/** Resolve image uri to a browser-friendly source. */
function resolveImageSource(uri: string) {
  if (!uri) return "";
  if (uri.startsWith("teatime-file://./")) return "";
  if (uri.startsWith("teatime-file://")) return getPreviewEndpoint(uri);
  return uri;
}

/** Trigger a download for the original image. */
function downloadOriginalImage(props: ImageNodeProps) {
  const href = resolveImageSource(props.originalSrc);
  if (!href) return;
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
      onSelect: () => downloadOriginalImage(ctx.element.props),
    },
    {
      id: "inspect",
      label: "详情",
      icon: <Info size={14} />,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

/** Render an image node using a compressed preview bitmap. */
export function ImageNodeView({
  element,
  selected,
}: CanvasNodeViewProps<ImageNodeProps>) {
  const previewSrc =
    element.props.previewSrc || resolveImageSource(element.props.originalSrc);
  const hasPreview = Boolean(previewSrc);
  /** Board actions for preview requests. */
  const { actions, engine } = useBoardContext();
  /** Local flag for displaying the inline input. */
  const [showInput, setShowInput] = useState(false);
  /** Whether the node or canvas is locked. */
  const isLocked = engine.isLocked() || element.locked === true;
  /** Request opening the image preview on the canvas. */
  const requestPreview = useCallback(() => {
    const originalSrc = element.props.originalSrc;
    const isRelativeTeatime = originalSrc.startsWith("teatime-file://./");
    // 逻辑：ImageViewer 仅支持特定协议，相对路径与其他来源回退到压缩预览图。
    const canUseOriginal =
      !isRelativeTeatime &&
      (originalSrc.startsWith("teatime-file://") ||
        originalSrc.startsWith("data:") ||
        originalSrc.startsWith("blob:") ||
        originalSrc.startsWith("file://"));
    const resolvedOriginal = canUseOriginal ? originalSrc : "";
    // 逻辑：没有可用地址时不弹出预览，避免空白页面。
    if (!resolvedOriginal && !previewSrc) return;
    // 逻辑：点击图片触发预览，由 board action 统一接管显示。
    actions.openImagePreview({
      originalSrc: resolvedOriginal,
      previewSrc,
      fileName: element.props.fileName,
      mimeType: element.props.mimeType,
    });
  }, [
    actions,
    element.props.fileName,
    element.props.mimeType,
    element.props.originalSrc,
    previewSrc,
  ]);

  useEffect(() => {
    if (!selected || isLocked) {
      // 逻辑：未选中或锁定状态时收起输入框。
      setShowInput(false);
    }
  }, [isLocked, selected]);

  return (
    <div className="relative h-full w-full">
      <div
        className={[
          "relative h-full w-full overflow-hidden rounded-sm box-border",
          selected ? "shadow-[0_8px_18px_rgba(15,23,42,0.18)]" : "shadow-none",
        ].join(" ")}
        onClick={() => {
          if (isLocked) return;
          // 逻辑：点击图片节点后展示输入框。
          setShowInput(true);
        }}
        onDoubleClick={event => {
          event.stopPropagation();
          requestPreview();
        }}
      >
        {hasPreview ? (
          <img
            src={previewSrc}
            alt={element.props.fileName || "Image"}
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
            Image
          </div>
        )}
      </div>
      {showInput ? (
        <div
          className="absolute left-1/2 top-full mt-3 -translate-x-1/2"
          data-board-editor
          onPointerDown={event => {
            // 逻辑：阻止画布接管输入区域的拖拽与选择。
            event.stopPropagation();
          }}
        >
          <ImageNodeInput />
        </div>
      ) : null}
    </div>
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
  }),
  defaultProps: {
    previewSrc: "",
    originalSrc: "",
    mimeType: "image/png",
    fileName: "Image",
    naturalWidth: 1,
    naturalHeight: 1,
  },
  view: ImageNodeView,
  capabilities: {
    resizable: true,
    resizeMode: "uniform",
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 120, h: 90 },
    maxSize: { w: 960, h: 720 },
  },
  // 逻辑：图片节点提供下载/复制原图入口，保持编辑与导出分离。
  toolbar: ctx => createImageToolbarItems(ctx),
};
