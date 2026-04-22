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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppWindow, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { loadPresentation, renderSlideToCanvas } from "pptx-viewer";
import type { LoadedPresentation } from "pptx-viewer";
import { Button } from "@openloaf/ui/button";
import { StackHeader } from "@/components/layout/StackHeader";
import { useLayoutState } from "@/hooks/use-layout-state";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { trpc } from "@/utils/trpc";

interface PptxViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  sessionId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

type LoadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; presentation: LoadedPresentation; total: number }
  | { phase: "error"; message: string };

/** Render PPTX slides directly on Canvas via pptx-viewer (no server-side rendering). */
export default function PptxViewer({
  uri,
  openUri,
  name,
  projectId,
  sessionId,
  rootUri,
  panelKey,
  tabId,
}: PptxViewerProps) {
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const removeStackItem = useLayoutState((s) => s.removeStackItem);
  const displayTitle = useMemo(() => name ?? uri ?? "PPTX", [name, uri]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });
  const [scale, setScale] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderVersionRef = useRef(0);
  const presentationRef = useRef<LoadedPresentation | null>(null);

  // 获取 PPTX 二进制数据
  const binaryQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({ uri: uri ?? "", projectId, sessionId }),
    enabled: Boolean(uri),
    staleTime: Infinity,
  });

  // 解析 PPTX
  useEffect(() => {
    if (!binaryQuery.data?.contentBase64) return;

    let cancelled = false;
    const parse = async () => {
      try {
        setLoadState({ phase: "loading" });
        const binary = atob(binaryQuery.data!.contentBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const presentation = await loadPresentation(bytes.buffer as ArrayBuffer);
        if (cancelled) {
          presentation.cleanup();
          return;
        }
        presentationRef.current = presentation;
        setLoadState({ phase: "ready", presentation, total: presentation.slides.length });
      } catch (err) {
        if (!cancelled) {
          setLoadState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    parse();
    return () => { cancelled = true; };
  }, [binaryQuery.data?.contentBase64]);

  // 清理 presentation 资源
  useEffect(() => {
    return () => { presentationRef.current?.cleanup(); };
  }, []);

  // 渲染当前幻灯片到 Canvas
  useEffect(() => {
    if (loadState.phase !== "ready") return;
    const { presentation } = loadState;
    if (currentSlide < 0 || currentSlide >= presentation.slides.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const version = ++renderVersionRef.current;

    const slideSize = presentation.slideSize;
    const baseW = Math.round(slideSize.width * scale);
    const baseH = Math.round(slideSize.height * scale);

    canvas.width = baseW;
    canvas.height = baseH;

    renderSlideToCanvas(presentation, currentSlide, canvas).catch((err) => {
      if (renderVersionRef.current !== version) return;
      console.error("[PptxViewer] renderSlideToCanvas failed:", err);
    });
  }, [loadState, currentSlide, scale]);

  const total = loadState.phase === "ready" ? loadState.total : 0;

  const goPrev = useCallback(() => setCurrentSlide((s) => Math.max(0, s - 1)), []);
  const goNext = useCallback(() => setCurrentSlide((s) => (total > 0 ? Math.min(total - 1, s + 1) : s + 1)), [total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(3, s + 0.25));
      else if (e.key === "-") setScale((s) => Math.max(0.25, s - 0.25));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goPrev, goNext]);

  /** Open PPTX with system default application. */
  const handleOpenWithSystem = () => {
    const target = openUri ?? uri;
    if (!target) return;
    const trimmedUri = target.trim();
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
      if (!res?.ok) toast.error(res?.reason ?? "无法打开文件");
    });
  };

  const isError = loadState.phase === "error";
  const isLoading = binaryQuery.isLoading || loadState.phase === "idle" || loadState.phase === "loading";
  const isReady = loadState.phase === "ready";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri}
        openRootUri={rootUri}
        saveAsOptions={uri && name ? {
          uri,
          name,
          projectId,
          sessionId,
          filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
        } : undefined}
        showMinimize={canMinimize}
        onMinimize={canMinimize ? () => requestStackMinimize(tabId!) : undefined}
        onClose={canClose ? () => removeStackItem(panelKey!) : undefined}
      />

      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
        {binaryQuery.error ? (
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <p>无法读取文件：{binaryQuery.error.message}</p>
            <Button variant="outline" size="sm" onClick={handleOpenWithSystem}>
              <AppWindow className="mr-1 h-3.5 w-3.5" /> 使用系统应用打开
            </Button>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <p>解析 PPTX 失败：{(loadState as { phase: "error"; message: string }).message}</p>
            <Button variant="outline" size="sm" onClick={handleOpenWithSystem}>
              <AppWindow className="mr-1 h-3.5 w-3.5" /> 使用系统应用打开
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>正在加载 PPTX…</span>
          </div>
        ) : isReady ? (
          <canvas
            ref={canvasRef}
            className="max-h-full max-w-full object-contain shadow-sm"
          />
        ) : null}
      </div>

      {isReady && total > 0 ? (
        <div className="flex items-center justify-center gap-2 border-t border-border/60 bg-background px-4 py-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
            aria-label="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goPrev}
            disabled={currentSlide <= 0}
            aria-label="上一页"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums min-w-[4rem] text-center">
            {currentSlide + 1} / {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goNext}
            disabled={currentSlide >= total - 1}
            aria-label="下一页"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            aria-label="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-[10px]">{Math.round(scale * 100)}%</span>
        </div>
      ) : null}
    </div>
  );
}
