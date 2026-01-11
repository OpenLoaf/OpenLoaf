"use client";

import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { blockEdit } from "@milkdown/crepe/feature/block-edit";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { editorViewCtx } from "@milkdown/kit/core";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "@milkdown/crepe/theme/nord-dark.css";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { trpc } from "@/utils/trpc";
import { getRelativePathFromUri } from "@/components/project/filesystem/utils/file-system-utils";

import "./milkdown-viewer.css";

/** Spark icon for the Milkdown toolbar. */
const SPARK_TOOLBAR_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path fill="currentColor" d="M12 2l1.9 5.7L19 9l-5.1 1.3L12 16l-1.9-5.7L5 9l5.1-1.3L12 2zM19 14l.9 2.7 2.1.3-2.1.6L19 20l-.9-2.4-2.1-.6 2.1-.3L19 14zM4.5 14l.6 1.9 1.9.3-1.9.5-.6 1.8-.6-1.8-1.9-.5 1.9-.3.6-1.9z"/>
  </svg>
`;

interface MarkdownViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  panelKey?: string;
  tabId?: string;
  rootUri?: string;
  projectId?: string;
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
export default function MarkdownViewer({
  uri,
  openUri,
  name,
  panelKey,
  tabId,
  rootUri,
  projectId,
}: MarkdownViewerProps) {
  /** File content query. */
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(uri ? { uri } : skipToken)
  );
  const content = fileQuery.data?.content ?? "";

  const queryClient = useQueryClient();
  const writeFileMutation = useMutation(trpc.fs.writeFile.mutationOptions());
  const activeTabId = useTabs((s) => s.activeTabId);
  const setTabRightChatCollapsed = useTabs((s) => s.setTabRightChatCollapsed);
  /** Close the current stack item. */
  const removeStackItem = useTabs((s) => s.removeStackItem);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const builderRef = useRef<CrepeBuilder | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const uriRef = useRef<string | null>(null);
  const lastSyncedMarkdownRef = useRef<string>("");
  /** Latest markdown snapshot from the editor. */
  const currentMarkdownRef = useRef<string>("");
  /** Tracks whether the editor content differs from the last saved snapshot. */
  const [isDirty, setIsDirty] = useState(false);
  const [initError, setInitError] = useState<unknown>(null);
  /** Header display title. */
  const displayTitle = useMemo(() => name ?? uri ?? "Markdown", [name, uri]);

  /** Get selected line range from the Milkdown editor. */
  const getSelectedLineRange = useCallback(() => {
    const builder = builderRef.current;
    if (!builder) return null;
    return builder.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to, empty } = view.state.selection;
      if (empty) return null;
      // 逻辑：通过 ProseMirror 文本拆分计算行号，作为 Markdown 的近似行号。
      const beforeFrom = view.state.doc.textBetween(0, from, "\n", "\n");
      const beforeTo = view.state.doc.textBetween(0, to, "\n", "\n");
      const startLine = Math.max(1, beforeFrom.split("\n").length);
      const endLine = Math.max(startLine, beforeTo.split("\n").length);
      return { startLine, endLine };
    });
  }, []);

  useEffect(() => {
    uriRef.current = uri ?? null;
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      builderRef.current?.destroy();
      builderRef.current = null;
    };
  }, [uri]);

  /** Persist markdown changes back to the file system. */
  const saveMarkdown = useCallback(
    (markdown: string) => {
      const nextUri = uriRef.current;
      if (!nextUri) return;
      writeFileMutation.mutate(
        { uri: nextUri, content: markdown },
        {
          onSuccess: () => {
            lastSyncedMarkdownRef.current = markdown;
            // 逻辑：保存完成后再同步 dirty 状态，避免覆盖新的输入。
            setIsDirty(currentMarkdownRef.current !== markdown);
            queryClient.invalidateQueries({
              queryKey: trpc.fs.readFile.queryOptions({ uri: nextUri }).queryKey,
            });
          },
        }
      );
    },
    [queryClient, writeFileMutation]
  );

  /** Save handler for the header action. */
  const handleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    saveMarkdown(currentMarkdownRef.current);
  }, [saveMarkdown]);

  /** Send selection to AI panel. */
  const handleAi = useCallback(async () => {
    const selectionText = window.getSelection()?.toString().trim() ?? "";
    if (!selectionText) {
      toast.error("请先选中文本");
      return;
    }
    try {
      await navigator.clipboard.writeText(selectionText);
    } catch (error) {
      console.warn("[MarkdownViewer] copy for ai failed", error);
    }
    if (!activeTabId) {
      toast.error("未找到当前标签页");
      return;
    }
    if (!projectId || !rootUri || !uri) {
      toast.error("无法解析文件路径");
      return;
    }
    const relativePath = getRelativePathFromUri(rootUri, uri);
    if (!relativePath) {
      toast.error("无法解析文件路径");
      return;
    }
    const lineRange = getSelectedLineRange();
    const mentionValue = lineRange
      ? `${projectId}/${relativePath}:${lineRange.startLine}-${lineRange.endLine}`
      : `${projectId}/${relativePath}`;
    window.dispatchEvent(
      new CustomEvent("tenas:chat-insert-mention", {
        detail: { value: mentionValue, keepSelection: true },
      })
    );
    console.debug("[MarkdownViewer] insert mention", {
      at: new Date().toISOString(),
      mentionValue,
    });
    // 展开右侧 AI 面板（不使用 stack）。
    setTabRightChatCollapsed(activeTabId, false);
  }, [activeTabId, getSelectedLineRange, projectId, rootUri, setTabRightChatCollapsed, uri]);

  useEffect(() => {
    setInitError(null);
    setIsDirty(false);
    if (!uri) return;
    if (!fileQuery.isSuccess) return;
    if (builderRef.current) return;
    const root = editorRootRef.current;
    if (!root) return;

    try {
      lastSyncedMarkdownRef.current = content;
      currentMarkdownRef.current = content;
      const builder = new CrepeBuilder({ root, defaultValue: content });
      builder.addFeature(blockEdit);
      builder.addFeature(toolbar, {
        buildToolbar: (groupBuilder) => {
          groupBuilder
            .addGroup("ai", "AI")
            .addItem("ai-mention", {
              icon: SPARK_TOOLBAR_ICON,
              active: () => false,
              onRun: () => {
                void handleAi();
              },
            });
        },
      });
      builder.on((listener) => {
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (!uriRef.current) return;
          if (markdown === prevMarkdown) return;
          currentMarkdownRef.current = markdown;
          const changed = markdown !== lastSyncedMarkdownRef.current;
          setIsDirty(changed);
          if (!changed) return;

          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            saveMarkdown(markdown);
          }, 500);
        });
      });
      builder.create();
      builderRef.current = builder;
    } catch (error) {
      setInitError(error);
      console.warn("[MarkdownViewer] crepe init failed", error);
    }
  }, [content, fileQuery.isSuccess, handleAi, saveMarkdown, uri]);

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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri ?? uri}
        rightSlot={
          isDirty ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="保存"
                  onClick={handleSave}
                  disabled={writeFileMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">保存</TooltipContent>
            </Tooltip>
          ) : null
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
      <div className="relative h-full w-full overflow-auto px-4 pb-4 pt-0">
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
    </div>
  );
}
