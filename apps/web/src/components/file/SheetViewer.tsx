"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, Plus, Save } from "lucide-react";
import { DataGrid, renderTextEditor, type Column } from "react-data-grid";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabs } from "@/hooks/use-tabs";
import { trpc } from "@/utils/trpc";

import "react-data-grid/lib/styles.css";
import "./spreadsheet-viewer.css";

type SheetCell = string;
type SheetRow = Record<string, SheetCell> & { __rowId: string };

type SheetState = {
  /** Sheet display name. */
  name: string;
  /** Sheet row data for the grid. */
  rows: SheetRow[];
  /** Column definitions for the grid. */
  columns: Column<SheetRow>[];
  /** Column key order for serialization. */
  columnKeys: string[];
};

interface SheetViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  panelKey?: string;
  tabId?: string;
}

/** Convert base64 payload into a Uint8Array for SheetJS. */
function decodeBase64ToBytes(payload: string): Uint8Array {
  // 使用 atob 解码 base64，再转成 Uint8Array，避免额外依赖。
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

/** Normalize cell value for grid editing. */
function normalizeCellValue(
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Normalize an Excel sheet into grid rows/columns. */
function buildSheetState(name: string, sheet?: XLSX.WorkSheet): SheetState {
  /** Row number column stays frozen on the left. */
  const rowNumberColumn: Column<SheetRow> = {
    key: "__rowNumber",
    name: "",
    width: 56,
    minWidth: 56,
    maxWidth: 72,
    frozen: true,
    editable: false,
    resizable: false,
    sortable: false,
    headerCellClass: "sheet-viewer-row-number-header",
    cellClass: "sheet-viewer-row-number-cell",
    renderCell: ({ rowIdx }) => (
      <span className="sheet-viewer-row-number">{rowIdx + 1}</span>
    ),
  };
  if (!sheet) {
    return {
      name,
      rows: [],
      columns: [
        rowNumberColumn,
        { key: "A", name: "A", editable: true, renderEditCell: renderTextEditor },
      ],
      columnKeys: ["A"],
    };
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as Array<
    Array<string | number | boolean | null | undefined>
  >;
  const ref = sheet["!ref"];
  const range = ref ? XLSX.utils.decode_range(ref) : null;
  const maxCols = Math.max(
    range ? range.e.c + 1 : 0,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
    1
  );
  const normalizedRows: SheetRow[] = rows.map((row, rowIndex) => {
    const nextRow: SheetRow = { __rowId: `row-${rowIndex}` };
    for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
      const key = XLSX.utils.encode_col(colIndex);
      nextRow[key] = normalizeCellValue(row[colIndex]);
    }
    return nextRow;
  });
  const columnKeys = Array.from({ length: maxCols }, (_, colIndex) =>
    XLSX.utils.encode_col(colIndex)
  );
  const columns: Column<SheetRow>[] = columnKeys.map((key) => {
    return {
      key,
      name: key,
      editable: true,
      renderEditCell: renderTextEditor,
    };
  });
  return { name, rows: normalizedRows, columns: [rowNumberColumn, ...columns], columnKeys };
}

/** Build a new file uri for saving xlsx. */
function resolveSaveUri(uri: string): string {
  try {
    const url = new URL(uri);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const currentName = parts.pop() ?? "workbook.xlsx";
    if (currentName.toLowerCase().endsWith(".xlsx")) {
      return uri;
    }
    const baseName = currentName.replace(/\.[^.]+$/, "") || currentName;
    const nextName = `${baseName}.xlsx`;
    parts.push(nextName);
    url.pathname = `/${parts.map(encodeURIComponent).join("/")}`;
    return url.toString();
  } catch {
    return uri;
  }
}

/** Render an Excel preview/editor panel. */
export default function SheetViewer({ uri, name, panelKey, tabId }: SheetViewerProps) {
  /** Tracks the current loading status. */
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  /** Holds parsed sheets for preview/editing. */
  const [sheets, setSheets] = useState<SheetState[]>([]);
  /** Active sheet index for tab switching. */
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  /** Marks whether the grid has unsaved changes. */
  const [isDirty, setIsDirty] = useState(false);
  /** Minimize current stack panel. */
  const setStackHidden = useTabs((s) => s.setStackHidden);
  /** Close current stack panel. */
  const removeStackItem = useTabs((s) => s.removeStackItem);

  /** Flags whether the viewer should load via fs.readBinary. */
  const shouldUseFs = typeof uri === "string" && uri.startsWith("file://");
  /** Holds the binary payload fetched from the fs API. */
  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({ uri: uri ?? "" }),
    enabled: shouldUseFs && Boolean(uri),
  });
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());

  /** Display name shown in the panel header. */
  const displayTitle = useMemo(() => name ?? uri ?? "Excel", [name, uri]);
  const sheetNames = useMemo(() => sheets.map((sheet) => sheet.name), [sheets]);
  const activeSheet = sheets[activeSheetIndex];

  useEffect(() => {
    setStatus("idle");
    setSheets([]);
    setActiveSheetIndex(0);
    setIsDirty(false);
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
      const data = decodeBase64ToBytes(payload);
      const workbook = XLSX.read(data, { type: "array" });
      const nextSheets = workbook.SheetNames.map((sheetName) =>
        buildSheetState(sheetName, workbook.Sheets[sheetName])
      );
      setSheets(nextSheets);
      setActiveSheetIndex(0);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [fileQuery.data?.contentBase64, fileQuery.isError, fileQuery.isLoading, shouldUseFs]);

  /** Persist current workbook to an xlsx file. */
  const handleSave = async () => {
    if (!uri || !shouldUseFs) {
      toast.error("暂不支持保存此地址");
      return;
    }
    if (!sheets.length) {
      toast.error("没有可保存的内容");
      return;
    }
    try {
      const workbook = XLSX.utils.book_new();
      for (const sheet of sheets) {
        const data = sheet.rows.map((row) =>
          sheet.columnKeys.map((key) => (row[key] === "" ? null : row[key]))
        );
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }
      const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const contentBase64 = encodeArrayBufferToBase64(buffer);
      const saveUri = resolveSaveUri(uri);
      await writeBinaryMutation.mutateAsync({ uri: saveUri, contentBase64 });
      setIsDirty(false);
      if (saveUri !== uri) {
        toast.success("已另存为 XLSX 文件");
      } else {
        toast.success("已保存");
      }
    } catch {
      toast.error("保存失败");
    }
  };

  /** Open current file in the system default program. */
  const handleOpenInSystem = useCallback(async () => {
    if (!uri) return;
    if (!shouldUseFs) {
      toast.error("暂不支持此地址");
      return;
    }
    const api = window.teatimeElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    const res = await api.openPath({ uri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  }, [shouldUseFs, uri]);

  /** Apply row changes from the grid. */
  const handleRowsChange = useCallback(
    (nextRows: SheetRow[]) => {
      setSheets((prev) =>
        prev.map((sheet, index) => {
          if (index !== activeSheetIndex) return sheet;
          // 确保每行都有稳定的 row id，避免编辑时丢失。
          const normalizedRows = nextRows.map((row, rowIndex) => {
            const nextRow: SheetRow = {
              ...(row.__rowId ? row : { ...row, __rowId: `row-${rowIndex}` }),
              __rowId: row.__rowId ?? `row-${rowIndex}`,
            };
            for (const key of sheet.columnKeys) {
              nextRow[key] = normalizeCellValue(nextRow[key]);
            }
            return nextRow;
          });
          return { ...sheet, rows: normalizedRows };
        })
      );
      setIsDirty(true);
    },
    [activeSheetIndex]
  );

  /** Add an empty row to the active sheet. */
  const handleAddRow = useCallback(() => {
    if (!activeSheet) return;
    const nextRow: SheetRow = { __rowId: `row-${Date.now()}` };
    for (const key of activeSheet.columnKeys) {
      nextRow[key] = "";
    }
    setSheets((prev) =>
      prev.map((sheet, index) =>
        index === activeSheetIndex ? { ...sheet, rows: [...sheet.rows, nextRow] } : sheet
      )
    );
    setIsDirty(true);
  }, [activeSheet, activeSheetIndex]);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择表格</div>;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        rightSlot={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="使用系统程序打开"
                  onClick={() => void handleOpenInSystem()}
                  disabled={!shouldUseFs}
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">使用系统程序打开</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="新增行"
                  onClick={handleAddRow}
                  disabled={!activeSheet || status !== "ready"}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">新增行</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="保存"
                  onClick={() => void handleSave()}
                  disabled={
                    !shouldUseFs ||
                    status !== "ready" ||
                    writeBinaryMutation.isPending ||
                    !isDirty
                  }
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">保存</TooltipContent>
            </Tooltip>
          </div>
        }
        showMinimize
        onMinimize={() => {
          if (!tabId) return;
          setStackHidden(tabId, true);
        }}
        onClose={() => {
          if (!tabId || !panelKey) return;
          if (isDirty) {
            const ok = window.confirm("当前表格尚未保存，确定要关闭吗？");
            if (!ok) return;
          }
          removeStackItem(tabId, panelKey);
        }}
      />
      <div className="border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {sheetNames.length === 0 ? (
            <span className="text-xs text-muted-foreground">无工作表</span>
          ) : (
            sheetNames.map((sheetName, index) => (
              <Button
                key={sheetName}
                variant={index === activeSheetIndex ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setActiveSheetIndex(index)}
              >
                {sheetName}
              </Button>
            ))
          )}
        </div>
      </div>
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
        {activeSheet ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <DataGrid
              className="sheet-viewer-grid"
              columns={activeSheet.columns}
              rows={activeSheet.rows}
              rowKeyGetter={(row) => row.__rowId}
              onRowsChange={handleRowsChange}
              style={{ height: "100%" }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
