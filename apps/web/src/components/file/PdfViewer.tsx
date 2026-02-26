/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { StackHeader } from "@/components/layout/StackHeader";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { fetchBlobFromUri, isPreviewTooLargeError } from "@/lib/image/uri";
import {
  formatSize,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";

import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

interface PdfViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** Render a PDF preview panel. */
export default function PdfViewer({
  uri,
  openUri,
  name,
  projectId,
  rootUri,
  panelKey,
  tabId,
}: PdfViewerProps) {
  // 逻辑：仅在 stack 面板场景下展示最小化/关闭按钮。
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewError, setPreviewError] = useState<{
    kind: "too-large";
    sizeBytes?: number;
  } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const removeStackItem = useTabRuntime((s) => s.removeStackItem);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingScaleRef = useRef(scale);

  useEffect(() => {
    if (!uri) {
      setData(null);
      setStatus("idle");
      setPreviewError(null);
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri)) {
      let aborted = false;
      const run = async () => {
        setStatus("loading");
        setPreviewError(null);
        try {
          const blob = await fetchBlobFromUri(uri, { projectId });
          const buffer = await blob.arrayBuffer();
          if (aborted) return;
          setData(new Uint8Array(buffer));
          setStatus("ready");
        } catch (error) {
          if (aborted) return;
          if (isPreviewTooLargeError(error)) {
            setPreviewError({ kind: "too-large", sizeBytes: error.sizeBytes });
          }
          setData(null);
          setStatus("error");
        }
      };
      void run();
      return () => {
        aborted = true;
      };
    }
    setData(null);
    setStatus("error");
    setPreviewError(null);
    return;
  }, [projectId, uri]);

  /** Open the current PDF with system default application. */
  const handleOpenWithSystem = () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!rootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[[^\]]+\]\/?(.*)$/);
      const relativePath = scopedMatch ? scopedMatch[1] ?? "" : trimmedUri;
      return resolveFileUriFromRoot(rootUri, relativePath);
    })();
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    if (!resolvedUri) {
      toast.error("未找到文件路径");
      return;
    }
    void api.openPath({ uri: resolvedUri }).then((res) => {
      if (!res?.ok) {
        toast.error(res?.reason ?? "无法打开文件");
      }
    });
  };

  const displayTitle = useMemo(() => name ?? uri ?? "PDF", [name, uri]);
  const documentFile = useMemo(() => (data ? { data } : null), [data]);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择PDF</div>;
  }

  if (status === "loading") {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (status === "error") {
    if (previewError?.kind === "too-large") {
      const sizeLabel = formatSize(previewError.sizeBytes);
      return (
        <div className="flex h-full w-full flex-col items-start gap-3 p-4 text-sm text-muted-foreground">
          <div>文件过大（{sizeLabel}），请使用系统工具打开</div>
          {openUri ? (
            <Button type="button" size="sm" variant="outline" onClick={handleOpenWithSystem}>
              系统打开
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="h-full w-full p-4 text-destructive">
        PDF 预览失败
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri}
        openRootUri={rootUri}
        rightSlot={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="缩小"
              onClick={() => setScale((prev) => Math.max(0.6, prev - 0.1))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="放大"
              onClick={() => setScale((prev) => Math.min(2.5, prev + 0.1))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        }
        showMinimize={canMinimize}
        onMinimize={
          canMinimize
            ? () => {
                requestStackMinimize(tabId!);
              }
            : undefined
        }
        onClose={
          canClose
            ? () => {
                removeStackItem(tabId!, panelKey!);
              }
            : undefined
        }
      />
      <div
        className="flex-1 overflow-auto p-4"
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          const delta = event.deltaY;
          const next = delta > 0 ? pendingScaleRef.current - 0.08 : pendingScaleRef.current + 0.08;
          pendingScaleRef.current = Math.min(2.5, Math.max(0.6, next));
          if (zoomFrameRef.current) return;
          // 中文注释：触控板缩放使用 rAF 合并更新，减少频繁重渲染。
          zoomFrameRef.current = requestAnimationFrame(() => {
            setScale(pendingScaleRef.current);
            zoomFrameRef.current = null;
          });
        }}
      >
        {documentFile ? (
          <div className="flex justify-center">
            <Document
              file={documentFile}
              loading={<div className="text-sm text-muted-foreground">加载中…</div>}
              onLoadSuccess={(info) => {
                setNumPages(info.numPages);
              }}
            >
              {Array.from({ length: numPages || 0 }, (_, index) => (
                <Page
                  key={`page-${index + 1}`}
                  pageNumber={index + 1}
                  scale={scale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              ))}
            </Document>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">无法预览该文件</div>
        )}
      </div>
    </div>
  );
}
