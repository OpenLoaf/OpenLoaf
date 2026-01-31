import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { Copy, ExternalLink } from "lucide-react";
import { openLinkInStack as openLinkInStackAction } from "./lib/link-actions";
import { useBoardContext } from "../core/BoardProvider";
import WebStackWidget from "@/components/desktop/widgets/WebStackWidget";
import type { DesktopWidgetItem } from "@/components/desktop/types";
import { NodeFrame } from "./NodeFrame";

export type LinkNodeProps = {
  /** Destination URL. */
  url: string;
  /** Title text shown in card mode. */
  title: string;
  /** Description text shown in card mode. */
  description: string;
  /** Logo URL for title/card mode. */
  logoSrc: string;
  /** Preview image URL for card mode. */
  imageSrc: string;
  /** Refresh token used to trigger reloads. */
  refreshToken: number;
};

const WEB_STACK_CONSTRAINTS: DesktopWidgetItem["constraints"] = {
  defaultW: 4,
  defaultH: 2,
  minW: 1,
  minH: 1,
  maxW: 4,
  maxH: 4,
};

/** Build toolbar items for link nodes. */
function createLinkToolbarItems(ctx: CanvasToolbarContext<LinkNodeProps>) {
  return [
    {
      id: "open",
      label: "打开",
      icon: <ExternalLink size={14} />,
      onSelect: () => {
        openLinkInStackAction({ url: ctx.element.props.url, title: ctx.element.props.title });
      },
    },
    {
      id: "copy-url",
      label: "复制URL",
      icon: <Copy size={14} />,
      onSelect: () => {
        const targetUrl = ctx.element.props.url;
        if (!targetUrl) return;
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(targetUrl);
          return;
        }
        if (typeof document !== "undefined") {
          const textarea = document.createElement("textarea");
          textarea.value = targetUrl;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          try {
            document.execCommand("copy");
          } catch {
            // 逻辑：剪贴板失败时保持静默，避免影响主流程。
          } finally {
            document.body.removeChild(textarea);
          }
        }
      },
    },
  ];
}

/** Render a link node with different display modes. */
export function LinkNodeView({
  element,
  selected,
  onUpdate: _onUpdate,
}: CanvasNodeViewProps<LinkNodeProps>) {
  const { fileContext } = useBoardContext();
  const { url, title, description, imageSrc, logoSrc } = element.props;
  let displayHost = url;
  try {
    displayHost = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw URL when parsing fails.
  }
  const displayTitle = title || displayHost || url;
  const previewItem = useMemo<DesktopWidgetItem>(
    () => ({
      id: element.id,
      kind: "widget",
      widgetKey: "web-stack",
      size: "4x2",
      constraints: WEB_STACK_CONSTRAINTS,
      title: displayTitle,
      layout: { x: 0, y: 0, w: 4, h: 2 },
      webUrl: url,
      webTitle: title,
      webDescription: description,
      webLogo: logoSrc,
      webPreview: imageSrc,
      webMetaStatus: "ready",
    }),
    [description, displayTitle, element.id, imageSrc, logoSrc, title, url]
  );
  /** Open the link in the current tab's browser stack. */
  const openLinkInStack = useCallback(() => {
    openLinkInStackAction({ url, title: displayTitle });
  }, [displayTitle, url]);

  return (
    <NodeFrame
      className={[
        selected ? "ring-2 ring-primary/30 shadow-[0_10px_24px_rgba(15,23,42,0.18)]" : "",
      ].join(" ")}
      onDoubleClick={(event) => {
        event.stopPropagation();
        openLinkInStack();
      }}
    >
      {/* 中文注释：LinkNode 复用 WebStackWidget 预览卡片样式。 */}
      <WebStackWidget
        item={previewItem}
        projectId={fileContext?.projectId}
        workspaceId={fileContext?.workspaceId}
        onOpen={openLinkInStack}
      />
    </NodeFrame>
  );
}

/** Definition for the link node. */
export const LinkNodeDefinition: CanvasNodeDefinition<LinkNodeProps> = {
  type: "link",
  schema: z.object({
    url: z.string(),
    title: z.string(),
    description: z.string(),
    logoSrc: z.string(),
    imageSrc: z.string(),
    refreshToken: z.number(),
  }),
  defaultProps: {
    url: "",
    title: "",
    description: "",
    logoSrc: "",
    imageSrc: "",
    refreshToken: 0,
  },
  view: LinkNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 300, h: 120 },
    maxSize: { w: 720, h: 120 },
  },
  // Link nodes expose refresh actions in the selection toolbar.
  toolbar: ctx => createLinkToolbarItems(ctx),
};
