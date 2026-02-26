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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";
import { useTheme } from "next-themes";
import type { PointerEvent } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { Button } from "@openloaf/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { getRelativePathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { ReadFileErrorFallback } from "@/components/file/lib/read-file-error";
import { stopFindShortcutPropagation } from "@/components/file/lib/viewer-shortcuts";

export type CodeViewerActions = {
  save: () => void;
  undo: () => void;
  toggleReadOnly: () => void;
};

export type CodeViewerStatus = {
  isDirty: boolean;
  isReadOnly: boolean;
  canSave: boolean;
  canUndo: boolean;
};

interface CodeViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  rootUri?: string;
  projectId?: string;
  /** Whether the viewer should be read-only. */
  readOnly?: boolean;
  /** Viewer mode for Monaco. */
  mode?: CodeViewerMode;
  /** Whether the editor is visible (used to trigger layout). */
  visible?: boolean;
  /** Expose editor actions for external controls. */
  actionsRef?: MutableRefObject<CodeViewerActions | null>;
  /** Notify external controls about editor state. */
  onStatusChange?: (status: CodeViewerStatus) => void;
}

type MonacoDisposable = { dispose: () => void };
type CodeViewerMode = "preview" | "edit";

/** Monaco theme name for the viewer. */
const MONACO_THEME_DARK = "openloaf-dark";
const MONACO_THEME_LIGHT = "vs";
/** Default viewer mode for code files. */
const DEFAULT_CODE_VIEWER_MODE: CodeViewerMode = "preview";

const DARK_THEME_COLORS: Monaco.editor.IColors = {
  "editor.background": "#0c1118",
  "editor.foreground": "#e6e6e6",
  "editorLineNumber.foreground": "#6b7280",
  "editorLineNumber.activeForeground": "#e5e7eb",
  "editorGutter.background": "#0c1118",
  "editor.selectionBackground": "#1f3a5f",
  "editor.inactiveSelectionBackground": "#19293f",
  "editor.selectionHighlightBackground": "#1b2a40",
  "editorCursor.foreground": "#e6e6e6",
};

/** Apply Monaco theme with improved dark-mode contrast. */
function applyMonacoTheme(monaco: typeof Monaco, themeName: string) {
  if (themeName === MONACO_THEME_DARK) {
    // 逻辑：自定义深色主题，提升背景和文字对比度。
    monaco.editor.defineTheme(MONACO_THEME_DARK, {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: DARK_THEME_COLORS,
    });
  }
  monaco.editor.setTheme(themeName);
}

/** Resolve a Monaco language id from extension. */
export function getMonacoLanguageId(ext?: string): string {
  const key = (ext ?? "").toLowerCase();
  // 逻辑：保持与旧映射一致，未命中时降级为 bash。
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
    case "sql":
      return "sql";
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
      return "shell";
    default:
      return "shell";
  }
}

/** Render a code preview/editor panel. */
export default function CodeViewer({
  uri,
  name,
  ext,
  rootUri,
  projectId,
  readOnly,
  mode,
  visible = true,
  actionsRef,
  onStatusChange,
}: CodeViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  /** File content query. */
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      uri && workspaceId ? { workspaceId, projectId, uri } : skipToken
    )
  );
  const queryClient = useQueryClient();
  const writeFileMutation = useMutation(trpc.fs.writeFile.mutationOptions());
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
  /** Local draft for editable content. */
  const [draftContent, setDraftContent] = useState("");
  /** Tracks whether the draft differs from the last saved value. */
  const [isDirty, setIsDirty] = useState(false);
  /** Tracks read-only state in edit mode. */
  const [isReadOnly, setIsReadOnly] = useState(false);
  /** Snapshot of the last saved content. */
  const lastSavedRef = useRef("");
  /** Active tab id for AI panel control. */
  const activeTabId = useTabs((s) => s.activeTabId);
  /** Collapse state setter for AI panel. */
  const setTabRightChatCollapsed = useTabRuntime((s) => s.setTabRightChatCollapsed);
  /** Current file content string. */
  const fileContent = useMemo(
    () => fileQuery.data?.content ?? "",
    [fileQuery.data?.content]
  );
  const resolvedMode: CodeViewerMode =
    mode ?? (readOnly === false ? "edit" : DEFAULT_CODE_VIEWER_MODE);
  const isEditMode = resolvedMode === "edit";
  const effectiveReadOnly = readOnly === true ? true : !isEditMode || isReadOnly;
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

  useEffect(() => {
    // 逻辑：切换文件时重置草稿，避免状态串联。
    setDraftContent("");
    setIsDirty(false);
    setIsReadOnly(false);
    lastSavedRef.current = "";
  }, [uri]);

  useEffect(() => {
    if (!fileQuery.isSuccess) return;
    if (isDirty) return;
    // 逻辑：未编辑时同步最新内容，避免覆盖本地草稿。
    setDraftContent(fileContent);
    lastSavedRef.current = fileContent;
  }, [fileContent, fileQuery.isSuccess, isDirty]);

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

  /** Update local draft content from Monaco changes. */
  const handleEditorChange = useCallback((value?: string) => {
    const nextValue = value ?? "";
    setDraftContent(nextValue);
    // 逻辑：草稿与上次保存不一致时标记为脏。
    setIsDirty(nextValue !== lastSavedRef.current);
  }, []);


  /** Capture Monaco editor instance and attach listeners. */
  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      applyMonacoTheme(monaco, monacoThemeName);
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
    applyMonacoTheme(monaco, monacoThemeName);
  }, [monacoThemeName]);

  // 逻辑：同步编辑状态到外部控制区。
  useEffect(() => {
    if (!onStatusChange) return;
    const canSave = isEditMode && isDirty && !effectiveReadOnly && !writeFileMutation.isPending;
    const canUndo = isEditMode && !effectiveReadOnly;
    onStatusChange({
      isDirty,
      isReadOnly: effectiveReadOnly,
      canSave,
      canUndo,
    });
  }, [
    effectiveReadOnly,
    isDirty,
    isEditMode,
    onStatusChange,
    writeFileMutation.isPending,
  ]);

  useEffect(() => {
    if (!visible) return;
    const editor = editorRef.current;
    if (!editor) return;
    // 逻辑：面板从隐藏变为可见时强制布局，避免编辑器尺寸异常。
    const frame = window.requestAnimationFrame(() => {
      editor.layout();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  /** Monaco editor options for code rendering/editing. */
  const editorOptions = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly: effectiveReadOnly,
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
    [effectiveReadOnly]
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

  /** Intercept Cmd/Ctrl+F to avoid triggering global search overlay. */
  const handleFindShortcut = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    // 逻辑：在代码预览内阻止 Cmd/Ctrl+F 冒泡，让 Monaco 自己处理查找。
    stopFindShortcutPropagation(event);
  }, []);

  /** Copy selection to clipboard. */
  const handleCopy = useCallback(async () => {
    const range = selectionOffsetRef.current;
    const text = range
      ? draftContent.slice(range.start, range.end).trim()
      : selectionTextRef.current.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch (error) {
      console.warn("[CodeViewer] copy failed", error);
      toast.error("复制失败");
    }
  }, [draftContent]);

  /** Send selection to AI panel. */
  const handleAi = useCallback(async () => {
    const rangeOffsets = selectionOffsetRef.current;
    const text = rangeOffsets
      ? draftContent.slice(rangeOffsets.start, rangeOffsets.end).trim()
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
    const relativePath = uri ? getRelativePathFromUri(rootUri ?? "", uri) : null;
    if (!projectId || !relativePath) {
      toast.error("无法解析文件路径");
      return;
    }
    const mentionValue = `${projectId}/${relativePath}:${range.startLine}-${range.endLine}`;
    window.dispatchEvent(
      new CustomEvent("openloaf:chat-insert-mention", {
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
  }, [activeTabId, draftContent, projectId, rootUri, setTabRightChatCollapsed, uri]);

  /** Save current draft content to the file system. */
  const handleSave = useCallback(() => {
    if (!uri) return;
    if (effectiveReadOnly) return;
    if (!isDirty) return;
    const nextContent = draftContent;
    writeFileMutation.mutate(
      { workspaceId, projectId, uri, content: nextContent },
      {
        onSuccess: () => {
          lastSavedRef.current = nextContent;
          setIsDirty(false);
          queryClient.invalidateQueries({
            queryKey: trpc.fs.readFile.queryOptions({ workspaceId, projectId, uri })
              .queryKey,
          });
          toast.success("已保存");
        },
        onError: (error) => {
          toast.error(error?.message ?? "保存失败");
        },
      }
    );
  }, [
    draftContent,
    effectiveReadOnly,
    isDirty,
    projectId,
    queryClient,
    uri,
    workspaceId,
    writeFileMutation,
  ]);

  /** Undo the last editor change. */
  const handleUndo = useCallback(() => {
    const action = editorRef.current?.getAction("undo");
    if (!action || !action.isSupported()) return;
    void action.run();
  }, []);

  /** Toggle read-only state in edit mode. */
  const handleToggleReadOnly = useCallback(() => {
    if (readOnly) return;
    setIsReadOnly((prev) => !prev);
  }, [readOnly]);

  // 逻辑：向外部暴露保存/撤销/只读切换能力。
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      save: handleSave,
      undo: handleUndo,
      toggleReadOnly: handleToggleReadOnly,
    };
  }, [actionsRef, handleSave, handleToggleReadOnly, handleUndo]);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, draftContent, languageId]);

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

  if (fileQuery.data?.tooLarge) {
    return (
      <ReadFileErrorFallback
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        tooLarge
      />
    );
  }

  if (fileQuery.isError) {
    return (
      <ReadFileErrorFallback
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        error={fileQuery.error}
      />
    );
  }

  const containerClassName = `code-viewer relative h-full w-full overflow-hidden${
    isEditMode ? " pl-2" : ""
  }`;

  return (
    <div ref={containerRef} className={containerClassName} onKeyDown={handleFindShortcut}>
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
        value={draftContent}
        language={languageId}
        theme={monacoThemeName}
        onMount={handleEditorMount}
        onChange={handleEditorChange}
        options={editorOptions}
      />
      {draftContent ? null : (
        <div className="pointer-events-none absolute left-4 top-4 text-xs text-muted-foreground">
          {name ?? uri}
        </div>
      )}
    </div>
  );
}
