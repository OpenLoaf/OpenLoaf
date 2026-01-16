"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Streamdown, defaultRemarkPlugins } from "streamdown";
import remarkMdx from "remark-mdx";
import { Eye, PencilLine, Save, Undo2 } from "lucide-react";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { trpc } from "@/utils/trpc";
import CodeViewer, { type CodeViewerActions, type CodeViewerStatus } from "@/components/file/CodeViewer";
import { useWorkspace } from "@/components/workspace/workspaceContext";

import "./streamdown-viewer.css";

type MarkdownViewerMode = "preview" | "edit";

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

type MdxAttribute = { name?: string };
type MdxNode = {
  type?: string;
  name?: string;
  value?: string;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
};

/** Default viewer mode for markdown files. */
const DEFAULT_MARKDOWN_MODE: MarkdownViewerMode = "preview";
/** Prefix for MDX JSX placeholders. */
const MDX_PLACEHOLDER_PREFIX = "[MDX]";
/** Prefix for MDX expression placeholders. */
const MDX_EXPRESSION_PREFIX = "[MDX表达式]";
/** 默认编辑状态快照。 */
/** 默认编辑状态快照。 */
const DEFAULT_CODE_STATUS: CodeViewerStatus = {
  isDirty: false,
  isReadOnly: false,
  canSave: false,
  canUndo: false,
};
/** Streamdown 代码高亮主题。 */
const STREAMDOWN_SHIKI_THEME = ["github-light", "github-dark-high-contrast"] as const;

/** Format MDX attributes into a short label. */
function formatMdxAttributes(attributes?: MdxAttribute[]) {
  if (!attributes?.length) return "";
  // 逻辑：只保留属性名，避免占位过长。
  const names = attributes.map((attr) => attr.name).filter(Boolean);
  return names.length ? ` ${names.join(" ")}` : "";
}

/** Build a placeholder label for MDX JSX elements. */
function buildMdxElementPlaceholder(node: MdxNode) {
  const name = node.name ?? "MDX";
  const attrs = formatMdxAttributes(node.attributes);
  return `${MDX_PLACEHOLDER_PREFIX} <${name}${attrs}>`;
}

/** Build a placeholder label for MDX expressions. */
function buildMdxExpressionPlaceholder(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return `${MDX_EXPRESSION_PREFIX} {...}`;
  return `${MDX_EXPRESSION_PREFIX} {${trimmed}}`;
}

/** Create a text node for mdast. */
function createTextNode(value: string): MdxNode {
  return { type: "text", value };
}

/** Create a paragraph node for mdast. */
function createParagraphNode(value: string): MdxNode {
  return { type: "paragraph", children: [createTextNode(value)] };
}

/** Replace MDX nodes with readable placeholders for preview. */
function replaceMdxNodes(node: MdxNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "mdxJsxFlowElement") {
      // 逻辑：块级 JSX 用段落占位，保证布局稳定。
      return [createParagraphNode(buildMdxElementPlaceholder(child))];
    }
    if (child.type === "mdxJsxTextElement") {
      return [createTextNode(buildMdxElementPlaceholder(child))];
    }
    if (child.type === "mdxjsEsm") {
      // 逻辑：忽略 ESM 语句，避免渲染层报错。
      return [];
    }
    if (child.type === "mdxFlowExpression") {
      return [createParagraphNode(buildMdxExpressionPlaceholder(child.value))];
    }
    if (child.type === "mdxTextExpression") {
      return [createTextNode(buildMdxExpressionPlaceholder(child.value))];
    }
    replaceMdxNodes(child);
    return [child];
  });
}

/** Remark plugin for reducing MDX nodes into placeholders. */
function mdxPlaceholderPlugin() {
  return (tree: MdxNode) => {
    // 逻辑：将 MDX JSX/表达式降级为文本，占位避免渲染报错。
    replaceMdxNodes(tree);
  };
}

/** Render a markdown preview panel with a streamdown viewer. */
export default function MarkdownViewer({
  uri,
  openUri,
  name,
  ext,
  panelKey,
  tabId,
  rootUri,
  projectId,
}: MarkdownViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      uri && workspaceId ? { workspaceId, projectId, uri } : skipToken
    )
  );
  const [mode, setMode] = useState<MarkdownViewerMode>(DEFAULT_MARKDOWN_MODE);
  /** 头部按钮需要的编辑器操作句柄。 */
  const codeActionsRef = useRef<CodeViewerActions | null>(null);
  /** 头部按钮状态。 */
  const [codeStatus, setCodeStatus] = useState<CodeViewerStatus>(DEFAULT_CODE_STATUS);
  const removeStackItem = useTabs((s) => s.removeStackItem);
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  const displayTitle = useMemo(() => name ?? uri ?? "Markdown", [name, uri]);

  useEffect(() => {
    setMode(DEFAULT_MARKDOWN_MODE);
    setCodeStatus(DEFAULT_CODE_STATUS);
  }, [uri]);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
  }

  const content = fileQuery.data?.content ?? "";
  const isMdx = (ext ?? "").toLowerCase() === "mdx";
  const remarkPlugins = useMemo(() => {
    const basePlugins = Object.values(defaultRemarkPlugins);
    // 逻辑：仅在 mdx 文件启用 mdx 解析，避免普通 markdown 报错。
    return isMdx ? [...basePlugins, remarkMdx, mdxPlaceholderPlugin] : basePlugins;
  }, [isMdx]);
  const isEditMode = mode === "edit";
  const editorExt = ext ?? "md";

  /** Toggle preview/edit mode for the markdown panel. */
  const toggleMode = () => {
    setMode((prev) => (prev === "preview" ? "edit" : "preview"));
  };
  /** Trigger save from the stack header. */
  const handleSave = () => codeActionsRef.current?.save();
  /** Trigger undo from the stack header. */
  const handleUndo = () => codeActionsRef.current?.undo();

  const previewContent = fileQuery.isLoading ? (
    <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>
  ) : fileQuery.isError ? (
    <div className="h-full w-full p-4 text-destructive">
      {fileQuery.error?.message ?? "读取失败"}
    </div>
  ) : (
    <Streamdown
      mode="static"
      className="streamdown-viewer space-y-3"
      remarkPlugins={remarkPlugins}
      shikiTheme={STREAMDOWN_SHIKI_THEME}
    >
      {content}
    </Streamdown>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={displayTitle}
          openUri={openUri ?? uri}
          rightSlot={
            <div className="flex items-center gap-1">
              {isEditMode ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSave}
                    disabled={!codeStatus.canSave}
                    aria-label="保存"
                    title="保存"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={!codeStatus.canUndo}
                    aria-label="撤销"
                    title="撤销"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMode}
                aria-label={isEditMode ? "预览" : "编辑"}
                title={isEditMode ? "预览" : "编辑"}
              >
                {isEditMode ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <PencilLine className="h-4 w-4" />
                )}
              </Button>
            </div>
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
      ) : null}
      <div className="min-h-0 flex-1">
        <div className={isEditMode ? "h-full" : "hidden"}>
          <CodeViewer
            uri={uri}
            name={name}
            ext={editorExt}
            rootUri={rootUri}
            projectId={projectId}
            mode="edit"
            visible={isEditMode}
            actionsRef={codeActionsRef}
            onStatusChange={setCodeStatus}
          />
        </div>
        <div className={isEditMode ? "hidden" : "h-full overflow-auto"}>
          {previewContent}
        </div>
      </div>
    </div>
  );
}
