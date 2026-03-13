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
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  PdfViewerComponent,
  Toolbar as PdfToolbar,
  Magnification,
  Navigation,
  Annotation,
  TextSelection,
  TextSearch,
  FormFields,
  FormDesigner,
  Print,
  Inject,
} from "@syncfusion/ej2-react-pdfviewer";
import PdfViewer from "@/components/file/PdfViewer";
import { StackHeader } from "@/components/layout/StackHeader";
import { useLayoutState } from "@/hooks/use-layout-state";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { fetchBlobFromUri, isPreviewTooLargeError } from "@/lib/image/uri";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";
import { hasSyncfusionPublicLicense } from "@/lib/syncfusion-license";

interface SyncPdfViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

/** Convert ArrayBuffer to base64 string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Render a PDF preview panel using Syncfusion PDF Viewer (standalone WASM mode). */
export default function SyncPdfViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
}: SyncPdfViewerProps) {
  if (!hasSyncfusionPublicLicense) {
    return (
      <PdfViewer
        uri={uri}
        openUri={openUri}
        name={name}
        ext={ext}
        projectId={projectId}
        rootUri={rootUri}
        panelKey={panelKey}
        tabId={tabId}
      />
    );
  }

  return (
    <LicensedSyncPdfViewer
      uri={uri}
      openUri={openUri}
      name={name}
      ext={ext}
      projectId={projectId}
      rootUri={rootUri}
      panelKey={panelKey}
      tabId={tabId}
    />
  );
}

/** Render the Syncfusion PDF viewer when a public web license is available. */
function LicensedSyncPdfViewer({
  uri,
  openUri,
  name,
  projectId,
  rootUri,
  panelKey,
  tabId,
}: SyncPdfViewerProps) {
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewError, setPreviewError] = useState<{
    kind: "too-large";
    sizeBytes?: number;
  } | null>(null);
  const removeStackItem = useLayoutState((s) => s.removeStackItem);
  const viewerRef = useRef<PdfViewerComponent | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!uri) {
      setBase64Data(null);
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
          setBase64Data(arrayBufferToBase64(buffer));
          setStatus("ready");
        } catch (error) {
          if (aborted) return;
          if (isPreviewTooLargeError(error)) {
            setPreviewError({ kind: "too-large", sizeBytes: error.sizeBytes });
          }
          setBase64Data(null);
          setStatus("error");
        }
      };
      void run();
      return () => {
        aborted = true;
      };
    }
    setBase64Data(null);
    setStatus("error");
    setPreviewError(null);
    return;
  }, [projectId, uri]);

  /** Open PDF with system default application. */
  const handleOpenWithSystem = () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!rootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\{\[[^\]]+\]\/?(.*)?\}$/);
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
  const isDark = resolvedTheme === "dark";

  const stackHeader = (
    <StackHeader
      title={displayTitle}
      openUri={openUri}
      openRootUri={rootUri}
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

  const showGuard = !uri || status === "error" || previewError?.kind === "too-large";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {stackHeader}
      {showGuard ? (
        <ViewerGuard
          uri={uri}
          name={name}
          projectId={projectId}
          rootUri={rootUri}
          error={status === "error"}
          tooLarge={previewError?.kind === "too-large"}
          errorMessage="PDF 预览失败"
          errorDescription="请检查文件格式或权限后重试。"
        >
          <div />
        </ViewerGuard>
      ) : (
        <div className={`relative flex-1 overflow-hidden ${isDark ? "e-dark" : ""}`}>
          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
              加载中…
            </div>
          ) : null}
          {base64Data ? (
            <PdfViewerComponent
              ref={(el: PdfViewerComponent | null) => { viewerRef.current = el; }}
              resourceUrl="/syncfusion/"
              documentPath={`data:application/pdf;base64,${base64Data}`}
              style={{ height: "100%", width: "100%" }}
              enableToolbar
              enableNavigation
              enableTextSearch
              enableAnnotation
              enablePrint
            >
              <Inject
                services={[
                  PdfToolbar,
                  Magnification,
                  Navigation,
                  Annotation,
                  TextSelection,
                  TextSearch,
                  FormFields,
                  FormDesigner,
                  Print,
                ]}
              />
            </PdfViewerComponent>
          ) : null}
        </div>
      )}
    </div>
  );
}
