"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  CellValueType,
  CanceledError,
  CommandType,
  ICommandService,
  LocaleType,
  LogLevel,
  mergeLocales,
  ThemeService,
  Univer,
  UniverInstanceType,
  mergeWorksheetSnapshotWithDefault,
  type ICellData,
  type IDisposable,
  type IWorkbookData,
  type IWorksheetData,
} from "@univerjs/core";
import { defaultTheme } from "@univerjs/design";
import enUS from "@univerjs/design/locale/en-US";
import zhCN from "@univerjs/design/locale/zh-CN";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import uiEnUS from "@univerjs/ui/locale/en-US";
import uiZhCN from "@univerjs/ui/locale/zh-CN";
import sheetsEnUS from "@univerjs/sheets/locale/en-US";
import sheetsZhCN from "@univerjs/sheets/locale/zh-CN";
import sheetsUiEnUS from "@univerjs/sheets-ui/locale/en-US";
import sheetsUiZhCN from "@univerjs/sheets-ui/locale/zh-CN";
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
import "@univerjs/sheets-ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";

interface SheetViewerProps {
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

type SheetViewerStatus = "idle" | "loading" | "ready" | "error";

type SheetCellMatrix = Record<number, Record<number, ICellData>>;
type SheetBookType = "xls" | "xlsx";
/** Minimal workbook interface for save/dispose operations. */
type SheetWorkbook = {
  /** Dispose workbook resources. */
  dispose: () => void;
  /** Persist workbook snapshot. */
  save: () => IWorkbookData;
};

/** 视图最少展示的列数，避免小表只有一列导致布局怪异。 */
const MIN_VISIBLE_COLUMNS = 26;

/** Locale map for Univer UI text. */
const DEFAULT_LOCALES = {
  [LocaleType.ZH_CN]: mergeLocales(zhCN, uiZhCN, sheetsZhCN, sheetsUiZhCN, docsUiZhCN),
  [LocaleType.EN_US]: mergeLocales(enUS, uiEnUS, sheetsEnUS, sheetsUiEnUS, docsUiEnUS),
};

/** Convert base64 payload into ArrayBuffer for SheetJS parsing. */
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

/** Normalize a SheetJS cell value into Univer cell payload. */
function normalizeCell(value: unknown): ICellData | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return { v: value, t: CellValueType.NUMBER };
  }
  if (typeof value === "boolean") {
    return { v: value, t: CellValueType.BOOLEAN };
  }
  if (value instanceof Date) {
    return { v: value.toISOString(), t: CellValueType.STRING };
  }
  return { v: String(value), t: CellValueType.STRING };
}

/** Build worksheet snapshot data from SheetJS rows. */
function buildWorksheetSnapshot(
  sheetName: string,
  rows: unknown[][]
): { sheetId: string; data: IWorksheetData } {
  // 逻辑：按最大行列构建 cellData 矩阵，保留已有值。
  let maxColumn = 0;
  for (const row of rows) {
    if (row.length > maxColumn) maxColumn = row.length;
  }
  const cellData: SheetCellMatrix = {};
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const normalized = normalizeCell(cell);
      if (!normalized) return;
      if (!cellData[rowIndex]) cellData[rowIndex] = {};
      cellData[rowIndex][colIndex] = normalized;
    });
  });
  const rowCount = Math.max(rows.length, 1);
  const columnCount = Math.max(maxColumn, MIN_VISIBLE_COLUMNS);
  const sheetId = createUnitId("sheet");
  const snapshot = mergeWorksheetSnapshotWithDefault({
    id: sheetId,
    name: sheetName || "Sheet",
    cellData,
    rowCount,
    columnCount,
  });
  return { sheetId, data: snapshot };
}

/** Convert an ArrayBuffer into Univer workbook snapshot. */
function buildWorkbookSnapshot(buffer: ArrayBuffer, title: string): IWorkbookData {
  // 逻辑：使用 SheetJS 读取数据，再映射到 Univer workbook 快照结构。
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetNames = workbook.SheetNames.length ? workbook.SheetNames : ["Sheet1"];
  const workbookId = createUnitId("workbook");
  const sheets: Record<string, IWorksheetData> = {};
  const sheetOrder: string[] = [];
  sheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheet
      ? (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][])
      : [];
    const fallbackName = sheetName || `Sheet${index + 1}`;
    const { sheetId, data } = buildWorksheetSnapshot(fallbackName, rows);
    sheets[sheetId] = data;
    sheetOrder.push(sheetId);
  });
  return {
    id: workbookId,
    name: title,
    appVersion: "0.15.1",
    locale: LocaleType.ZH_CN,
    styles: {},
    sheetOrder,
    sheets,
  };
}

/** Resolve max row/column from Univer cell matrix. */
function resolveMatrixSize(cellData?: SheetCellMatrix): { rows: number; columns: number } {
  if (!cellData) return { rows: 1, columns: 1 };
  let maxRow = 0;
  let maxCol = 0;
  for (const [rowKey, row] of Object.entries(cellData)) {
    const rowIndex = Number(rowKey);
    if (Number.isNaN(rowIndex)) continue;
    maxRow = Math.max(maxRow, rowIndex + 1);
    for (const colKey of Object.keys(row)) {
      const colIndex = Number(colKey);
      if (Number.isNaN(colIndex)) continue;
      maxCol = Math.max(maxCol, colIndex + 1);
    }
  }
  return {
    rows: Math.max(maxRow, 1),
    columns: Math.max(maxCol, 1),
  };
}

/** Convert Univer worksheet snapshot into SheetJS rows. */
function buildRowsFromWorksheet(sheet?: Partial<IWorksheetData>): Array<Array<string | number | boolean | null>> {
  // 逻辑：按最大行列输出二维数组，缺失单元格填 null。
  const cellData = sheet?.cellData as SheetCellMatrix | undefined;
  const { rows, columns } = resolveMatrixSize(cellData);
  const output: Array<Array<string | number | boolean | null>> = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row: Array<string | number | boolean | null> = [];
    for (let colIndex = 0; colIndex < columns; colIndex += 1) {
      const cell = cellData?.[rowIndex]?.[colIndex];
      row.push(cell?.v ?? null);
    }
    output.push(row);
  }
  return output;
}

/** Convert Univer workbook snapshot into an ArrayBuffer for Excel. */
function buildXlsxBuffer(snapshot: IWorkbookData, bookType: SheetBookType): ArrayBuffer {
  // 逻辑：仅导出单元格值，样式与公式保持最小化处理。
  const workbook = XLSX.utils.book_new();
  snapshot.sheetOrder.forEach((sheetId, index) => {
    const sheet = snapshot.sheets[sheetId];
    if (!sheet) return;
    const rows = buildRowsFromWorksheet(sheet);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const name = sheet.name || `Sheet${index + 1}`;
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  return XLSX.write(workbook, { type: "array", bookType });
}

/** Resolve Excel book type by extension or URI suffix. */
function resolveBookType(ext?: string, uri?: string): SheetBookType {
  const key = (ext ?? "").toLowerCase();
  if (key === "xls") return "xls";
  if (key === "xlsx") return "xlsx";
  if (uri && uri.toLowerCase().endsWith(".xls")) return "xls";
  return "xlsx";
}

/** Build a new file uri for saving excel files. */
function resolveSaveUri(uri: string, ext?: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return uri;
  const fallbackExt = (ext ?? "").toLowerCase() === "xls" ? "xls" : "xlsx";
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    const parts = trimmed.split("/").filter(Boolean);
    const currentName = parts.pop() ?? `workbook.${fallbackExt}`;
    const lowerName = currentName.toLowerCase();
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      return trimmed;
    }
    const baseName = currentName.replace(/\.[^.]+$/, "") || currentName;
    const nextName = `${baseName}.${fallbackExt}`;
    parts.push(nextName);
    return parts.join("/");
  }
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const currentName = parts.pop() ?? `workbook.${fallbackExt}`;
    const lowerName = currentName.toLowerCase();
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      return trimmed;
    }
    const baseName = currentName.replace(/\.[^.]+$/, "") || currentName;
    const nextName = `${baseName}.${fallbackExt}`;
    parts.push(nextName);
    url.pathname = `/${parts.map(encodeURIComponent).join("/")}`;
    return url.toString();
  } catch {
    return trimmed;
  }
}

/** Create a Univer instance for sheet editing. */
type UniverPluginSkipSet = Set<string>;

/** Read debug skip list from URL query. */
function resolveUniverSkipPlugins(): UniverPluginSkipSet {
  // 逻辑：通过 URL query 控制跳过插件，便于快速定位问题。
  if (typeof window === "undefined") return new Set();
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("univerSkip");
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function createSheetUniver(
  container: HTMLElement,
  isDark: boolean,
  readOnly: boolean,
  skipPlugins?: UniverPluginSkipSet
): Univer {
  // 诊断：定位初始化过程中触发异常的插件注册点。
  console.info("[SheetViewer] createSheetUniver: start", { skipPlugins: [...(skipPlugins ?? [])] });
  const univer = new Univer({
    theme: defaultTheme,
    locale: LocaleType.ZH_CN,
    locales: DEFAULT_LOCALES,
    logLevel: LogLevel.SILENT,
    darkMode: isDark,
  });
  const shouldSkip = (key: string) => Boolean(skipPlugins?.has(key));
  if (shouldSkip("render-engine")) {
    console.info("[SheetViewer] skip UniverRenderEnginePlugin");
  } else {
    console.info("[SheetViewer] register UniverRenderEnginePlugin");
    univer.registerPlugin(UniverRenderEnginePlugin);
  }
  if (shouldSkip("ui")) {
    console.info("[SheetViewer] skip UniverUIPlugin");
  } else {
    console.info("[SheetViewer] register UniverUIPlugin");
    univer.registerPlugin(UniverUIPlugin, {
      container,
      header: !readOnly,
      toolbar: !readOnly,
      footer: true,
      headerMenu: false,
      contextMenu: true,
      disableAutoFocus: true,
    });
  }
  // Sheets UI 依赖 EditorService，需要提前注册 Docs UI 相关插件。
  if (shouldSkip("docs")) {
    console.info("[SheetViewer] skip UniverDocsPlugin");
  } else {
    console.info("[SheetViewer] register UniverDocsPlugin");
    univer.registerPlugin(UniverDocsPlugin);
  }
  if (shouldSkip("docs-ui")) {
    console.info("[SheetViewer] skip UniverDocsUIPlugin");
  } else {
    console.info("[SheetViewer] register UniverDocsUIPlugin");
    univer.registerPlugin(UniverDocsUIPlugin);
  }
  if (shouldSkip("sheets")) {
    console.info("[SheetViewer] skip UniverSheetsPlugin");
  } else {
    console.info("[SheetViewer] register UniverSheetsPlugin");
    univer.registerPlugin(UniverSheetsPlugin);
  }
  if (shouldSkip("formula")) {
    console.info("[SheetViewer] skip UniverFormulaEnginePlugin");
  } else {
    console.info("[SheetViewer] register UniverFormulaEnginePlugin");
    univer.registerPlugin(UniverFormulaEnginePlugin);
  }
  if (shouldSkip("sheets-formula")) {
    console.info("[SheetViewer] skip UniverSheetsFormulaPlugin");
  } else {
    console.info("[SheetViewer] register UniverSheetsFormulaPlugin");
    univer.registerPlugin(UniverSheetsFormulaPlugin);
  }
  if (shouldSkip("sheets-ui")) {
    console.info("[SheetViewer] skip UniverSheetsUIPlugin");
  } else {
    console.info("[SheetViewer] register UniverSheetsUIPlugin");
    univer.registerPlugin(UniverSheetsUIPlugin, {
      formulaBar: !readOnly,
      // 逻辑：关闭“数字以文本存储”的提示弹窗。
      disableForceStringAlert: true,
    footer: {
      sheetBar: true,
      statisticBar: true,
      // 逻辑：隐藏底部菜单区，避免出现“切换网格线”按钮。
      menus: false,
      zoomSlider: true,
    },
  });
  }
  console.info("[SheetViewer] createSheetUniver: done");
  return univer;
}

/** Render an Excel preview/editor panel powered by Univer. */
export default function SheetViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: SheetViewerProps) {
  // 逻辑：仅在 stack 面板场景下展示最小化/关闭按钮。
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const isReadOnly = Boolean(readOnly);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  /** Tracks the current loading status. */
  const [status, setStatus] = useState<SheetViewerStatus>("idle");
  /** Track whether the workbook has unsaved changes. */
  const [isDirty, setIsDirty] = useState(false);
  /** Holds the latest workbook snapshot for initialization. */
  const [snapshot, setSnapshot] = useState<IWorkbookData | null>(null);
  /** Holds the Univer instance for disposal. */
  const univerRef = useRef<Univer | null>(null);
  /** Holds the workbook instance for save operations. */
  const workbookRef = useRef<SheetWorkbook | null>(null);
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
  /** Holds the binary payload fetched from the fs API. */
  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({
      workspaceId,
      projectId,
      uri: uri ?? "",
    }),
    enabled: shouldUseFs && Boolean(uri) && Boolean(workspaceId),
  });
  /** Mutation handler for persisting binary payloads. */
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());

  /** Display name shown in the panel header. */
  const displayTitle = useMemo(() => name ?? uri ?? "Excel", [name, uri]);

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
    try {
      const buffer = decodeBase64ToArrayBuffer(payload);
      const nextSnapshot = buildWorkbookSnapshot(buffer, displayTitle);
      setSnapshot(nextSnapshot);
      setIsDirty(false);
    } catch {
      setStatus("error");
    }
  }, [displayTitle, fileQuery.data?.contentBase64, fileQuery.isError, fileQuery.isLoading, shouldUseFs]);

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
    const skipPlugins = resolveUniverSkipPlugins();
    const univer = createSheetUniver(mountContainer, isDark, isReadOnly, skipPlugins);
    univerRef.current = univer;
    const workbook = univer.createUnit(
      UniverInstanceType.UNIVER_SHEET,
      snapshot
    ) as unknown as SheetWorkbook;
    workbookRef.current = workbook;

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
      const workbook = workbookRef.current;
      const univerInstance = univerRef.current;
      commandDisposableRef.current = null;
      readOnlyDisposableRef.current = null;
      workbookRef.current = null;
      univerRef.current = null;
      // 逻辑：延迟卸载内部 React root，避免渲染期同步 unmount。
      window.setTimeout(() => {
        commandDisposable?.dispose();
        readOnlyDisposable?.dispose();
        workbook?.dispose();
        univerInstance?.dispose();
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

  /** Persist current workbook to an Excel file. */
  const handleSave = async () => {
    // 逻辑：导出当前快照为 Excel，并写回本地文件。
    if (!uri || !shouldUseFs) {
      toast.error("暂不支持保存此地址");
      return;
    }
    const workbook = workbookRef.current;
    if (!workbook) {
      toast.error("没有可保存的内容");
      return;
    }
    try {
      const snapshot = workbook.save();
      const bookType = resolveBookType(ext, uri);
      const buffer = buildXlsxBuffer(snapshot, bookType);
      const contentBase64 = encodeArrayBufferToBase64(buffer);
      const saveUri = resolveSaveUri(uri, ext);
      await writeBinaryMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: saveUri,
        contentBase64,
      });
      setIsDirty(false);
      if (saveUri !== uri) {
        toast.success("已另存为 Excel 文件");
      } else {
        toast.success("已保存");
      }
    } catch {
      toast.error("保存失败");
    }
  };

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择表格</div>;
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
                  const ok = window.confirm("当前表格尚未保存，确定要关闭吗？");
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
        {status === "loading" || fileQuery.isLoading ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            加载中…
          </div>
        ) : null}
        {status === "error" || fileQuery.isError ? (
          <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            表格预览失败
          </div>
        ) : null}
        <div className="h-full min-h-0 flex-1" ref={containerRef} />
      </div>
    </div>
  );
}
