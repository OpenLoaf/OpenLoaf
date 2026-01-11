"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { PointerEvent } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { getRelativePathFromUri } from "@/components/project/filesystem/utils/file-system-utils";

interface CodeViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  rootUri?: string;
  projectId?: string;
}

type MonacoDisposable = { dispose: () => void };

/** Monaco theme name for the read-only viewer. */
const MONACO_THEME_DARK = "vs-dark";
const MONACO_THEME_LIGHT = "vs";

/** Resolve a Monaco language id from extension. */
function getMonacoLanguageId(ext?: string): string {
  const key = (ext ?? "").toLowerCase();
  // 逻辑：保持与旧映射一致，未命中时降级为纯文本。
  switch (key) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "json":
    case "jsonc":
    case "jsonl":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "java":
      return "java";
    case "cpp":
    case "hpp":
    case "h":
      return "cpp";
    case "c":
      return "c";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "html":
      return "html";
    case "xml":
      return "xml";
    case "md":
    case "mdx":
      return "markdown";
    case "txt":
    case "text":
    case "log":
      return "plaintext";
    default:
      return "plaintext";
  }
}

/** Render a read-only code viewer. */
export default function CodeViewer({
  uri,
  name,
  ext,
  rootUri,
  projectId,
}: CodeViewerProps) {
  /** File content query. */
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(uri ? { uri } : skipToken)
  );
  /** Monaco editor instance. */
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  /** Monaco namespace instance. */
  const monacoRef = useRef<typeof Monaco | null>(null);
  /** Monaco disposables for listeners. */
  const disposablesRef = useRef<MonacoDisposable[]>([]);
  /** Container for toolbar positioning. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Track toolbar interaction to avoid clearing selection on blur. */
  const toolbarPointerDownRef = useRef(false);
  /** Current selected text cache. */
  const selectionTextRef = useRef("");
  /** Current selected line range cache. */
  const selectionRangeRef = useRef<{ startLine: number; endLine: number } | null>(
    null
  );
  /** Current selected offset range cache. */
  const selectionOffsetRef = useRef<{ start: number; end: number } | null>(null);
  /** Current toolbar position. */
  const [selectionRect, setSelectionRect] = useState<{
    left: number;
    top: number;
  } | null>(null);
  /** Active tab id for AI panel control. */
  const activeTabId = useTabs((s) => s.activeTabId);
  /** Collapse state setter for AI panel. */
  const setTabRightChatCollapsed = useTabs((s) => s.setTabRightChatCollapsed);
  /** Current file content string. */
  const fileContent = useMemo(
    () => fileQuery.data?.content ?? "",
    [fileQuery.data?.content]
  );
  /** Monaco language id from extension. */
  const languageId = useMemo(() => getMonacoLanguageId(ext), [ext]);
  const { resolvedTheme } = useTheme();
  /** Effective theme from next-themes or DOM class fallback. */
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(
    resolvedTheme === "dark" ? "dark" : "light"
  );
  const monacoThemeName =
    effectiveTheme === "dark" ? MONACO_THEME_DARK : MONACO_THEME_LIGHT;

  useEffect(() => {
    const root = document.documentElement;
    /** Read theme from the root class list. */
    const readDomTheme = () =>
      root.classList.contains("dark") ? "dark" : "light";

    // 逻辑：优先使用 next-themes 的 resolvedTheme，必要时回退到 DOM 主题。
    if (resolvedTheme === "dark" || resolvedTheme === "light") {
      setEffectiveTheme(resolvedTheme);
    } else {
      setEffectiveTheme(readDomTheme());
    }

    const observer = new MutationObserver(() => {
      setEffectiveTheme(readDomTheme());
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [resolvedTheme]);

  /** Clear cached selection state and hide the toolbar. */
  const clearSelection = useCallback(() => {
    selectionTextRef.current = "";
    selectionRangeRef.current = null;
    selectionOffsetRef.current = null;
    setSelectionRect(null);
  }, []);

  /** Sync selection data from the current Monaco editor. */
  const syncSelectionFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const selection = editor.getSelection();
    // 逻辑：选区为空或不可见时直接收起工具栏。
    if (!selection || selection.isEmpty()) {
      clearSelection();
      return;
    }
    const rawText = model.getValueInRange(selection);
    const text = rawText.trim();
    if (!text) {
      clearSelection();
      return;
    }
    const startPos = selection.getStartPosition();
    const endPos = selection.getEndPosition();
    const startOffset = model.getOffsetAt(startPos);
    const endOffset = model.getOffsetAt(endPos);
    const startLine = Math.min(startPos.lineNumber, endPos.lineNumber);
    const endLine = Math.max(startPos.lineNumber, endPos.lineNumber);
    selectionRangeRef.current = { startLine, endLine };
    selectionOffsetRef.current = {
      start: Math.min(startOffset, endOffset),
      end: Math.max(startOffset, endOffset),
    };
    selectionTextRef.current = text;
    const editorDom = editor.getDomNode();
    const container = containerRef.current;
    const startCoords = editor.getScrolledVisiblePosition(startPos);
    const endCoords = editor.getScrolledVisiblePosition(endPos);
    if (!editorDom || !container || !startCoords || !endCoords) {
      clearSelection();
      return;
    }
    const editorRect = editorDom.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left =
      editorRect.left +
      (startCoords.left + endCoords.left) / 2 -
      containerRect.left;
    const top =
      editorRect.top +
      Math.min(startCoords.top, endCoords.top) -
      containerRect.top;
    // 逻辑：避免频繁 setState，位置变化较小时保持稳定。
    setSelectionRect((prev) => {
      if (!prev) return { left, top };
      if (Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) {
        return prev;
      }
      return { left, top };
    });
  }, [clearSelection]);


  /** Capture Monaco editor instance and attach listeners. */
  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      clearSelection();
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
      disposablesRef.current.push(
        editor.onDidChangeCursorSelection(() => {
          syncSelectionFromEditor();
        })
      );
      disposablesRef.current.push(
        editor.onDidScrollChange(() => {
          if (!selectionTextRef.current) {
            clearSelection();
            return;
          }
          syncSelectionFromEditor();
        })
      );
      disposablesRef.current.push(
        editor.onDidBlurEditorText(() => {
          if (toolbarPointerDownRef.current) return;
          clearSelection();
        })
      );
    },
    [clearSelection, syncSelectionFromEditor]
  );

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    monaco.editor.setTheme(monacoThemeName);
  }, [monacoThemeName]);

  /** Monaco editor options for read-only rendering. */
  const editorOptions = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly: true,
      fontSize: 13,
      lineHeight: 22,
      fontFamily: "var(--font-mono, Menlo, Monaco, 'Courier New', monospace)",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      lineNumbersMinChars: 3,
      folding: false,
      wordWrap: "off",
      smoothScrolling: true,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
    }),
    []
  );

  /** Keep selection when interacting with the toolbar. */
  const handleToolbarPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // 逻辑：点击工具栏时阻止失焦清理，确保 AI/复制逻辑可用。
      toolbarPointerDownRef.current = true;
      event.preventDefault();
    },
    []
  );

  /** Release toolbar interaction lock after pointer ends. */
  const handleToolbarPointerUp = useCallback(() => {
    toolbarPointerDownRef.current = false;
  }, []);

  /** Copy selection to clipboard. */
  const handleCopy = useCallback(async () => {
    const range = selectionOffsetRef.current;
    const text = range
      ? fileContent.slice(range.start, range.end).trim()
      : selectionTextRef.current.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch (error) {
      console.warn("[CodeViewer] copy failed", error);
      toast.error("复制失败");
    }
  }, [fileContent]);

  /** Send selection to AI panel. */
  const handleAi = useCallback(async () => {
    const rangeOffsets = selectionOffsetRef.current;
    const text = rangeOffsets
      ? fileContent.slice(rangeOffsets.start, rangeOffsets.end).trim()
      : selectionTextRef.current.trim();
    const range = selectionRangeRef.current;
    if (!text) return;
    if (!range) {
      toast.error("请先选中代码片段");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("[CodeViewer] copy for ai failed", error);
    }
    if (!activeTabId) {
      toast.error("未找到当前标签页");
      return;
    }
    const relativePath =
      rootUri && uri ? getRelativePathFromUri(rootUri, uri) : null;
    if (!projectId || !relativePath) {
      toast.error("无法解析文件路径");
      return;
    }
    const mentionValue = `${projectId}/${relativePath}:${range.startLine}-${range.endLine}`;
    window.dispatchEvent(
      new CustomEvent("tenas:chat-insert-mention", {
        detail: { value: mentionValue },
      })
    );
    console.debug("[CodeViewer] insert mention", {
      at: new Date().toISOString(),
      mentionValue,
    });
    if (activeTabId) {
      // 展开右侧 AI 面板（不使用 stack）。
      setTabRightChatCollapsed(activeTabId, false);
    }
  }, [activeTabId, fileContent, projectId, rootUri, setTabRightChatCollapsed, uri]);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, fileContent, languageId]);

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
      editorRef.current = null;
    };
  }, []);

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
    <div ref={containerRef} className="code-viewer relative h-full w-full overflow-hidden">
      {selectionRect ? (
        <div
          className="absolute z-10 flex items-center gap-1 rounded-md border border-border/70 bg-background/95 px-1.5 py-1 shadow-sm"
          style={{
            left: selectionRect.left,
            top: Math.max(selectionRect.top - 10, 6),
            transform: "translate(-50%, -100%)",
          }}
          onPointerDown={handleToolbarPointerDown}
          onPointerUp={handleToolbarPointerUp}
          onPointerCancel={handleToolbarPointerUp}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleAi}
            aria-label="AI"
            title="AI"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            aria-label="复制"
            title="复制"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <Editor
        height="100%"
        width="100%"
        path={uri}
        value={fileContent}
        language={languageId}
        theme={monacoThemeName}
        onMount={handleEditorMount}
        options={editorOptions}
      />
      {fileContent ? null : (
        <div className="pointer-events-none absolute left-4 top-4 text-xs text-muted-foreground">
          {name ?? uri}
        </div>
      )}
    </div>
  );
}
