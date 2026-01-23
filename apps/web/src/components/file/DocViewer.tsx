"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import mammoth from "mammoth/mammoth.browser";
import { Document, Packer, Paragraph } from "docx";
import { toast } from "sonner";
import {
  CommandType,
  CanceledError,
  BooleanNumber,
  ICommandService,
  IUniverInstanceService,
  LocaleType,
  LogLevel,
  mergeLocales,
  NamedStyleType,
  RichTextBuilder,
  ThemeService,
  Univer,
  UniverInstanceType,
  type IDocumentBody,
  type IDocumentData,
  type IDisposable,
  type IParagraph,
  type IParagraphStyle,
  type ITextRun,
  type ITextStyle,
} from "@univerjs/core";
import { defaultTheme } from "@univerjs/design";
import enUS from "@univerjs/design/locale/en-US";
import zhCN from "@univerjs/design/locale/zh-CN";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverUIPlugin } from "@univerjs/ui";
import uiEnUS from "@univerjs/ui/locale/en-US";
import uiZhCN from "@univerjs/ui/locale/zh-CN";
import docsUiEnUS from "@univerjs/docs-ui/locale/en-US";
import docsUiZhCN from "@univerjs/docs-ui/locale/zh-CN";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";

import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";

interface DocViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
  /** Whether the viewer is read-only. */
  readOnly?: boolean;
}

type DocViewerStatus = "idle" | "loading" | "ready" | "error" | "unsupported";
/** Minimal doc model interface for export/dispose operations. */
type DocModel = {
  /** Dispose document resources. */
  dispose: () => void;
  /** Extract full plain text for export. */
  getPlainText: () => string;
};

/** Locale map for Univer UI text. */
const DEFAULT_LOCALES = {
  [LocaleType.ZH_CN]: mergeLocales(zhCN, uiZhCN, docsUiZhCN),
  [LocaleType.EN_US]: mergeLocales(enUS, uiEnUS, docsUiEnUS),
};
const DEFAULT_PARAGRAPH_STYLE =
  RichTextBuilder.newEmptyData().body?.paragraphs?.[0]?.paragraphStyle;

/** Clone paragraph style to avoid shared references across paragraphs. */
function cloneParagraphStyle(style?: IParagraphStyle): IParagraphStyle | undefined {
  if (!style) return undefined;
  return JSON.parse(JSON.stringify(style)) as IParagraphStyle;
}

/** Convert base64 payload into ArrayBuffer for docx parsing. */
function decodeBase64ToArrayBuffer(payload: string): ArrayBuffer {
  // 使用 atob 解码 base64，再拷贝到 ArrayBuffer，避免额外依赖。
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert ArrayBuffer into base64 payload for fs.writeBinary. */
function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  // 分片拼接避免 call stack 过大。
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Build a stable id for Univer units. */
function createUnitId(prefix: string): string {
  // 逻辑：组合时间戳与随机串，减少短时间内的冲突概率。
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize raw text into Univer document data. */
function buildDocumentSnapshot(text: string, title: string): IDocumentData {
  // 逻辑：复用 Univer 默认文档模板，避免缺失样式导致渲染空白。
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const body = buildDocumentBodyFromText(normalized);
  const docData = RichTextBuilder.newEmptyData();
  docData.id = createUnitId("doc");
  docData.title = title;
  docData.locale = LocaleType.ZH_CN;
  docData.body = body;
  return docData;
}

type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

/** Convert plain text into Univer document body. */
function buildDocumentBodyFromText(text: string): IDocumentBody {
  const normalized = text.trim().length
    ? text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    : "";
  if (!normalized) {
    return {
      dataStream: "\r\n",
      paragraphs: [
        {
          startIndex: 0,
          paragraphStyle: cloneParagraphStyle(DEFAULT_PARAGRAPH_STYLE),
        },
      ],
      sectionBreaks: [{ startIndex: 1 }],
      textRuns: [],
      customBlocks: [],
      tables: [],
      customRanges: [],
      customDecorations: [],
    };
  }
  const paragraphs: IParagraph[] = [];
  let dataStream = "";
  normalized.split("\n").forEach((line) => {
    dataStream += line;
    paragraphs.push({
      startIndex: dataStream.length,
      paragraphStyle: cloneParagraphStyle(DEFAULT_PARAGRAPH_STYLE),
    });
    dataStream += "\r";
  });
  dataStream += "\n";
  return {
    dataStream,
    paragraphs,
    sectionBreaks: [{ startIndex: dataStream.length - 1 }],
    textRuns: [],
    customBlocks: [],
    tables: [],
    customRanges: [],
    customDecorations: [],
  };
}

/** Extract HTML from a docx ArrayBuffer. */
async function extractDocxHtml(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return result.value ?? "";
}

/** Convert HTML into Univer document body. */
function buildDocumentBodyFromHtml(html: string): IDocumentBody {
  // 逻辑：基于 DOMParser 提取结构化文本，输出 Univer 文档流。
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, "text/html");
  const paragraphs: IParagraph[] = [];
  const textRuns: ITextRun[] = [];
  let dataStream = "";
  let lastChar = "";

  const normalizeText = (text: string) => text.replace(/\s+/g, " ");

  const buildTextStyle = (style?: InlineStyle): ITextStyle | undefined => {
    if (!style || (!style.bold && !style.italic && !style.underline)) {
      return undefined;
    }
    return {
      bl: style.bold ? BooleanNumber.TRUE : undefined,
      it: style.italic ? BooleanNumber.TRUE : undefined,
      ul: style.underline ? { s: BooleanNumber.TRUE } : undefined,
    };
  };

  const isSameTextStyle = (a?: ITextStyle, b?: ITextStyle) =>
    a?.bl === b?.bl && a?.it === b?.it && a?.ul?.s === b?.ul?.s;

  const pushTextRun = (start: number, end: number, style?: ITextStyle) => {
    if (!style || end < start) return;
    const last = textRuns[textRuns.length - 1];
    if (last && last.ed === start && isSameTextStyle(last.ts, style)) {
      last.ed = end;
      return;
    }
    textRuns.push({ st: start, ed: end, ts: style });
  };

  const appendText = (text: string, style?: InlineStyle) => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    let value = normalized;
    if (lastChar === "\r" || dataStream.length === 0) {
      value = value.replace(/^\s+/, "");
    }
    if (lastChar === " " && value.startsWith(" ")) {
      value = value.replace(/^\s+/, "");
    }
    if (!value) return;
    const start = dataStream.length;
    dataStream += value;
    const end = dataStream.length;
    lastChar = dataStream[dataStream.length - 1] ?? "";
    pushTextRun(start, end, buildTextStyle(style));
  };

  const appendTab = () => {
    if (dataStream.endsWith("\t")) return;
    dataStream += "\t";
    lastChar = "\t";
  };

  const pushParagraph = (paragraphStyle?: IParagraphStyle) => {
    if (dataStream.endsWith("\r")) return;
    const index = dataStream.length;
    dataStream += "\r";
    lastChar = "\r";
    const nextStyle = cloneParagraphStyle(paragraphStyle ?? DEFAULT_PARAGRAPH_STYLE);
    if (nextStyle) {
      paragraphs.push({ startIndex: index, paragraphStyle: nextStyle });
      return;
    }
    paragraphs.push({ startIndex: index });
  };

  const resolveParagraphStyle = (tagName: string): IParagraphStyle | undefined => {
    switch (tagName) {
      case "H1":
        return { namedStyleType: NamedStyleType.HEADING_1 };
      case "H2":
        return { namedStyleType: NamedStyleType.HEADING_2 };
      case "H3":
        return { namedStyleType: NamedStyleType.HEADING_3 };
      case "H4":
        return { namedStyleType: NamedStyleType.HEADING_4 };
      case "H5":
        return { namedStyleType: NamedStyleType.HEADING_5 };
      default:
        return undefined;
    }
  };

  const inlineTagToStyle = (tagName: string, style: InlineStyle): InlineStyle => {
    switch (tagName) {
      case "STRONG":
      case "B":
        return { ...style, bold: true };
      case "EM":
      case "I":
        return { ...style, italic: true };
      case "U":
        return { ...style, underline: true };
      default:
        return style;
    }
  };

  const walkInline = (
    node: Node,
    style: InlineStyle,
    paragraphStyle?: IParagraphStyle
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "", style);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();
    if (tagName === "BR") {
      pushParagraph(paragraphStyle);
      return;
    }
    const nextStyle = inlineTagToStyle(tagName, style);
    const blockTags = new Set([
      "P",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "BLOCKQUOTE",
      "TABLE",
    ]);
    if (blockTags.has(tagName)) {
      walkBlock(element);
      return;
    }
    element.childNodes.forEach((child) => walkInline(child, nextStyle, paragraphStyle));
  };

  const walkTable = (table: HTMLElement) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("th,td"));
      cells.forEach((cell, index) => {
        if (index > 0) appendTab();
        cell.childNodes.forEach((child) => walkInline(child, {}, undefined));
      });
      pushParagraph();
    });
  };

  const walkBlock = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "", {});
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();
    if (tagName === "TABLE") {
      walkTable(element);
      return;
    }
    const blockTags = new Set([
      "P",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "BLOCKQUOTE",
    ]);
    if (!blockTags.has(tagName)) {
      element.childNodes.forEach((child) => walkInline(child, {}, undefined));
      return;
    }
    const paragraphStyle = resolveParagraphStyle(tagName);
    if (tagName === "LI") {
      // 逻辑：列表项降级为文本前缀，避免复杂列表结构丢失内容。
      appendText("• ", {});
    }
    element.childNodes.forEach((child) => walkInline(child, {}, paragraphStyle));
    pushParagraph(paragraphStyle);
  };

  documentNode.body.childNodes.forEach((child) => walkBlock(child));

  // 逻辑：确保文档以段落结束，避免渲染空文档。
  if (dataStream.length > 0 && !dataStream.endsWith("\r")) {
    pushParagraph();
  }
  if (dataStream.length === 0) {
    return {
      dataStream: "\r\n",
      paragraphs: [
        {
          startIndex: 0,
          paragraphStyle: cloneParagraphStyle(DEFAULT_PARAGRAPH_STYLE),
        },
      ],
      sectionBreaks: [{ startIndex: 1 }],
      textRuns: [],
      customBlocks: [],
      tables: [],
      customRanges: [],
      customDecorations: [],
    };
  }
  // 逻辑：补齐段落分隔符后的 section break，确保渲染有页面上下文。
  if (!dataStream.endsWith("\n")) {
    dataStream += "\n";
    lastChar = "\n";
  }
  const sectionBreaks = [{ startIndex: dataStream.length - 1 }];

  return {
    dataStream,
    paragraphs: paragraphs.length ? paragraphs : undefined,
    sectionBreaks,
    textRuns: textRuns.length ? textRuns : undefined,
    customBlocks: [],
    tables: [],
    customRanges: [],
    customDecorations: [],
  };
}

/** Build Univer document data from docx HTML. */
function buildDocumentSnapshotFromHtml(html: string, title: string): IDocumentData {
  // 逻辑：基于 HTML 生成文档快照，尽量保留标题与基础样式。
  const body = buildDocumentBodyFromHtml(html);
  // 逻辑：调试文档流生成结果，确认正文是否写入。
  console.info("[DocViewer] doc body length", body.dataStream.length);
  console.info(
    "[DocViewer] doc body preview",
    body.dataStream.slice(0, 200).replaceAll("\r", "\\r").replaceAll("\t", "\\t")
  );
  console.info("[DocViewer] doc paragraphs", body.paragraphs?.length ?? 0);
  console.info("[DocViewer] doc textRuns", body.textRuns?.length ?? 0);
  const docData = RichTextBuilder.newEmptyData();
  docData.id = createUnitId("doc");
  docData.title = title;
  docData.locale = LocaleType.ZH_CN;
  docData.body = body;
  return docData;
}

/** Build a docx buffer from plain text. */
async function buildDocxBuffer(text: string): Promise<ArrayBuffer> {
  // 逻辑：逐行转换为段落，生成基础 docx。
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const paragraphs = lines.map((line) => new Paragraph({ text: line }));
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });
  return Packer.toArrayBuffer(doc);
}

/** Build a new file uri for saving docx files. */
function resolveSaveUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return uri;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    const parts = trimmed.split("/").filter(Boolean);
    const currentName = parts.pop() ?? "document.docx";
    const lowerName = currentName.toLowerCase();
    if (lowerName.endsWith(".docx")) {
      return trimmed;
    }
    const baseName = currentName.replace(/\.[^.]+$/, "") || currentName;
    const nextName = `${baseName}.docx`;
    parts.push(nextName);
    return parts.join("/");
  }
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const currentName = parts.pop() ?? "document.docx";
    const lowerName = currentName.toLowerCase();
    if (lowerName.endsWith(".docx")) {
      return trimmed;
    }
    const baseName = currentName.replace(/\.[^.]+$/, "") || currentName;
    const nextName = `${baseName}.docx`;
    parts.push(nextName);
    url.pathname = `/${parts.map(encodeURIComponent).join("/")}`;
    return url.toString();
  } catch {
    return trimmed;
  }
}

/** Create a Univer instance for doc editing. */
function createDocUniver(container: HTMLElement, isDark: boolean, readOnly: boolean): Univer {
  const univer = new Univer({
    theme: defaultTheme,
    locale: LocaleType.ZH_CN,
    locales: DEFAULT_LOCALES,
    logLevel: LogLevel.SILENT,
    darkMode: isDark,
  });
  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, {
    container,
    header: !readOnly,
    toolbar: !readOnly,
    footer: !readOnly,
    headerMenu: false,
    contextMenu: true,
    disableAutoFocus: true,
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  return univer;
}

/** Render a DOCX preview/editor panel powered by Univer. */
export default function DocViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: DocViewerProps) {
  // 逻辑：仅在 stack 面板场景下展示最小化/关闭按钮。
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const isReadOnly = Boolean(readOnly);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  /** Tracks the document render status. */
  const [status, setStatus] = useState<DocViewerStatus>("idle");
  /** Track whether the document has unsaved changes. */
  const [isDirty, setIsDirty] = useState(false);
  /** Holds the latest document snapshot for initialization. */
  const [snapshot, setSnapshot] = useState<IDocumentData | null>(null);
  /** Holds the Univer instance for disposal. */
  const univerRef = useRef<Univer | null>(null);
  /** Holds the document model for export. */
  const docRef = useRef<DocModel | null>(null);
  /** Holds the command listener disposable. */
  const commandDisposableRef = useRef<IDisposable | null>(null);
  /** Holds the disposable for read-only command guards. */
  const readOnlyDisposableRef = useRef<IDisposable | null>(null);
  /** Marks initialization to avoid dirty flag on first load. */
  const initializingRef = useRef(true);
  /** Container element for Univer workbench. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Close current stack panel. */
  const removeStackItem = useTabs((s) => s.removeStackItem);
  /** Resolve current theme for Univer dark mode. */
  const { resolvedTheme } = useTheme();
  /** Current Univer dark mode flag synced from theme. */
  const [isDark, setIsDark] = useState(false);

  /** Flags whether the viewer should load via fs.readBinary. */
  const shouldUseFs =
    typeof uri === "string" &&
    uri.trim().length > 0 &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith("file://"));
  /** Flags legacy doc extension that cannot be parsed. */
  const isLegacyDoc =
    (ext ?? "").toLowerCase() === "doc" ||
    (typeof uri === "string" && uri.toLowerCase().endsWith(".doc"));
  /** Holds the binary payload fetched from the fs API. */
  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({
      workspaceId,
      projectId,
      uri: uri ?? "",
    }),
    enabled: shouldUseFs && Boolean(uri) && !isLegacyDoc && Boolean(workspaceId),
  });
  /** Mutation handler for persisting binary payloads. */
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());

  /** Display name shown in the panel header. */
  const displayTitle = useMemo(() => name ?? uri ?? "DOCX", [name, uri]);

  useEffect(() => {
    const root = document.documentElement;
    /** Read theme from root class list. */
    const readDomTheme = () => root.classList.contains("dark");
    // 逻辑：优先使用 next-themes 的 resolvedTheme，必要时回退到 DOM 主题。
    if (resolvedTheme === "dark" || resolvedTheme === "light") {
      setIsDark(resolvedTheme === "dark");
    } else {
      setIsDark(readDomTheme());
    }
    const observer = new MutationObserver(() => {
      setIsDark(readDomTheme());
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [resolvedTheme]);

  useEffect(() => {
    setStatus("idle");
    setIsDirty(false);
    setSnapshot(null);
    initializingRef.current = true;
  }, [uri]);

  useEffect(() => {
    if (!shouldUseFs) return;
    if (isLegacyDoc) {
      setStatus("unsupported");
      return;
    }
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
    // 逻辑：调试 docx 载入数据，便于定位解析异常。
    console.info("[DocViewer] docx payload length", payload.length);
    setStatus("loading");
    const run = async () => {
      try {
        const buffer = decodeBase64ToArrayBuffer(payload);
        const html = await extractDocxHtml(buffer);
        // 逻辑：调试 docx 转 HTML 输出，确认是否有正文内容。
        console.info("[DocViewer] docx html length", html.length);
        console.info("[DocViewer] docx html preview", html.slice(0, 200));
        const nextSnapshot = html.trim()
          ? buildDocumentSnapshotFromHtml(html, displayTitle)
          : buildDocumentSnapshot("", displayTitle);
        setSnapshot(nextSnapshot);
        setIsDirty(false);
      } catch {
        setStatus("error");
      }
    };
    void run();
  }, [
    displayTitle,
    fileQuery.data?.contentBase64,
    fileQuery.isError,
    fileQuery.isLoading,
    isLegacyDoc,
    shouldUseFs,
  ]);

  // 逻辑：切换主题会重置未保存编辑，因此不跟随 isDark 重新初始化。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!snapshot) return;
    const container = containerRef.current;
    if (!container) return;
    // 逻辑：使用独立挂载节点，避免异步卸载影响新实例。
    const mountContainer = document.createElement("div");
    mountContainer.className = "h-full w-full";
    container.replaceChildren(mountContainer);

    initializingRef.current = true;
    const univer = createDocUniver(mountContainer, isDark, isReadOnly);
    univerRef.current = univer;
    const docModel = univer.createUnit(
      UniverInstanceType.UNIVER_DOC,
      snapshot
    ) as unknown as DocModel;
    docRef.current = docModel;
    console.info("[DocViewer] model text length", docModel.getPlainText().length);
    console.info("[DocViewer] model text preview", docModel.getPlainText().slice(0, 200));
    const instanceService = univer.__getInjector().get(IUniverInstanceService);
    const unitId = (docModel as { getUnitId?: () => string }).getUnitId?.();
    if (unitId) {
      instanceService.setCurrentUnitForType(unitId);
      instanceService.focusUnit(unitId);
    }

    const commandService = univer.__getInjector().get(ICommandService);
    commandDisposableRef.current = commandService.onCommandExecuted((commandInfo) => {
      if (initializingRef.current) return;
      if (commandInfo.type !== CommandType.MUTATION) return;
      setIsDirty(true);
    });
    if (isReadOnly) {
      readOnlyDisposableRef.current = commandService.beforeCommandExecuted((commandInfo) => {
        if (initializingRef.current) return;
        if (commandInfo.type !== CommandType.MUTATION) return;
        // 逻辑：只读模式拦截写入类 mutation。
        throw new CanceledError();
      });
    }
    setStatus("ready");
    initializingRef.current = false;

    return () => {
      const commandDisposable = commandDisposableRef.current;
      const readOnlyDisposable = readOnlyDisposableRef.current;
      const docModel = docRef.current;
      const univerInstance = univerRef.current;
      commandDisposableRef.current = null;
      readOnlyDisposableRef.current = null;
      docRef.current = null;
      univerRef.current = null;
      // 逻辑：延迟卸载内部 React root，避免渲染期同步 unmount。
      window.setTimeout(() => {
        commandDisposable?.dispose();
        readOnlyDisposable?.dispose();
        // 逻辑：优先释放 Univer 实例，避免内部依赖空 unit 时抛出 EmptyError。
        if (univerInstance) {
          univerInstance.dispose();
        } else {
          docModel?.dispose();
        }
        mountContainer.remove();
      }, 0);
    };
  }, [snapshot, isReadOnly]);

  useEffect(() => {
    const univer = univerRef.current;
    if (!univer) return;
    // 逻辑：切换主题时同步 Univer 的暗黑模式，避免重新初始化实例。
    const themeService = univer.__getInjector().get(ThemeService);
    themeService.setDarkMode(isDark);
  }, [isDark]);

  /** Persist current document to a docx file. */
  const handleSave = async () => {
    // 逻辑：导出当前文档为 docx 并写回本地文件。
    if (!uri || !shouldUseFs) {
      toast.error("暂不支持保存此地址");
      return;
    }
    const docModel = docRef.current;
    if (!docModel) {
      toast.error("没有可保存的内容");
      return;
    }
    try {
      const text = docModel.getPlainText();
      const buffer = await buildDocxBuffer(text);
      const contentBase64 = encodeArrayBufferToBase64(buffer);
      const saveUri = resolveSaveUri(uri);
      await writeBinaryMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: saveUri,
        contentBase64,
      });
      setIsDirty(false);
      if (saveUri !== uri) {
        toast.success("已另存为 DOCX 文件");
      } else {
        toast.success("已保存");
      }
    } catch {
      toast.error("保存失败");
    }
  };

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文档</div>;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri}
        openRootUri={rootUri}
        rightSlot={
          !isReadOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="保存"
                  onClick={() => void handleSave()}
                  disabled={!shouldUseFs || status !== "ready" || writeBinaryMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">保存</TooltipContent>
            </Tooltip>
          ) : null
        }
        showMinimize={canMinimize}
        onMinimize={
          canMinimize
            ? () => {
                requestStackMinimize(tabId!);
              }
            : undefined
        }
        onClose={
          canClose
            ? () => {
                if (isDirty) {
                  const ok = window.confirm("当前文档尚未保存，确定要关闭吗？");
                  if (!ok) return;
                }
                removeStackItem(tabId!, panelKey!);
              }
            : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {!shouldUseFs ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            暂不支持此地址
          </div>
        ) : null}
        {status === "unsupported" ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            暂不支持 DOC 格式，请先转换为 DOCX
          </div>
        ) : null}
        {status !== "unsupported" && (status === "loading" || fileQuery.isLoading) ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            加载中…
          </div>
        ) : null}
        {status !== "unsupported" && (status === "error" || fileQuery.isError) ? (
          <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            DOCX 预览失败
          </div>
        ) : null}
        <div className="h-full min-h-0 flex-1" ref={containerRef} />
      </div>
    </div>
  );
}
