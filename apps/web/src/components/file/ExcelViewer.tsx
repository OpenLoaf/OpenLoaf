"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { DataGrid, type Column } from "react-data-grid";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@tenas-ai/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";

import "react-data-grid/lib/styles.css";
import "@/components/file/style/spreadsheet-viewer.css";

interface ExcelViewerProps {
  /** Absolute or workspace-relative file uri. */
  uri?: string;
  /** Original open uri for system open. */
  openUri?: string;
  /** Optional display name. */
  name?: string;
  /** Optional extension hint. */
  ext?: string;
  /** Project id for file access. */
  projectId?: string;
  /** Root uri for external open. */
  rootUri?: string;
  /** Stack panel key for close handling. */
  panelKey?: string;
  /** Tab id for stack context. */
  tabId?: string;
  /** Whether the viewer is read-only. */
  readOnly?: boolean;
}

type ExcelViewerStatus = "idle" | "loading" | "ready" | "error";

type CellValue = string | number | boolean | null;

type SheetState = {
  /** Sheet name. */
  name: string;
  /** Sheet cells in row-major order. */
  rows: CellValue[][];
};

type SheetRow = {
  /** Row id for DataGrid. */
  id: number;
  /** Dynamic columns map. */
  [key: string]: CellValue;
};

/** Minimum visible columns to keep layout stable. */
const MIN_VISIBLE_COLUMNS = 26;
/** Minimum visible rows to keep layout stable. */
const MIN_VISIBLE_ROWS = 30;

/** Convert base64 payload into ArrayBuffer for SheetJS parsing. */
function decodeBase64ToArrayBuffer(payload: string): ArrayBuffer {
  // 逻辑：使用 atob 解码 base64，再拷贝到 ArrayBuffer，避免额外依赖。
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert ArrayBuffer into base64 payload for fs.writeBinary. */
function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  // 逻辑：分片拼接避免 call stack 过大。
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Normalize a raw cell value into a grid-friendly value. */
function normalizeCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

/** Convert a zero-based column index into an Excel-style column name. */
function toColumnName(index: number): string {
  // 逻辑：按 26 进制转换，A-Z 后继续 AA、AB。
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

/** Build Sheet state list from SheetJS workbook. */
function buildSheetStates(workbook: XLSX.WorkBook): SheetState[] {
  const sheetNames = workbook.SheetNames.length > 0 ? workbook.SheetNames : ["Sheet1"];
  return sheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) {
      return { name, rows: [] };
    }
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
      header: 1,
      blankrows: true,
    });
    return { name, rows: rows.map((row) => row.map((cell) => normalizeCellValue(cell))) };
  });
}

/** Compute the maximum column count for a sheet. */
function getMaxColumnCount(rows: CellValue[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

/** Trim trailing empty rows and columns for export. */
function trimSheetRows(rows: CellValue[][]): CellValue[][] {
  let lastRow = -1;
  let lastColumn = -1;
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === null || cell === undefined || cell === "") return;
      if (rowIndex > lastRow) lastRow = rowIndex;
      if (colIndex > lastColumn) lastColumn = colIndex;
    });
  });
  if (lastRow < 0 || lastColumn < 0) return [];
  return rows.slice(0, lastRow + 1).map((row) => row.slice(0, lastColumn + 1));
}

/** Build a unique sheet name from existing names. */
function createSheetName(existingNames: string[]): string {
  // 逻辑：从 Sheet1 开始递增，避免重名。
  let index = existingNames.length + 1;
  let name = `Sheet${index}`;
  while (existingNames.includes(name)) {
    index += 1;
    name = `Sheet${index}`;
  }
  return name;
}

/** Render an Excel preview/editor panel powered by SheetJS + react-data-grid. */
export default function ExcelViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: ExcelViewerProps) {
  // 逻辑：仅在 stack 面板场景下展示最小化/关闭按钮。
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const canEdit = !readOnly;
  const [isEditing, setIsEditing] = useState(false);
  const isReadOnly = !canEdit || !isEditing;
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  /** Tracks the current loading status. */
  const [status, setStatus] = useState<ExcelViewerStatus>("idle");
  /** Track whether the workbook has unsaved changes. */
  const [isDirty, setIsDirty] = useState(false);
  /** Holds parsed sheets for rendering. */
  const [sheets, setSheets] = useState<SheetState[]>([]);
  /** Index of the active sheet. */
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  /** Close current stack panel. */
  const removeStackItem = useTabRuntime((s) => s.removeStackItem);
  /** Resolve current theme for grid rendering. */
  const { resolvedTheme } = useTheme();

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
    setStatus("idle");
    setIsDirty(false);
    setSheets([]);
    setActiveSheetIndex(0);
    setIsEditing(false);
  }, [uri]);

  useEffect(() => {
    if (!canEdit) {
      setIsEditing(false);
    }
  }, [canEdit]);

  useEffect(() => {
    if (!shouldUseFs) return;
    if (fileQuery.isLoading) return;
    if (fileQuery.isError) {
      console.error("[ExcelViewer] readBinary failed", fileQuery.error);
      setStatus("error");
      return;
    }
    const payload = fileQuery.data?.contentBase64;
    if (!payload) {
      console.error("[ExcelViewer] empty payload");
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const buffer = decodeBase64ToArrayBuffer(payload);
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const nextSheets = buildSheetStates(workbook);
      setSheets(nextSheets);
      setActiveSheetIndex(0);
      setIsDirty(false);
      setStatus("ready");
    } catch (error) {
      console.error("[ExcelViewer] parse failed", error);
      setStatus("error");
    }
  }, [fileQuery.data?.contentBase64, fileQuery.error, fileQuery.isError, fileQuery.isLoading, shouldUseFs]);

  useEffect(() => {
    if (activeSheetIndex < sheets.length) return;
    if (sheets.length === 0) return;
    setActiveSheetIndex(0);
  }, [activeSheetIndex, sheets.length]);

  /** Active sheet for rendering. */
  const activeSheet = sheets[activeSheetIndex] ?? null;
  /** Current grid column names. */
  const columnKeys = useMemo(() => {
    const maxColumns = activeSheet ? getMaxColumnCount(activeSheet.rows) : 0;
    const targetColumns = Math.max(maxColumns, MIN_VISIBLE_COLUMNS);
    return Array.from({ length: targetColumns }, (_, index) => toColumnName(index));
  }, [activeSheet]);

  /** Build DataGrid column definitions. */
  const columns = useMemo<Column<SheetRow>[]>(() => {
    const rowNumberColumn: Column<SheetRow> = {
      key: "__rowNumber",
      name: "",
      width: 56,
      minWidth: 56,
      maxWidth: 72,
      frozen: true,
      headerCellClass: "sheet-viewer-row-number-header",
      cellClass: "sheet-viewer-row-number-cell",
      renderCell: ({ rowIdx }) => (
        <span className="sheet-viewer-row-number">{rowIdx + 1}</span>
      ),
    };
    const dataColumns = columnKeys.map((key) => ({
      key,
      name: key,
      editable: !isReadOnly,
      resizable: true,
      minWidth: 96,
    }));
    return [rowNumberColumn, ...dataColumns];
  }, [columnKeys, isReadOnly]);

  /** Build DataGrid rows from active sheet data. */
  const gridRows = useMemo<SheetRow[]>(() => {
    const sourceRows = activeSheet?.rows ?? [];
    const rowCount = Math.max(sourceRows.length, MIN_VISIBLE_ROWS);
    return Array.from({ length: rowCount }, (_, rowIdx) => {
      const rowValues = sourceRows[rowIdx] ?? [];
      const row: SheetRow = { id: rowIdx };
      columnKeys.forEach((key, colIdx) => {
        row[key] = rowValues[colIdx] ?? null;
      });
      return row;
    });
  }, [activeSheet, columnKeys]);

  /** Handle DataGrid cell edits. */
  const handleRowsChange = useCallback(
    (nextRows: SheetRow[]) => {
      if (isReadOnly) return;
      const nextMatrix = nextRows.map((row) =>
        columnKeys.map((key) => normalizeCellValue(row[key]))
      );
      setSheets((prev) => {
        if (!prev[activeSheetIndex]) return prev;
        const nextSheets = [...prev];
        nextSheets[activeSheetIndex] = {
          ...prev[activeSheetIndex],
          rows: nextMatrix,
        };
        return nextSheets;
      });
      setIsDirty(true);
    },
    [activeSheetIndex, columnKeys, isReadOnly]
  );

  /** Add a new empty sheet to the workbook. */
  const handleAddSheet = useCallback(() => {
    if (isReadOnly) return;
    setSheets((prev) => {
      const nextName = createSheetName(prev.map((sheet) => sheet.name));
      return [...prev, { name: nextName, rows: [] }];
    });
    setActiveSheetIndex(sheets.length);
    setIsDirty(true);
  }, [isReadOnly, sheets.length]);

  /** Persist current workbook to an Excel file. */
  const handleSave = useCallback(async () => {
    // 逻辑：导出当前快照为 Excel，并写回本地文件。
    if (!uri || !shouldUseFs) {
      toast.error("暂不支持保存此地址");
      return;
    }
    if (!projectId || !workspaceId) {
      toast.error("未找到工作区信息");
      return;
    }
    try {
      const workbook = XLSX.utils.book_new();
      const sheetList = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }];
      sheetList.forEach((sheet) => {
        const trimmedRows = trimSheetRows(sheet.rows);
        const safeRows = trimmedRows.length > 0 ? trimmedRows : [[]];
        const worksheet = XLSX.utils.aoa_to_sheet(safeRows);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name || "Sheet");
      });
      const normalizedExt = ext?.toLowerCase();
      const bookType = normalizedExt === "xls" ? "xls" : "xlsx";
      const arrayBuffer = XLSX.write(workbook, { type: "array", bookType });
      const contentBase64 = encodeArrayBufferToBase64(arrayBuffer as ArrayBuffer);
      await writeBinaryMutation.mutateAsync({
        workspaceId,
        projectId,
        uri,
        contentBase64,
      });
      setIsDirty(false);
      toast.success("已保存");
    } catch (error) {
      console.error("[ExcelViewer] save failed", error);
      toast.error("保存失败");
    }
  }, [projectId, sheets, shouldUseFs, uri, workspaceId, writeBinaryMutation]);

  /** Current grid theme class. */
  const gridThemeClass = resolvedTheme === "dark" ? "rdg-dark" : "rdg-light";

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
          canEdit ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing((prev) => !prev)}
                aria-pressed={isEditing}
              >
                {isEditing ? "只读" : "编辑"}
              </Button>
              {!isReadOnly ? (
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
              ) : null}
            </div>
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-full min-h-0 flex-1 p-3">
            <DataGrid
              className={cn("sheet-viewer-grid h-full show-scrollbar", gridThemeClass)}
              columns={columns}
              rows={gridRows}
              rowKeyGetter={(row) => row.id}
              onRowsChange={isReadOnly ? undefined : handleRowsChange}
              defaultColumnOptions={{ resizable: true }}
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto border-t border-border/60 bg-muted/30 px-2 py-2 show-scrollbar">
            {sheets.map((sheet, index) => (
              <button
                key={sheet.name}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition",
                  index === activeSheetIndex
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveSheetIndex(index)}
              >
                {sheet.name}
              </button>
            ))}
            {!isReadOnly ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={handleAddSheet}
              >
                <Plus className="h-3.5 w-3.5" />
                新增 Sheet
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
