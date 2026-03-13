/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Film, ScanEye, Sparkles, FileText, Type } from "lucide-react";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasPoint } from "../engine/types";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/imageGenerate/constants";
import { VIDEO_GENERATE_NODE_TYPE } from "../nodes/videoGenerate/constants";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/imagePromptGenerate/constants";
import { CHAT_INPUT_NODE_TYPE } from "../nodes/chatInput";
import {
  BOARD_GENERATE_NODE_BASE_IMAGE,
  BOARD_GENERATE_NODE_BASE_VIDEO,
  BOARD_GENERATE_NODE_BASE_PROMPT,
  BOARD_GENERATE_NODE_BASE_CHAT,
  BOARD_GENERATE_BORDER_IMAGE,
  BOARD_GENERATE_BORDER_VIDEO,
  BOARD_GENERATE_BORDER_PROMPT,
  BOARD_GENERATE_BORDER_CHAT,
  BOARD_GENERATE_BTN_IMAGE,
  BOARD_GENERATE_BTN_VIDEO,
  BOARD_GENERATE_BTN_PROMPT,
  BOARD_GENERATE_BTN_CHAT,
  BOARD_GENERATE_PILL_IMAGE,
  BOARD_GENERATE_PILL_VIDEO,
} from "../ui/board-style-system";

/** Node types that have a DOM-based pending insert preview. */
export const PENDING_INSERT_DOM_TYPES = new Set([
  IMAGE_GENERATE_NODE_TYPE,
  VIDEO_GENERATE_NODE_TYPE,
  IMAGE_PROMPT_GENERATE_NODE_TYPE,
  CHAT_INPUT_NODE_TYPE,
  "text",
  "file-attachment",
  "audio",
]);

type NodePreviewConfig = {
  base: string;
  border: string;
  btnClass: string;
  pillClass?: string;
  iconColor: string;
  icon: typeof ImagePlus;
  titleKey: string;
  pillKey?: string;
  btnKey: string;
  showPrompt: boolean;
};

const NODE_PREVIEW_MAP: Record<string, NodePreviewConfig> = {
  [IMAGE_GENERATE_NODE_TYPE]: {
    base: BOARD_GENERATE_NODE_BASE_IMAGE,
    border: BOARD_GENERATE_BORDER_IMAGE,
    btnClass: BOARD_GENERATE_BTN_IMAGE,
    pillClass: BOARD_GENERATE_PILL_IMAGE,
    iconColor: "text-ol-blue",
    icon: ImagePlus,
    titleKey: "imageGenerate.title",
    pillKey: "imageGenerate.mode.textToImage",
    btnKey: "imageGenerate.generate",
    showPrompt: true,
  },
  [VIDEO_GENERATE_NODE_TYPE]: {
    base: BOARD_GENERATE_NODE_BASE_VIDEO,
    border: BOARD_GENERATE_BORDER_VIDEO,
    btnClass: BOARD_GENERATE_BTN_VIDEO,
    pillClass: BOARD_GENERATE_PILL_VIDEO,
    iconColor: "text-ol-purple",
    icon: Film,
    titleKey: "videoGenerate.title",
    pillKey: "videoGenerate.status.idle",
    btnKey: "videoGenerate.generate",
    showPrompt: true,
  },
  [IMAGE_PROMPT_GENERATE_NODE_TYPE]: {
    base: BOARD_GENERATE_NODE_BASE_PROMPT,
    border: BOARD_GENERATE_BORDER_PROMPT,
    btnClass: BOARD_GENERATE_BTN_PROMPT,
    iconColor: "text-ol-amber",
    icon: ScanEye,
    titleKey: "imagePromptGenerate.title",
    btnKey: "imagePromptGenerate.run",
    showPrompt: false,
  },
  [CHAT_INPUT_NODE_TYPE]: {
    base: BOARD_GENERATE_NODE_BASE_CHAT,
    border: BOARD_GENERATE_BORDER_CHAT,
    btnClass: BOARD_GENERATE_BTN_CHAT,
    iconColor: "text-ol-green",
    icon: Sparkles,
    titleKey: "aiToolbar.aiAssistant",
    btnKey: "imagePromptGenerate.run",
    showPrompt: true,
  },
};

/** Extension badge color mapping (matches FileAttachmentNode). */
function getExtBadgeColor(ext?: string): string {
  const normalized = (ext ?? "").toLowerCase();
  if (normalized === "pdf") return "bg-ol-red-bg text-ol-red";
  if (normalized === "docx" || normalized === "doc")
    return "bg-ol-blue-bg text-ol-blue";
  if (normalized === "xlsx" || normalized === "xls" || normalized === "csv")
    return "bg-ol-green-bg text-ol-green";
  if (normalized === "md" || normalized === "txt")
    return "bg-ol-surface-muted text-ol-text-secondary";
  return "bg-ol-purple-bg text-ol-purple";
}

type PendingInsertPreviewProps = {
  engine: CanvasEngine;
  pendingInsert: CanvasInsertRequest;
  pendingInsertPoint: CanvasPoint;
};

/** Render the text node preview. */
function TextNodePreview({ t }: { t: (key: string) => string }) {
  return (
    <div
      className={[
        "flex h-full w-full items-center gap-1.5 rounded-sm outline outline-1 outline-dashed p-2.5",
        "outline-ol-divider bg-background",
        "",
      ].join(" ")}
    >
      <Type size={13} className="shrink-0 text-muted-foreground" />
      <span className="text-[11px] font-medium text-muted-foreground">
        {t("textNode.placeholder")}
      </span>
    </div>
  );
}

/** Render the file attachment node preview. */
function FileNodePreview({
  props,
  t,
}: {
  props: Record<string, unknown>;
  t: (key: string) => string;
}) {
  const fileName = (props.fileName as string) || t("insertTools.file");
  const ext = (props.extension as string) || fileName.split(".").pop()?.toLowerCase() || "";
  const badgeColor = getExtBadgeColor(ext);

  return (
    <div
      className={[
        "flex h-full w-full items-center gap-3 rounded-sm border box-border px-3",
        "border-ol-divider bg-background text-ol-text-primary",
        "",
      ].join(" ")}
    >
      <div className="flex h-10 w-8 shrink-0 items-center justify-center">
        <FileText size={28} className="text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12px] font-medium leading-tight">
          {fileName}
        </span>
        {ext ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none ${badgeColor}`}
            >
              {ext}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Render a DOM-based preview for pending node insertion. */
function PendingInsertPreviewBase({
  engine,
  pendingInsert,
  pendingInsertPoint,
}: PendingInsertPreviewProps) {
  const { t } = useTranslation("board");
  const layerRef = useRef<HTMLDivElement | null>(null);

  const applyTransform = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const { zoom, offset } = engine.getViewState().viewport;
    layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`;
  }, [engine]);

  useEffect(() => {
    applyTransform();
    const unsubscribe = engine.subscribeView(() => applyTransform());
    return unsubscribe;
  }, [engine, applyTransform]);

  const [w, h] = pendingInsert.size ?? [320, 240];
  const x = pendingInsertPoint[0] - w / 2;
  const y = pendingInsertPoint[1] - h / 2;

  // Text node preview
  if (pendingInsert.type === "text") {
    return (
      <div
        ref={layerRef}
        className="pointer-events-none absolute inset-0 origin-top-left"
      >
        <div
          className="absolute"
          style={{ left: x, top: y, width: w, height: h, opacity: 0.75 }}
        >
          <TextNodePreview t={t} />
        </div>
      </div>
    );
  }

  // File attachment / audio node preview
  if (pendingInsert.type === "file-attachment" || pendingInsert.type === "audio") {
    return (
      <div
        ref={layerRef}
        className="pointer-events-none absolute inset-0 origin-top-left"
      >
        <div
          className="absolute"
          style={{ left: x, top: y, width: w, height: h, opacity: 0.75 }}
        >
          <FileNodePreview props={pendingInsert.props} t={t} />
        </div>
      </div>
    );
  }

  // AI node previews
  const config = NODE_PREVIEW_MAP[pendingInsert.type];
  if (!config) return null;

  const previewH = config.showPrompt ? h : undefined;
  const adjustedY = pendingInsertPoint[1] - (previewH ?? h) / 2;
  const Icon = config.icon;

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 origin-top-left"
    >
      <div
        className="absolute"
        style={{ left: x, top: adjustedY, width: w, height: previewH, opacity: 0.82 }}
      >
        <div
          className={[
            "relative flex w-full flex-col gap-3 rounded-xl border p-3 text-ol-text-primary",
            previewH ? "h-full" : "",
            config.base,
            config.border,
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex items-center gap-2">
            <Icon size={16} className={`shrink-0 ${config.iconColor}`} />
            <div className="text-[13px] font-semibold leading-5">
              {t(config.titleKey)}
            </div>
            {config.pillClass && config.pillKey ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] leading-3 ${config.pillClass}`}
              >
                {t(config.pillKey)}
              </span>
            ) : null}
            <div className="flex-1" />
            <span
              className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[12px] leading-none ${config.btnClass}`}
            >
              <Sparkles size={14} className="mr-1" />
              {t(config.btnKey)}
            </span>
          </div>

          {/* Model skeleton */}
          <div className="flex items-center gap-3">
            <div className="text-[12px] text-ol-text-auxiliary">
              {t("imageGenerate.model")}
            </div>
            <div className="h-7 flex-1 rounded-lg bg-black/[0.04] dark:bg-foreground/[0.06]" />
          </div>

          {/* Prompt skeleton (only for image/video generate) */}
          {config.showPrompt ? (
            <div className="flex flex-1 flex-col gap-2">
              <div className="text-[12px] text-ol-text-auxiliary">
                {t("imageGenerate.prompt")}
              </div>
              <div className="flex-1 rounded-lg bg-black/[0.04] dark:bg-foreground/[0.06]" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const PendingInsertPreview = memo(PendingInsertPreviewBase);
