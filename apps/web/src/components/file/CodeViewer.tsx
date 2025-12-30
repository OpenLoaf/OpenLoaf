"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Sparkles, Copy } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTabs } from "@/hooks/use-tabs";
import { getRelativePathFromUri } from "@/components/project/filesystem/file-system-utils";

interface CodeViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  rootUri?: string;
  projectId?: string;
}

const SYNTAX_HIGHLIGHTER_CUSTOM_STYLE: React.CSSProperties = {
  margin: 0,
  background: "transparent",
  padding: "1rem",
  fontSize: "13px",
  lineHeight: "1.7",
  fontFamily: "inherit",
  textShadow: "none",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
  whiteSpace: "pre",
  wordBreak: "normal",
  overflowWrap: "normal",
  userSelect: "text",
  WebkitUserSelect: "text",
  MozUserSelect: "text",
  msUserSelect: "text",
};

const SYNTAX_HIGHLIGHTER_LINE_NUMBER_STYLE: React.CSSProperties = {
  minWidth: "2.25em",
  paddingRight: "1em",
  opacity: 0.6,
  userSelect: "none",
  WebkitUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
  pointerEvents: "none",
};

const SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS = {
  style: {
    fontFamily: "inherit",
    textShadow: "none",
    userSelect: "text",
  } as React.CSSProperties,
};

function isLineNumberNode(node: Node | null) {
  if (!node) return false;
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.classList.contains("react-syntax-highlighter-line-number") ||
    node.classList.contains("linenumber")
  );
}

function getFilteredTextNodes(root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent && isLineNumberNode(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}

function resolveTextNode(node: Node, preferEnd: boolean) {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  if (!(node instanceof HTMLElement)) return null;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: (textNode) => {
      const parent = textNode.parentElement;
      if (parent && isLineNumberNode(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  if (preferEnd) {
    let last: Text | null = null;
    while (walker.nextNode()) {
      last = walker.currentNode as Text;
    }
    return last;
  }
  return (walker.nextNode() ? (walker.currentNode as Text) : null) ?? null;
}

function getOffsetFromNode(nodes: Text[], target: Node, offset: number, preferEnd: boolean) {
  const resolved = resolveTextNode(target, preferEnd);
  if (!resolved) return null;
  let count = 0;
  for (const node of nodes) {
    if (node === resolved) {
      const nodeText = node.nodeValue ?? "";
      const safeOffset = Math.max(0, Math.min(offset, nodeText.length));
      return count + safeOffset;
    }
    count += node.nodeValue?.length ?? 0;
  }
  return null;
}

function getLineNumberFromOffset(text: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  return text.slice(0, safeOffset).split("\n").length;
}

/** Resolve a highlight language from extension. */
function getLanguageFromExt(ext?: string) {
  const key = (ext ?? "").toLowerCase();
  // 中文注释：按常见扩展名映射高亮语言，未命中时回退为文本。
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    ini: "ini",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    xml: "xml",
    sh: "bash",
    zsh: "bash",
    md: "markdown",
    mdx: "markdown",
  };
  return map[key] ?? "text";
}

/** Render a read-only code viewer. */
export default function CodeViewer({
  uri,
  name,
  ext,
  rootUri,
  projectId,
}: CodeViewerProps) {
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(uri ? { uri } : skipToken)
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectionTextRef = useRef("");
  const selectionRangeRef = useRef<{ startLine: number; endLine: number } | null>(
    null
  );
  const selectionOffsetRef = useRef<{ start: number; end: number } | null>(null);
  const activeTabId = useTabs((s) => s.activeTabId);
  const setTabRightChatCollapsed = useTabs((s) => s.setTabRightChatCollapsed);
  const [selectionRect, setSelectionRect] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const fileContent = useMemo(() => fileQuery.data?.content ?? "", [fileQuery.data?.content]);

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
  }, []);

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
      new CustomEvent("teatime:chat-insert-mention", {
        detail: { value: mentionValue },
      })
    );
    console.debug("[CodeViewer] insert mention", {
      at: new Date().toISOString(),
      mentionValue,
    });
    if (activeTabId) {
      // 中文注释：展开右侧 AI 面板（不使用 stack）。
      setTabRightChatCollapsed(activeTabId, false);
    }
  }, [activeTabId, fileContent, projectId, rootUri, setTabRightChatCollapsed, uri]);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const container = containerRef.current;
      if (!selection || selection.rangeCount === 0 || !container) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          selectionTextRef.current = "";
          selectionRangeRef.current = null;
          selectionOffsetRef.current = null;
          setSelectionRect(null);
        }, 120);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          selectionTextRef.current = "";
          selectionRangeRef.current = null;
          selectionOffsetRef.current = null;
          setSelectionRect(null);
        }, 120);
        return;
      }
      const range = selection.getRangeAt(0);
      const commonNode = range.commonAncestorContainer;
      if (!container.contains(commonNode)) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          selectionTextRef.current = "";
          selectionRangeRef.current = null;
          selectionOffsetRef.current = null;
          setSelectionRect(null);
        }, 120);
        return;
      }
      const codeRoot = container.querySelector("code");
      if (!codeRoot || !(codeRoot instanceof HTMLElement)) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          selectionTextRef.current = "";
          selectionRangeRef.current = null;
          selectionOffsetRef.current = null;
          setSelectionRect(null);
        }, 120);
        return;
      }
      const nodes = getFilteredTextNodes(codeRoot);
      const startOffset = getOffsetFromNode(
        nodes,
        range.startContainer,
        range.startOffset,
        false
      );
      const endOffset = getOffsetFromNode(
        nodes,
        range.endContainer,
        range.endOffset,
        true
      );
      if (startOffset === null || endOffset === null) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          selectionTextRef.current = "";
          selectionRangeRef.current = null;
          selectionOffsetRef.current = null;
          setSelectionRect(null);
        }, 120);
        return;
      }
      if (hideTimer) clearTimeout(hideTimer);
      const [start, end] =
        startOffset <= endOffset ? [startOffset, endOffset] : [endOffset, startOffset];
      const startLine = getLineNumberFromOffset(fileContent, start);
      const endLine = getLineNumberFromOffset(fileContent, end);
      selectionRangeRef.current = { startLine, endLine };
      selectionOffsetRef.current = { start, end };
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        selectionTextRef.current = "";
        selectionRangeRef.current = null;
        selectionOffsetRef.current = null;
        setSelectionRect(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const left = rect.left - containerRect.left + rect.width / 2;
      const top = rect.top - containerRect.top;
      selectionTextRef.current = text;
      // 中文注释：工具栏显示在选区上方，避免遮挡代码。
      setSelectionRect({ left, top });
    };

    const handleScroll = () => {
      selectionTextRef.current = "";
      selectionRangeRef.current = null;
      selectionOffsetRef.current = null;
      setSelectionRect(null);
    };

    const handleMouseUp = () => {
      handleSelectionChange();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mouseup", handleMouseUp);
    containerRef.current?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup", handleMouseUp);
      containerRef.current?.removeEventListener("scroll", handleScroll);
    };
  }, [fileContent]);

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

  const language = getLanguageFromExt(ext);

  return (
    <div
      ref={containerRef}
      className="allow-text-select relative h-full w-full overflow-auto"
      style={{
        userSelect: "text",
        WebkitUserSelect: "text",
        MozUserSelect: "text",
        msUserSelect: "text",
      }}
    >
      {selectionRect ? (
        <div
          className="absolute z-10 flex items-center gap-1 rounded-md border border-border/70 bg-background/95 px-1.5 py-1 shadow-sm"
          style={{
            left: selectionRect.left,
            top: Math.max(selectionRect.top - 10, 6),
            transform: "translate(-50%, -100%)",
          }}
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
      <SyntaxHighlighter
        style={oneDark as any}
        language={language}
        PreTag="div"
        showLineNumbers
        wrapLines
        lineProps={() => ({
          style: {
            userSelect: "text",
            WebkitUserSelect: "text",
            MozUserSelect: "text",
            msUserSelect: "text",
          },
        })}
        customStyle={SYNTAX_HIGHLIGHTER_CUSTOM_STYLE}
        lineNumberStyle={SYNTAX_HIGHLIGHTER_LINE_NUMBER_STYLE}
        codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
      >
        {fileContent || ""}
      </SyntaxHighlighter>
      {fileContent ? null : (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          {name ?? uri}
        </div>
      )}
    </div>
  );
}
