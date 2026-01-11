"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { blockEdit } from "@milkdown/crepe/feature/block-edit";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord-dark.css";
import { trpc } from "@/utils/trpc";

import "./milkdown-viewer.css";

interface MarkdownViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
}

type MarkdownViewerErrorBoundaryProps = {
  /** Raw markdown for fallback rendering. */
  markdown: string;
  /** Child renderer. */
  children: ReactNode;
};

type MarkdownViewerErrorBoundaryState = {
  /** Whether Milkdown rendering failed. */
  hasError: boolean;
};

/** Render fallback content when Milkdown fails (e.g. MDX syntax). */
class MarkdownViewerErrorBoundary extends Component<
  MarkdownViewerErrorBoundaryProps,
  MarkdownViewerErrorBoundaryState
> {
  state: MarkdownViewerErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // 逻辑：部分 mdx/自定义语法可能导致 Milkdown 解析报错，这里降级为纯文本展示。
    console.warn("[MarkdownViewer] milkdown render failed", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="mb-2 text-xs text-muted-foreground">
          当前文档包含 Markdown 暂不支持的语法，已降级为纯文本预览
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5">
          {this.props.markdown}
        </pre>
      </div>
    );
  }
}

/** Render a markdown preview panel. */
export default function MarkdownViewer({ uri }: MarkdownViewerProps) {
  /** File content query. */
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(uri ? { uri } : skipToken)
  );
  const queryClient = useQueryClient();
  const writeFileMutation = useMutation(trpc.fs.writeFile.mutationOptions());
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const builderRef = useRef<CrepeBuilder | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const uriRef = useRef<string | null>(null);
  const lastSyncedMarkdownRef = useRef<string>("");
  const [initError, setInitError] = useState<unknown>(null);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
  }

  if (fileQuery.isLoading) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (fileQuery.isError) {
    return (
      <div className="h-full w-full p-4 text-destructive">
        {fileQuery.error?.message ?? "读取失败"}
      </div>
    );
  }

  const content = fileQuery.data?.content ?? "";

  useEffect(() => {
    uriRef.current = uri;
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      builderRef.current?.destroy();
      builderRef.current = null;
    };
  }, [uri]);

  useEffect(() => {
    setInitError(null);
    if (!uri) return;
    if (!fileQuery.isSuccess) return;
    if (builderRef.current) return;
    const root = editorRootRef.current;
    if (!root) return;

    try {
      lastSyncedMarkdownRef.current = content;
      const builder = new CrepeBuilder({ root, defaultValue: content });
      builder.addFeature(blockEdit);
      builder.on((listener) => {
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (!uriRef.current) return;
          if (markdown === prevMarkdown) return;
          if (markdown === lastSyncedMarkdownRef.current) return;

          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            const nextUri = uriRef.current;
            if (!nextUri) return;
            lastSyncedMarkdownRef.current = markdown;
            writeFileMutation.mutate(
              { uri: nextUri, content: markdown },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: trpc.fs.readFile.queryOptions({ uri: nextUri }).queryKey,
                  });
                },
              }
            );
          }, 500);
        });
      });
      builder.create();
      builderRef.current = builder;
    } catch (error) {
      setInitError(error);
      console.warn("[MarkdownViewer] crepe init failed", error);
    }
  }, [content, fileQuery.isSuccess, queryClient, uri, writeFileMutation]);

  return (
    <div className="h-full w-full overflow-auto p-4">
      <div className="milkdown milkdown-viewer min-w-0 w-full max-w-full text-sm leading-relaxed">
        <MarkdownViewerErrorBoundary markdown={content}>
          {initError ? (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="mb-2 text-xs text-muted-foreground">
                当前文档无法加载为 Milkdown 编辑器，已降级为纯文本预览
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5">
                {content}
              </pre>
            </div>
          ) : (
            <div ref={editorRootRef} />
          )}
        </MarkdownViewerErrorBoundary>
      </div>
    </div>
  );
}
