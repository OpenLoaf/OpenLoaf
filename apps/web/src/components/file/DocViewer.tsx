"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { renderAsync } from "docx-preview";
import { StackHeader } from "@/components/layout/StackHeader";
import { useTabs } from "@/hooks/use-tabs";
import { trpc } from "@/utils/trpc";

import "./docx-preview.css";

interface DocViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  panelKey?: string;
  tabId?: string;
}

/** Convert base64 payload into a Uint8Array for docx-preview. */
function decodeBase64ToBytes(payload: string): Uint8Array {
  // 中文注释：使用 atob 解码 base64，再转成 Uint8Array，避免额外依赖。
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Render a DOCX preview panel. */
export default function DocViewer({ uri, name, panelKey, tabId }: DocViewerProps) {
  /** Output container for docx-preview rendering. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** Style container for docx-preview rendering. */
  const styleRef = useRef<HTMLDivElement | null>(null);
  /** Tracks the latest render request id to avoid stale updates. */
  const renderSeqRef = useRef(0);
  /** Tracks the document render status. */
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const setStackHidden = useTabs((s) => s.setStackHidden);
  const removeStackItem = useTabs((s) => s.removeStackItem);

  /** Flags whether the viewer should load via fs.readBinary. */
  const shouldUseFs = typeof uri === "string" && uri.startsWith("file://");
  /** Holds the binary payload fetched from the fs API. */
  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({ uri: uri ?? "" }),
    enabled: shouldUseFs && Boolean(uri),
  });

  /** Display name shown in the panel header. */
  const displayTitle = useMemo(() => name ?? uri ?? "DOCX", [name, uri]);

  useEffect(() => {
    setStatus("idle");
  }, [uri]);

  useEffect(() => {
    if (!shouldUseFs) return;
    if (fileQuery.isLoading) return;
    if (fileQuery.isError) {
      setStatus("error");
      return;
    }
    const payload = fileQuery.data?.contentBase64;
    if (!payload) {
      setStatus("error");
      return;
    }
    const container = bodyRef.current;
    if (!container) return;
    const styleContainer = styleRef.current;
    // 中文注释：清空容器，避免上一次渲染残留。
    container.replaceChildren();
    styleContainer?.replaceChildren();
    const seq = renderSeqRef.current + 1;
    renderSeqRef.current = seq;
    setStatus("loading");
    const run = async () => {
      try {
        const data = decodeBase64ToBytes(payload);
        await renderAsync(data, container, styleContainer ?? undefined, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
        });
        if (renderSeqRef.current !== seq) return;
        setStatus("ready");
      } catch {
        if (renderSeqRef.current !== seq) return;
        setStatus("error");
      }
    };
    void run();
    return () => {
      if (renderSeqRef.current !== seq) return;
      container.replaceChildren();
      styleContainer?.replaceChildren();
    };
  }, [fileQuery.data?.contentBase64, fileQuery.isError, fileQuery.isLoading, shouldUseFs]);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文档</div>;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        showMinimize
        onMinimize={() => {
          if (!tabId) return;
          setStackHidden(tabId, true);
        }}
        onClose={() => {
          if (!tabId || !panelKey) return;
          removeStackItem(tabId, panelKey);
        }}
      />
      <div className="relative flex-1 overflow-auto">
        {!shouldUseFs ? (
          <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            暂不支持此地址
          </div>
        ) : null}
        {status === "loading" || fileQuery.isLoading ? (
          <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            加载中…
          </div>
        ) : null}
        {status === "error" || fileQuery.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            DOC 预览失败
          </div>
        ) : null}
        <div ref={styleRef} />
        <div ref={bodyRef} className="min-h-full w-full" />
      </div>
    </div>
  );
}
