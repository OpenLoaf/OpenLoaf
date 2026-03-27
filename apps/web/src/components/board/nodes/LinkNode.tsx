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
  CanvasToolbarItem,
} from "../engine/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Copy, ExternalLink, Link, Pencil } from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import {
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_DEFAULT,
  BOARD_TOOLBAR_ITEM_GREEN,
} from "../ui/board-style-system";
import type { LinkNodeProps } from "../board-contracts";
import { openLinkInStack as openLinkInStackAction } from "./lib/link-actions";
import { useBoardContext } from "../core/BoardProvider";
import WebStackWidget from "@/components/desktop/widgets/WebStackWidget";
import type { DesktopWidgetItem } from "@/components/desktop/types";
import { NodeFrame } from "./NodeFrame";
import { fetchWebMeta } from "@/lib/web-meta";
export type { LinkNodeProps } from "../board-contracts";

const WEB_STACK_CONSTRAINTS: DesktopWidgetItem["constraints"] = {
  defaultW: 4,
  defaultH: 2,
  minW: 1,
  minH: 1,
  maxW: 4,
  maxH: 4,
};

/** Inline URL edit panel rendered inside toolbar dropdown. */
function LinkUrlEditPanel({
  currentUrl,
  onSubmit,
  closePanel,
}: {
  currentUrl: string;
  onSubmit: (url: string) => void;
  closePanel: () => void;
}) {
  const { t } = useTranslation("board");
  const [value, setValue] = useState(currentUrl);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    closePanel();
  };

  return (
    <div
      className="flex items-center gap-2 p-2"
      data-board-editor
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        type="url"
        className="min-w-[240px] rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-ol-focus-border"
        placeholder={t("linkNode.urlPlaceholder")}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        type="button"
        className="shrink-0 rounded-lg bg-foreground/8 px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-foreground/12 disabled:opacity-40"
        disabled={!value.trim()}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleSubmit();
        }}
      >
        {t("linkNode.urlSubmit")}
      </button>
    </div>
  );
}

/** Build toolbar items for link nodes. */
function createLinkToolbarItems(ctx: CanvasToolbarContext<LinkNodeProps>) {
  const t = (k: string) => i18next.t(k);
  const hasUrl = Boolean(ctx.element.props.url);
  const items: CanvasToolbarItem[] = [];

  if (hasUrl) {
    items.push({
      id: 'open',
      label: t('board:linkNode.toolbar.open'),
      icon: <ExternalLink size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => {
        openLinkInStackAction({ url: ctx.element.props.url, title: ctx.element.props.title });
      },
    });
    items.push({
      id: 'copy-url',
      label: t('board:linkNode.toolbar.copyUrl'),
      icon: <Copy size={14} />,
      className: BOARD_TOOLBAR_ITEM_GREEN,
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
    });
  }

  items.push({
    id: 'edit-url',
    label: t('board:linkNode.toolbar.editUrl'),
    icon: <Pencil size={14} />,
    className: BOARD_TOOLBAR_ITEM_DEFAULT,
    panel: ({ closePanel }) => (
      <LinkUrlEditPanel
        currentUrl={ctx.element.props.url}
        onSubmit={(url) => {
          let hostname = url;
          try {
            hostname = new URL(url).hostname.replace(/^www\./, "");
          } catch { /* keep raw */ }
          ctx.updateNodeProps({ url, title: hostname || url });
          const rootUri = ctx.fileContext?.rootUri;
          if (rootUri) {
            fetchWebMeta({ url, rootUri }).then((result) => {
              if (!result.ok) return;
              ctx.updateNodeProps({
                title: result.title || hostname || url,
                description: result.description || "",
                logoSrc: result.logoPath ?? "",
                imageSrc: result.previewPath ?? "",
                refreshToken: Date.now(),
              });
            }).catch(() => {});
          }
        }}
        closePanel={closePanel}
      />
    ),
  });

  return items;
}

/** Inline URL input shown when a link node has no URL set. */
function LinkUrlInput({
  onSubmit,
}: {
  onSubmit: (url: string) => void;
}) {
  const { t } = useTranslation("board");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className="flex h-full w-full items-center gap-2 rounded-3xl border border-border bg-card px-3"
      data-board-editor
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Link size={16} className="shrink-0 text-ol-text-auxiliary" />
      <input
        ref={inputRef}
        type="url"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ol-text-auxiliary"
        placeholder={t("linkNode.urlPlaceholder")}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        type="button"
        className="shrink-0 rounded-full bg-foreground/8 dark:bg-foreground/12 px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 hover:bg-foreground/12 dark:hover:bg-foreground/16 disabled:opacity-40"
        disabled={!value.trim()}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleSubmit();
        }}
      >
        {t("linkNode.urlSubmit")}
      </button>
    </div>
  );
}

/** Render a link node with different display modes. */
export function LinkNodeView({
  element,
  onUpdate,
}: CanvasNodeViewProps<LinkNodeProps>) {
  const { fileContext } = useBoardContext();
  const { url, title, description, imageSrc, logoSrc } = element.props;

  const handleUrlSubmit = useCallback(
    (inputUrl: string) => {
      let hostname = inputUrl;
      try {
        hostname = new URL(inputUrl).hostname.replace(/^www\./, "");
      } catch {
        // Keep raw text when URL parsing fails.
      }
      onUpdate({ url: inputUrl, title: hostname || inputUrl });

      const rootUri = fileContext?.rootUri;
      if (rootUri) {
        fetchWebMeta({ url: inputUrl, rootUri }).then((result) => {
          if (!result.ok) return;
          onUpdate({
            title: result.title || hostname || inputUrl,
            description: result.description || "",
            logoSrc: result.logoPath ?? "",
            imageSrc: result.previewPath ?? "",
            refreshToken: Date.now(),
          });
        }).catch(() => {
          // Meta fetch failed — keep basic URL info.
        });
      }
    },
    [fileContext?.rootUri, onUpdate],
  );

  if (!url) {
    return (
      <NodeFrame>
        <LinkUrlInput onSubmit={handleUrlSubmit} />
      </NodeFrame>
    );
  }

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
  return (
    <NodeFrame>
      <WebStackWidget
        item={previewItem}
        projectId={fileContext?.projectId}
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
    resizable: false,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 300, h: 60 },
    maxSize: { w: 720, h: 480 },
  },
  // Link nodes expose refresh actions in the selection toolbar.
  toolbar: ctx => createLinkToolbarItems(ctx),
};
