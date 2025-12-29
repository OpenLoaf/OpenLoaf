import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Copy, ExternalLink, RotateCw } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID, useTabs } from "@/hooks/use-tabs";

/** Default screenshot size for link previews. */
const DEFAULT_PREVIEW_SIZE = { width: 800, height: 450 };

/** Create a unique browser sub-tab id. */
function createBrowserTabId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Build the browser view key for stack entries. */
function buildBrowserViewKey(input: {
  workspaceId: string;
  tabId: string;
  chatSessionId: string;
  browserTabId: string;
}) {
  return `browser:${input.workspaceId}:${input.tabId}:${input.chatSessionId}:${input.browserTabId}`;
}

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
        if (typeof window !== "undefined") {
          const openEvent = new CustomEvent("board-link-open", {
            detail: { id: ctx.element.id },
          });
          window.dispatchEvent(openEvent);
        }
      },
    },
    {
      id: "refresh",
      label: "刷新",
      icon: <RotateCw size={14} />,
      onSelect: () => {
        if (typeof window !== "undefined") {
          const refreshEvent = new CustomEvent("board-link-refresh", {
            detail: { id: ctx.element.id },
          });
          window.dispatchEvent(refreshEvent);
        }
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
  onUpdate,
}: CanvasNodeViewProps<LinkNodeProps>) {
  const { url, title, description, imageSrc, logoSrc } = element.props;
  /** Mutation handler for link preview capture. */
  const captureLinkPreview = useMutation(trpc.linkPreview.capture.mutationOptions());
  /** Track the last screenshot request key. */
  const requestedKeyRef = useRef<string | null>(null);
  /** Track in-flight screenshot requests. */
  const requestInFlightRef = useRef(false);
  /** Keep the latest node props for async updates. */
  const propsRef = useRef({ imageSrc, title, description });
  /** Keep the latest update handler to avoid re-creating callbacks. */
  const onUpdateRef = useRef(onUpdate);
  let displayHost = url;
  try {
    displayHost = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw URL when parsing fails.
  }
  const displayTitle = title || displayHost || url;
  const previewSrc = imageSrc || logoSrc;
  /** Active tab id used for stack operations. */
  const activeTabId = useTabs((state) => state.activeTabId);

  useEffect(() => {
    // 逻辑：同步最新 props，供异步回调判断是否需要更新。
    propsRef.current = { imageSrc, title, description };
  }, [imageSrc, title, description]);

  useEffect(() => {
    // 逻辑：同步最新 onUpdate，避免闭包引用旧方法。
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  /** Open the link in the current tab's browser stack. */
  const openLinkInStack = useCallback(() => {
    if (!url) return;
    const state = useTabs.getState();
    const tabId = activeTabId ?? state.activeTabId;
    if (!tabId) return;
    const tab = state.getTabById(tabId);
    if (!tab) return;

    const viewKey = buildBrowserViewKey({
      workspaceId: tab.workspaceId ?? "unknown",
      tabId,
      chatSessionId: tab.chatSessionId ?? "unknown",
      browserTabId: createBrowserTabId(),
    });

    // 逻辑：双击链接节点时在当前 tab 打开浏览器 stack。
    state.pushStackItem(
      tabId,
      {
        component: BROWSER_WINDOW_COMPONENT,
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        params: { __customHeader: true, __open: { url, title: displayTitle, viewKey } },
      } as any,
      100
    );
  }, [activeTabId, displayTitle, url]);

  /** Request a screenshot from the server. */
  const fetchScreenshot = useCallback(
    async (requestKey: string) => {
      if (!url) return;
      if (requestInFlightRef.current && requestedKeyRef.current === requestKey) return;
      requestInFlightRef.current = true;
      requestedKeyRef.current = requestKey;
      try {
        /** 逻辑：复用请求输入，避免多处拼装参数。 */
        const captureInput = {
          url,
          width: DEFAULT_PREVIEW_SIZE.width,
          height: DEFAULT_PREVIEW_SIZE.height,
          fullPage: false,
        };
        const result = await captureLinkPreview.mutateAsync(captureInput);
        if (!result) return;
        const payload = result as {
          ok?: boolean;
          imageUrl?: string;
          title?: string;
          description?: string;
        };
        if (payload?.ok) {
          const patch: Partial<LinkNodeProps> = {};
          const current = propsRef.current;
          if (payload.imageUrl && current.imageSrc !== payload.imageUrl) {
            patch.imageSrc = payload.imageUrl;
          }
          if (payload.title && payload.title !== current.title) {
            patch.title = payload.title;
          }
          if (payload.description && payload.description !== current.description) {
            patch.description = payload.description;
          }
          if (Object.keys(patch).length > 0) {
            // 逻辑：只在数据有变化时更新节点，避免重复渲染。
            onUpdateRef.current(patch);
          }
        }
      } catch {
        // 逻辑：截图失败时保持静默，避免干扰用户操作。
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [captureLinkPreview, url]
  );

  useEffect(() => {
    if (!url) return;
    /** Listen for manual refresh requests. */
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id || detail.id !== element.id) return;
      void fetchScreenshot(`${url}:manual:${Date.now()}`);
    };
    /** Listen for manual open requests. */
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id || detail.id !== element.id) return;
      // 逻辑：响应工具栏打开事件，复用双击逻辑。
      openLinkInStack();
    };
    window.addEventListener("board-link-refresh", handleRefresh);
    window.addEventListener("board-link-open", handleOpen);
    return () => {
      window.removeEventListener("board-link-refresh", handleRefresh);
      window.removeEventListener("board-link-open", handleOpen);
    };
  }, [url, element.id, fetchScreenshot, openLinkInStack]);

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
