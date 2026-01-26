"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Streamdown, defaultRemarkPlugins } from "streamdown";
import type { BundledTheme } from "shiki";
import remarkMdx from "remark-mdx";
import { Eye, PencilLine, Save, Undo2 } from "lucide-react";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@tenas-ai/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { trpc } from "@/utils/trpc";
import CodeViewer, { type CodeViewerActions, type CodeViewerStatus } from "@/components/file/CodeViewer";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { ReadFileErrorFallback } from "@/components/file/lib/read-file-error";

import "./style/streamdown-viewer.css";

type MarkdownViewerMode = "preview" | "edit";

interface MarkdownViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  /** Inline markdown content to preview. */
  content?: string;
  panelKey?: string;
  tabId?: string;
  rootUri?: string;
  projectId?: string;
  /** Whether the viewer is read-only. */
  readOnly?: boolean;
}

type MdxAttribute = { name?: string };
type MdxNode = {
  type?: string;
  name?: string;
  value?: string;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
};
type FrontMatterValue = string | string[];
type FrontMatterEntry = {
  /** Front matter key. */
  key: string;
  /** Front matter value. */
  value: FrontMatterValue;
};

/** Default viewer mode for markdown files. */
const DEFAULT_MARKDOWN_MODE: MarkdownViewerMode = "preview";
/** Prefix for MDX JSX placeholders. */
const MDX_PLACEHOLDER_PREFIX = "[MDX]";
/** Prefix for MDX expression placeholders. */
const MDX_EXPRESSION_PREFIX = "[MDX表达式]";
/** YAML front matter delimiter. */
const FRONT_MATTER_DELIMITER = "---";
/** YAML front matter end delimiter. */
const FRONT_MATTER_END_DELIMITER = "...";
/** 默认编辑状态快照。 */
/** 默认编辑状态快照。 */
const DEFAULT_CODE_STATUS: CodeViewerStatus = {
  isDirty: false,
  isReadOnly: false,
  canSave: false,
  canUndo: false,
};
/** Streamdown 代码高亮主题。 */
const STREAMDOWN_SHIKI_THEME: [BundledTheme, BundledTheme] = [
  "github-light",
  "github-dark-high-contrast",
];

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

/** Extract YAML front matter block from markdown content. */
function extractFrontMatter(content: string): { raw: string; body: string } | null {
  const lines = content.split(/\r?\n/u);
  if (lines.length === 0) return null;
  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) return null;

  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (trimmed === FRONT_MATTER_DELIMITER || trimmed === FRONT_MATTER_END_DELIMITER) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) return null;
  // 逻辑：仅处理起始 front matter，避免误伤正文中的分隔符。
  const raw = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n");
  return { raw, body };
}

/** Normalize YAML scalar values for display. */
function normalizeFrontMatterScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Parse inline YAML array syntax. */
function parseInlineArray(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((item) => normalizeFrontMatterScalar(item))
    .filter(Boolean);
}

/** Collect indented block lines for YAML values. */
function collectIndentedBlock(lines: string[], startIndex: number): {
  blockLines: string[];
  nextIndex: number;
} {
  const blockLines: string[] = [];
  let index = startIndex;
  // 逻辑：读取缩进块并保留空行，直到遇到下一条顶层键。
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      blockLines.push("");
      continue;
    }
    if (!line.startsWith(" ") && !line.startsWith("\t")) break;
    blockLines.push(line.replace(/^\s+/u, ""));
  }
  return { blockLines, nextIndex: index };
}

/** Parse YAML list items from indented block. */
function parseYamlList(lines: string[]): string[] | null {
  const items: string[] = [];
  // 逻辑：仅当所有非空行均为列表项时才按数组处理。
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("-")) return null;
    const value = normalizeFrontMatterScalar(trimmed.replace(/^-\s*/u, ""));
    if (value) items.push(value);
  }
  return items.length ? items : null;
}

/** Parse YAML front matter block into display entries. */
function parseFrontMatterEntries(raw: string): FrontMatterEntry[] {
  const lines = raw.split(/\r?\n/u);
  const entries: FrontMatterEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2] ?? "";
    const valueTrimmed = rawValue.trim();

    if (valueTrimmed === "|" || valueTrimmed === ">") {
      // 逻辑：块标量按单行或多行展示，避免丢失上下文。
      const { blockLines, nextIndex } = collectIndentedBlock(lines, index + 1);
      const joined = valueTrimmed === ">" ? blockLines.join(" ") : blockLines.join("\n");
      const normalized = joined.trim();
      if (normalized) {
        entries.push({ key, value: normalized });
      }
      index = nextIndex - 1;
      continue;
    }

    if (!valueTrimmed) {
      const { blockLines, nextIndex } = collectIndentedBlock(lines, index + 1);
      const listValues = parseYamlList(blockLines);
      if (listValues?.length) {
        entries.push({ key, value: listValues });
      } else {
        const joined = blockLines.join("\n").trim();
        if (joined) {
          entries.push({ key, value: joined });
        }
      }
      index = nextIndex - 1;
      continue;
    }

    const inlineArray = parseInlineArray(valueTrimmed);
    if (inlineArray) {
      if (inlineArray.length) {
        entries.push({ key, value: inlineArray });
      }
      continue;
    }

    const normalized = normalizeFrontMatterScalar(valueTrimmed);
    if (normalized) {
      entries.push({ key, value: normalized });
    }
  }

  return entries;
}

/** Format front matter values for display. */
function formatFrontMatterValue(value: FrontMatterValue): string {
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  return value;
}

/** Render a markdown preview panel with a streamdown viewer. */
export default function MarkdownViewer({
  uri,
  openUri,
  name,
  ext,
  content: inlineContent,
  panelKey,
  tabId,
  rootUri,
  projectId,
  readOnly,
}: MarkdownViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const hasInlineContent = typeof inlineContent === "string";
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      !hasInlineContent && uri && workspaceId ? { workspaceId, projectId, uri } : skipToken
    )
  );
  const resolvedDefaultMode: MarkdownViewerMode =
    readOnly === false ? "edit" : DEFAULT_MARKDOWN_MODE;
  const [mode, setMode] = useState<MarkdownViewerMode>(resolvedDefaultMode);
  /** 头部按钮需要的编辑器操作句柄。 */
  const codeActionsRef = useRef<CodeViewerActions | null>(null);
  /** 头部按钮状态。 */
  const [codeStatus, setCodeStatus] = useState<CodeViewerStatus>(DEFAULT_CODE_STATUS);
  const removeStackItem = useTabs((s) => s.removeStackItem);
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  const displayTitle = useMemo(() => name ?? uri ?? "Markdown", [name, uri]);

  useEffect(() => {
    setMode(readOnly === false ? "edit" : DEFAULT_MARKDOWN_MODE);
    setCodeStatus(DEFAULT_CODE_STATUS);
  }, [inlineContent, readOnly, uri]);

  if (!uri && !hasInlineContent) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
  }

  const resolvedContent = hasInlineContent ? inlineContent ?? "" : fileQuery.data?.content ?? "";
  const { frontMatter, previewMarkdown } = useMemo(() => {
    const extracted = extractFrontMatter(resolvedContent);
    if (!extracted) {
      return { frontMatter: null, previewMarkdown: resolvedContent };
    }
    const raw = extracted.raw.trim();
    if (!raw) {
      return { frontMatter: null, previewMarkdown: extracted.body };
    }
    return {
      frontMatter: {
        raw,
        entries: parseFrontMatterEntries(raw),
      },
      previewMarkdown: extracted.body,
    };
  }, [resolvedContent]);
  const isMdx = (ext ?? "").toLowerCase() === "mdx";
  const remarkPlugins = useMemo(() => {
    const basePlugins = Object.values(defaultRemarkPlugins);
    // 逻辑：仅在 mdx 文件启用 mdx 解析，避免普通 markdown 报错。
    return isMdx ? [...basePlugins, remarkMdx, mdxPlaceholderPlugin] : basePlugins;
  }, [isMdx]);
  const canEdit = !hasInlineContent && !readOnly;
  const isEditMode = canEdit && mode === "edit";
  const editorExt = ext ?? "md";

  /** Toggle preview/edit mode for the markdown panel. */
  const toggleMode = () => {
    if (!canEdit) return;
    setMode((prev) => (prev === "preview" ? "edit" : "preview"));
  };
  /** Trigger save from the stack header. */
  const handleSave = () => codeActionsRef.current?.save();
  /** Trigger undo from the stack header. */
  const handleUndo = () => codeActionsRef.current?.undo();

  const previewContent = !hasInlineContent && fileQuery.isLoading ? (
    <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>
  ) : !hasInlineContent && fileQuery.data?.tooLarge ? (
    <ReadFileErrorFallback
      uri={uri}
      name={displayTitle}
      projectId={projectId}
      rootUri={rootUri}
      tooLarge
    />
  ) : !hasInlineContent && fileQuery.isError ? (
    <ReadFileErrorFallback
      uri={uri}
      name={displayTitle}
      projectId={projectId}
      rootUri={rootUri}
      error={fileQuery.error}
    />
  ) : (
    <>
      {frontMatter ? (
        <div className="px-8 pt-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              YAML Front Matter
            </div>
            {frontMatter.entries.length ? (
              <dl className="mt-2 grid gap-2">
                {frontMatter.entries.map((entry) => (
                  <div key={entry.key} className="grid gap-1 sm:grid-cols-[140px,1fr]">
                    <dt className="font-medium text-foreground">{entry.key}</dt>
                    <dd className="break-words whitespace-pre-wrap text-muted-foreground">
                      {formatFrontMatterValue(entry.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {frontMatter.raw}
              </pre>
            )}
          </div>
        </div>
      ) : null}
      <Streamdown
        mode="static"
        className="streamdown-viewer space-y-3"
        remarkPlugins={remarkPlugins}
        shikiTheme={STREAMDOWN_SHIKI_THEME}
      >
        {previewMarkdown}
      </Streamdown>
    </>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={displayTitle}
          openUri={hasInlineContent ? undefined : openUri ?? uri}
          openRootUri={rootUri}
          rightSlot={
            <div className="flex items-center gap-1">
              {canEdit && isEditMode ? (
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
              {canEdit ? (
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
              ) : null}
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
        {canEdit ? (
          <>
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
                readOnly={readOnly}
              />
            </div>
            <div className={isEditMode ? "hidden" : "h-full overflow-auto"}>
              {previewContent}
            </div>
          </>
        ) : (
          <div className="h-full overflow-auto">{previewContent}</div>
        )}
      </div>
    </div>
  );
}
