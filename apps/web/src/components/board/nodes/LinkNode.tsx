import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback } from "react";
import { z } from "zod";
import { Copy, ExternalLink } from "lucide-react";
import { openLinkInStack as openLinkInStackAction } from "./lib/link-actions";

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
  const { url, title, description, imageSrc, logoSrc } = element.props;
  let displayHost = url;
  try {
    displayHost = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw URL when parsing fails.
  }
  const displayTitle = title || displayHost || url;
  const previewSrc = imageSrc || logoSrc;
  /** Open the link in the current tab's browser stack. */
  const openLinkInStack = useCallback(() => {
    openLinkInStackAction({ url, title: displayTitle });
  }, [displayTitle, url]);

  return (
    <div
      className={[
        "h-full w-full rounded-sm border box-border",
        "border-slate-200 bg-white text-slate-900",
        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        selected ? "shadow-[0_8px_18px_rgba(15,23,42,0.18)]" : "shadow-none",
      ].join(" ")}
      onDoubleClick={(event) => {
        event.stopPropagation();
        openLinkInStack();
      }}
    >
      <div className="flex h-full w-full">
        <div className="h-full w-32 shrink-0 overflow-hidden rounded-l-xl bg-slate-100 dark:bg-slate-800">
          {previewSrc ? (
            <div className="flex h-full w-full items-center justify-center p-4">
              <img
                src={previewSrc}
                alt={displayTitle}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
              Preview
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {displayTitle}
          </div>
          <div className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
            {description || displayHost}
          </div>
          <div className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
            {url}
          </div>
        </div>
      </div>
    </div>
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
