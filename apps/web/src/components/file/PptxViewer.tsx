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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

/** Render PPTX slides as images, one page at a time, with on-demand per-page render + disk cache. */
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
  const [currentSlide, setCurrentSlide] = useState(1);
  const queryClient = useQueryClient();

  // 幻灯片元信息：页数 + 尺寸。由 ppt/presentation.xml 解析得到，不触发渲染。
  const metaQuery = useQuery({
    ...trpc.fs.pptxSlideMeta.queryOptions({ uri: uri ?? "", projectId, sessionId }),
    enabled: Boolean(uri),
  });
  const total = metaQuery.data?.total ?? 0;

  // 当前页图片。React Query 自动按 (uri, slide) 缓存内存；服务端也缓存到磁盘。
  const slideQuery = useQuery({
    ...trpc.fs.pptxSlideImage.queryOptions({
      uri: uri ?? "",
      projectId,
      sessionId,
      slide: currentSlide,
    }),
    enabled: Boolean(uri) && currentSlide >= 1 && (total === 0 || currentSlide <= total),
    staleTime: Infinity,
  });

  const imageSrc = useMemo(() => {
    const b64 = slideQuery.data?.contentBase64;
    return b64 ? `data:image/png;base64,${b64}` : "";
  }, [slideQuery.data?.contentBase64]);

  // 相邻页预取：当前页一加载好就预取下一页，体感更连贯。
  const prefetchedRef = useRef(new Set<number>());
  useEffect(() => {
    if (!uri || slideQuery.isFetching || !slideQuery.data) return;
    const next = currentSlide + 1;
    if (total > 0 && next > total) return;
    if (prefetchedRef.current.has(next)) return;
    prefetchedRef.current.add(next);
    void queryClient.prefetchQuery(
      trpc.fs.pptxSlideImage.queryOptions({ uri, projectId, sessionId, slide: next }),
    );
  }, [currentSlide, projectId, queryClient, sessionId, slideQuery.data, slideQuery.isFetching, total, uri]);

  const goPrev = useCallback(() => setCurrentSlide((s) => Math.max(1, s - 1)), []);
  const goNext = useCallback(
    () => setCurrentSlide((s) => (total > 0 ? Math.min(total, s + 1) : s + 1)),
    [total],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
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

  const metaError = metaQuery.error;
  const slideError = slideQuery.error;
  const isInitialLoading = metaQuery.isLoading || (total > 0 && slideQuery.isLoading && !slideQuery.data);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri}
        openRootUri={rootUri}
        showMinimize={canMinimize}
        onMinimize={canMinimize ? () => requestStackMinimize(tabId!) : undefined}
        onClose={canClose ? () => removeStackItem(panelKey!) : undefined}
      />

      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
        {metaError ? (
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <p>无法读取 PPTX：{metaError.message}</p>
            <Button variant="outline" size="sm" onClick={handleOpenWithSystem}>
              <AppWindow className="mr-1 h-3.5 w-3.5" /> 使用系统应用打开
            </Button>
          </div>
        ) : isInitialLoading ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>正在渲染第 {currentSlide} 页…</span>
          </div>
        ) : slideError ? (
          <div className="flex flex-col items-center gap-2 text-sm text-destructive">
            <p>渲染失败：{slideError.message}</p>
          </div>
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt={`${displayTitle} - slide ${currentSlide}`}
            className="max-h-full max-w-full object-contain shadow-sm"
          />
        ) : null}

        {slideQuery.isFetching && imageSrc ? (
          <div className="absolute right-4 top-4 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" /> 加载中
          </div>
        ) : null}
      </div>

      {total > 0 ? (
        <div className="flex items-center justify-center gap-3 border-t border-border/60 bg-background px-4 py-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goPrev}
            disabled={currentSlide <= 1}
            aria-label="上一页"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {currentSlide} / {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goNext}
            disabled={currentSlide >= total}
            aria-label="下一页"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
