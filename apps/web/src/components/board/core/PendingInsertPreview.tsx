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
import { FileText, Type } from "lucide-react";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasPoint } from "../engine/types";

/** Node types that have a DOM-based pending insert preview. */
export const PENDING_INSERT_DOM_TYPES = new Set([
  "text",
  "file-attachment",
  "audio",
]);

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

  return null;
}

export const PendingInsertPreview = memo(PendingInsertPreviewBase);
