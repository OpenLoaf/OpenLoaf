import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback } from "react";
import { z } from "zod";
import { Download, Info } from "lucide-react";
import { useBoardContext } from "../core/BoardProvider";

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

/** Trigger a download for the original image. */
function downloadOriginalImage(props: ImageNodeProps) {
  const link = document.createElement("a");
  link.href = props.originalSrc;
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
  const previewSrc = element.props.previewSrc;
  const hasPreview = Boolean(previewSrc);
  /** Board actions for preview requests. */
  const { actions } = useBoardContext();
  /** Request opening the image preview on the canvas. */
  const requestPreview = useCallback(() => {
    // 逻辑：节点双击触发预览，由 board action 统一接管显示。
    actions.openImagePreview({
      originalSrc: element.props.originalSrc,
      previewSrc,
      fileName: element.props.fileName,
    });
  }, [actions, element.props.fileName, element.props.originalSrc, previewSrc]);

  return (
    <>
      <div
        className={[
          "relative h-full w-full overflow-hidden box-border",
          "bg-slate-100 dark:bg-slate-900",
          selected ? "shadow-[0_8px_18px_rgba(15,23,42,0.18)]" : "shadow-none",
        ].join(" ")}
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
    </>
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
    minSize: { w: 160, h: 120 },
    maxSize: { w: 960, h: 720 },
  },
  // 逻辑：图片节点提供下载/复制原图入口，保持编辑与导出分离。
  toolbar: ctx => createImageToolbarItems(ctx),
};
