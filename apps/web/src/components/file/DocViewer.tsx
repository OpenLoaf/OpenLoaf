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
  ICommandService,
  LocaleType,
  LogLevel,
  mergeLocales,
  RichTextValue,
  ThemeService,
  Univer,
  UniverInstanceType,
  type IDocumentData,
  type IDisposable,
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
  panelKey?: string;
  tabId?: string;
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
  // 逻辑：使用 RichTextValue 自动补齐文档结构，确保数据可渲染。
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const dataStream = `${normalized.split("\n").join("\r\n")}\r\n`;
  const docData = RichTextValue.createByBody({ dataStream }).getData();
  docData.id = createUnitId("doc");
  docData.title = title;
  docData.locale = LocaleType.ZH_CN;
  return docData;
}

/** Extract plain text from a docx ArrayBuffer. */
async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value ?? "";
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
function createDocUniver(container: HTMLElement, isDark: boolean): Univer {
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
    header: true,
    toolbar: true,
    footer: true,
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
  panelKey,
  tabId,
}: DocViewerProps) {
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
    setStatus("loading");
    const run = async () => {
      try {
        const buffer = decodeBase64ToArrayBuffer(payload);
        const text = await extractDocxText(buffer);
        const nextSnapshot = buildDocumentSnapshot(text, displayTitle);
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
    const univer = createDocUniver(mountContainer, isDark);
    univerRef.current = univer;
    const docModel = univer.createUnit(
      UniverInstanceType.UNIVER_DOC,
      snapshot
    ) as unknown as DocModel;
    docRef.current = docModel;

    const commandService = univer.__getInjector().get(ICommandService);
    commandDisposableRef.current = commandService.onCommandExecuted((commandInfo) => {
      if (initializingRef.current) return;
      if (commandInfo.type !== CommandType.MUTATION) return;
      setIsDirty(true);
    });
    setStatus("ready");
    initializingRef.current = false;

    return () => {
      const commandDisposable = commandDisposableRef.current;
      const docModel = docRef.current;
      const univerInstance = univerRef.current;
      commandDisposableRef.current = null;
      docRef.current = null;
      univerRef.current = null;
      // 逻辑：延迟卸载内部 React root，避免渲染期同步 unmount。
      window.setTimeout(() => {
        commandDisposable?.dispose();
        docModel?.dispose();
        univerInstance?.dispose();
        mountContainer.remove();
      }, 0);
    };
  }, [snapshot]);

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
        rightSlot={
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
        }
        showMinimize
        onMinimize={() => {
          if (!tabId) return;
          requestStackMinimize(tabId);
        }}
        onClose={() => {
          if (!tabId || !panelKey) return;
          if (isDirty) {
            const ok = window.confirm("当前文档尚未保存，确定要关闭吗？");
            if (!ok) return;
          }
          removeStackItem(tabId, panelKey);
        }}
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
