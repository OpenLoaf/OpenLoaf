/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { StackHeader } from "@/components/layout/StackHeader";
import { useLayoutState } from "@/hooks/use-layout-state";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { fetchBlobFromUri, isPreviewTooLargeError } from "@/lib/image/uri";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PdfViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  /** Chat session id — required when uri contains ${CURRENT_CHAT_DIR} template. */
  sessionId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// 扫描件 / CJK PDF 依赖 cmaps + standard_fonts 做字体回退；
// 资源由 apps/web/scripts/copy-pdfjs-assets.mjs 从 pdfjs-dist 复制到 public/pdfjs/，
// 此处把 URL 固化为 Document options，避免每次渲染生成新引用触发重载。
const PDFJS_DOCUMENT_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
} as const;

/** Render a PDF preview panel. */
export default function PdfViewer({
  uri,
  openUri,
  name,
  projectId,
  sessionId,
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
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const removeStackItem = useLayoutState((s) => s.removeStackItem);
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
        setErrorMessage("");
        try {
          const blob = await fetchBlobFromUri(uri, { projectId, sessionId });
          const buffer = await blob.arrayBuffer();
          if (aborted) return;
          setData(new Uint8Array(buffer));
          setStatus("ready");
        } catch (error) {
          if (aborted) return;
          if (isPreviewTooLargeError(error)) {
            setPreviewError({ kind: "too-large", sizeBytes: error.sizeBytes });
          }
          const detail = error instanceof Error ? error.message : String(error);
          // 暴露真实错误（fetch 状态 / too-large / 网络错误），避免用户只看到「PDF 预览失败」
          // 的模糊提示。react-pdf 自身的解析失败由 Document.onLoadError 另行捕获。
          setErrorMessage(detail || "PDF 获取失败");
          // Error 实例的属性不可枚举，必须作为独立位置参数传给 console.error
          // 才能让 devtools 展开 stack，否则会被序列化成 {}。
          console.error("[PdfViewer] fetch failed:", error);
          console.error("[PdfViewer] context:", {
            uri,
            projectId,
            sessionId,
            message: detail,
            stack: error instanceof Error ? error.stack : undefined,
          });
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
    setErrorMessage(`不支持的 URI scheme: ${uri}`);
    setPreviewError(null);
    return;
  }, [projectId, sessionId, uri]);

  /** Open the current PDF with system default application. */
  const handleOpenWithSystem = () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!rootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[\[[^\]]+\]\/?(.*?)\]$/);
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

  const stackHeader = (
    <StackHeader
      title={displayTitle}
      openUri={openUri}
      openRootUri={rootUri}
      rightSlot={
        status === "ready" ? (
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
        ) : undefined
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
              removeStackItem(panelKey!);
            }
          : undefined
      }
    />
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {stackHeader}
      <ViewerGuard
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        loading={status === "loading"}
        error={status === "error"}
        tooLarge={previewError?.kind === "too-large"}
        errorMessage="PDF 预览失败"
        errorDescription={errorMessage || "请检查文件格式或权限后重试。"}
      >
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
              options={PDFJS_DOCUMENT_OPTIONS}
              loading={<div className="text-sm text-muted-foreground">加载中…</div>}
              onLoadSuccess={(info) => {
                setNumPages(info.numPages);
              }}
              onLoadError={(error) => {
                // 扫描件/损坏的 PDF 会在 pdf.js 解析阶段才出错，此处捕获后转入 error 态
                // 并把真实异常带到 UI，避免只看到空白文档。
                const detail = error instanceof Error ? error.message : String(error);
                console.error("[PdfViewer] pdf.js parse failed", { uri, error });
                setErrorMessage(detail || "PDF 解析失败");
                setStatus("error");
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
      </ViewerGuard>
    </div>
  );
}
