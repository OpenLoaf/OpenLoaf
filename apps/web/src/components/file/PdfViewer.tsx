"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StackHeader } from "@/components/layout/StackHeader";
import { useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { getPreviewEndpoint } from "@/lib/image/uri";

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
  const [data, setData] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const removeStackItem = useTabs((s) => s.removeStackItem);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingScaleRef = useRef(scale);

  useEffect(() => {
    if (!uri) {
      setData(null);
      setStatus("idle");
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri)) {
      const controller = new AbortController();
      const run = async () => {
        setStatus("loading");
        try {
          const endpoint = getPreviewEndpoint(uri, { projectId });
          const res = await fetch(endpoint, { signal: controller.signal });
          if (!res.ok) throw new Error("preview failed");
          const buffer = await res.arrayBuffer();
          if (controller.signal.aborted) return;
          setData(new Uint8Array(buffer));
          setStatus("ready");
        } catch {
          if (controller.signal.aborted) return;
          setData(null);
          setStatus("error");
        }
      };
      void run();
      return () => controller.abort();
    }
    setData(null);
    setStatus("error");
    return;
  }, [projectId, uri]);

  const displayTitle = useMemo(() => name ?? uri ?? "PDF", [name, uri]);
  const documentFile = useMemo(() => (data ? { data } : null), [data]);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择PDF</div>;
  }

  if (status === "loading") {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (status === "error") {
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
        showMinimize
        onMinimize={() => {
          if (!tabId) return;
          requestStackMinimize(tabId);
        }}
        onClose={() => {
          if (!tabId || !panelKey) return;
          removeStackItem(tabId, panelKey);
        }}
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
