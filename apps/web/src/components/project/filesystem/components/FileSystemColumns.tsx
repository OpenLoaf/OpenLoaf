"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { trpc } from "@/utils/trpc";
import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFileExt,
  isBoardFolderName,
} from "@/lib/file-name";
import {
  type FileSystemEntry,
  formatSize,
  formatTimestamp,
  getEntryExt,
  IGNORE_NAMES,
} from "../utils/file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  getEntryVisual,
} from "./FileSystemEntryVisual";
import { FileSystemSearchEmptyState } from "./FileSystemEmptyState";
import { useFileSystemDrag } from "../hooks/use-file-system-drag";
import { useFileSystemSelection } from "../hooks/use-file-system-selection";
import { useFolderThumbnails } from "../hooks/use-folder-thumbnails";

/** Return true when the entry represents a board folder. */
const isBoardFolderEntry = (entry: FileSystemEntry) =>
  entry.kind === "folder" && isBoardFolderName(entry.name);

/** Base layout for column rows. */
const columnRowBaseClassName =
  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-foreground";

/** Extension display labels for column metadata. */
const COLUMN_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
};

/** Build column uris from root to current. */
function buildColumnUris(rootUri?: string, currentUri?: string | null) {
  if (!rootUri) return [];
  if (!currentUri) return [rootUri];
  try {
    const rootUrl = new URL(rootUri);
    const currentUrl = new URL(currentUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const currentParts = currentUrl.pathname.split("/").filter(Boolean);
    if (currentParts.length < rootParts.length) return [rootUri];
    const relativeParts = currentParts.slice(rootParts.length);
    const uris: string[] = [rootUri];
    let accumParts = [...rootParts];
    // 从 root 向下构建列路径，确保列顺序稳定。
    for (const part of relativeParts) {
      accumParts = [...accumParts, part];
      const nextUrl = new URL(rootUri);
      nextUrl.pathname = `/${accumParts.join("/")}`;
      uris.push(nextUrl.toString());
    }
    return uris;
  } catch {
    return [rootUri];
  }
}

/** Resolve the display name for column rows. */
function resolveColumnDisplayName(entry: FileSystemEntry) {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Resolve column type label for a file system entry. */
function resolveEntryTypeLabel(entry: FileSystemEntry) {
  if (entry.kind === "folder") {
    return isBoardFolderName(entry.name) ? "画布" : "文件夹";
  }
  const ext = getEntryExt(entry);
  if (!ext) return "文件";
  if (isBoardFileExt(ext)) return "画布";
  const override = COLUMN_TYPE_LABEL_OVERRIDES[ext];
  if (override) return override;
  return ext.toUpperCase();
}

type FileSystemColumnRowProps = {
  entry: FileSystemEntry;
  thumbnailSrc?: string;
  isSelected?: boolean;
  isPathSelected?: boolean;
  isDragOver?: boolean;
  entryRef?: (node: HTMLButtonElement | null) => void;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnter?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
};

/** Render a single column row entry. */
const FileSystemColumnRow = memo(function FileSystemColumnRow({
  entry,
  thumbnailSrc,
  isSelected = false,
  isPathSelected = false,
  isDragOver = false,
  entryRef,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
}: FileSystemColumnRowProps) {
  const displayName = useMemo(() => resolveColumnDisplayName(entry), [entry]);
  const visual = useMemo(
    () =>
      getEntryVisual({
        kind: entry.kind,
        name: entry.name,
        ext: entry.ext,
        isEmpty: entry.isEmpty,
        thumbnailSrc,
        sizeClassName: "h-5 w-5",
        thumbnailIconClassName: "h-full w-full p-1 text-muted-foreground",
      }),
    [entry.ext, entry.isEmpty, entry.kind, entry.name, thumbnailSrc]
  );
  const showChevron = entry.kind === "folder" && !isBoardFolderEntry(entry);
  const selectionClassName = isSelected
    ? "bg-muted/70 ring-1 ring-border"
    : isPathSelected
      ? "bg-muted/40"
      : "";
  const dragClassName = isDragOver ? "bg-muted/80 ring-1 ring-border" : "";

  return (
    <button
      ref={entryRef}
      type="button"
      data-entry-card="true"
      data-entry-uri={entry.uri}
      className={`${columnRowBaseClassName} hover:bg-muted/80 ${selectionClassName} ${dragClassName}`}
      draggable
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {visual}
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
      </span>
      {showChevron ? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      ) : null}
    </button>
  );
});
FileSystemColumnRow.displayName = "FileSystemColumnRow";

type FileSystemColumnRenameRowProps = {
  entry: FileSystemEntry;
  thumbnailSrc?: string;
  isSelected?: boolean;
  entryRef?: (node: HTMLDivElement | null) => void;
  renamingValue?: string;
  onRenamingChange?: (value: string) => void;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
};

/** Render a rename row for column layout. */
const FileSystemColumnRenameRow = memo(function FileSystemColumnRenameRow({
  entry,
  thumbnailSrc,
  isSelected = false,
  entryRef,
  renamingValue,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
}: FileSystemColumnRenameRowProps) {
  const displayName = useMemo(() => resolveColumnDisplayName(entry), [entry]);
  const visual = useMemo(
    () =>
      getEntryVisual({
        kind: entry.kind,
        name: entry.name,
        ext: entry.ext,
        isEmpty: entry.isEmpty,
        thumbnailSrc,
        sizeClassName: "h-5 w-5",
        thumbnailIconClassName: "h-full w-full p-1 text-muted-foreground",
      }),
    [entry.ext, entry.isEmpty, entry.kind, entry.name, thumbnailSrc]
  );

  return (
    <div
      ref={entryRef}
      data-entry-card="true"
      data-entry-uri={entry.uri}
      className={`${columnRowBaseClassName} ${
        isSelected ? "bg-muted/70 ring-1 ring-border" : ""
      }`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {visual}
        <Input
          value={renamingValue ?? displayName}
          onChange={(event) => onRenamingChange?.(event.target.value)}
          className="h-6 w-full rounded-sm border border-border/60 bg-background px-2 py-0 text-left text-xs leading-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
              event.stopPropagation();
              return;
            }
            if (event.key === "Enter") {
              onRenamingSubmit?.();
            }
            if (event.key === "Escape") {
              onRenamingCancel?.();
            }
          }}
          onBlur={() => onRenamingSubmit?.()}
        />
      </span>
    </div>
  );
});
FileSystemColumnRenameRow.displayName = "FileSystemColumnRenameRow";

type FileSystemColumnsProps = {
  entries: FileSystemEntry[];
  isLoading: boolean;
  isSearchLoading?: boolean;
  searchQuery?: string;
  rootUri?: string;
  currentUri?: string | null;
  includeHidden?: boolean;
  sortField?: "name" | "mtime" | null;
  sortOrder?: "asc" | "desc" | null;
  dragProjectId?: string;
  dragRootUri?: string;
  onNavigate?: (nextUri: string) => void;
  /** Open image entries in an external viewer. */
  onOpenImage?: (entry: FileSystemEntry) => void;
  /** Open code entries in an external viewer. */
  onOpenCode?: (entry: FileSystemEntry) => void;
  /** Open PDF entries in an external viewer. */
  onOpenPdf?: (entry: FileSystemEntry) => void;
  /** Open DOC entries in an external viewer. */
  onOpenDoc?: (entry: FileSystemEntry) => void;
  /** Open spreadsheet entries in an external viewer. */
  onOpenSpreadsheet?: (entry: FileSystemEntry) => void;
  /** Open board entries in the board viewer. */
  onOpenBoard?: (entry: FileSystemEntry) => void;
  renderEntry?: (entry: FileSystemEntry, node: ReactNode) => ReactNode;
  onEntryClick?: (
    entry: FileSystemEntry,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void;
  onEntryContextMenu?: (
    entry: FileSystemEntry,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void;
  /** Resolve selection mode when starting a drag selection. */
  resolveSelectionMode?: (
    event: ReactMouseEvent<HTMLDivElement>
  ) => "replace" | "toggle";
  /** Capture context menu trigger before Radix handles it. */
  onGridContextMenuCapture?: (
    event: ReactMouseEvent<HTMLDivElement>,
    payload: { uri: string | null; entry?: FileSystemEntry | null }
  ) => void;
  selectedUris?: Set<string>;
  onEntryDrop?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  onEntryDragStart?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  renamingUri?: string | null;
  renamingValue?: string;
  onRenamingChange?: (value: string) => void;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
  onSelectionChange?: (uris: string[], mode: "replace" | "toggle") => void;
};

/** File system columns layout with path-aware columns. */
const FileSystemColumns = memo(function FileSystemColumns({
  entries,
  isLoading,
  isSearchLoading = false,
  searchQuery,
  rootUri,
  currentUri,
  includeHidden,
  sortField,
  sortOrder,
  dragProjectId,
  dragRootUri,
  onNavigate,
  onOpenImage,
  onOpenCode,
  onOpenPdf,
  onOpenDoc,
  onOpenSpreadsheet,
  onOpenBoard,
  renderEntry,
  onEntryClick,
  onEntryContextMenu,
  selectedUris,
  onEntryDrop,
  onEntryDragStart,
  renamingUri,
  renamingValue,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
  onSelectionChange,
  resolveSelectionMode,
  onGridContextMenuCapture,
}: FileSystemColumnsProps) {
  const activeUri = currentUri ?? rootUri ?? null;
  const searchText = searchQuery?.trim() ?? "";
  const hasSearchQuery = searchText.length > 0;
  const shouldShowSearchEmpty =
    hasSearchQuery && !isLoading && !isSearchLoading && entries.length === 0;
  const columnUris = useMemo(
    () => buildColumnUris(rootUri, activeUri),
    [rootUri, activeUri]
  );
  const columnSelection = useMemo(
    () => columnUris.map((_, index) => columnUris[index + 1] ?? null),
    [columnUris]
  );
  const columnQueries = useQueries({
    queries: columnUris.map((uri) => ({
      ...trpc.fs.list.queryOptions({
        uri,
        includeHidden,
        sort:
          sortField && sortOrder ? { field: sortField, order: sortOrder } : undefined,
      }),
    })),
  });
  const hasExplicitSelection = (selectedUris?.size ?? 0) > 0;
  const columnItems = useMemo(() => {
    return columnUris.map((uri, index) => {
      const query = columnQueries[index];
      const queryEntries =
        ((query?.data?.entries ?? []) as FileSystemEntry[]).filter((entry) =>
          includeHidden ? true : !IGNORE_NAMES.has(entry.name)
        );
      const isActiveColumn = index === columnUris.length - 1;
      return {
        uri,
        entries: isActiveColumn ? entries : queryEntries,
        isLoading: isActiveColumn ? isLoading : Boolean(query?.isLoading),
        pathSelectedUri: columnSelection[index] ?? null,
      };
    });
  }, [columnQueries, columnSelection, columnUris, entries, includeHidden, isLoading]);
  const allEntries = useMemo(
    () => columnItems.flatMap((column) => column.entries),
    [columnItems]
  );
  const entryByUri = useMemo(
    () => new Map(allEntries.map((entry) => [entry.uri, entry])),
    [allEntries]
  );
  const entryByUriRef = useRef(entryByUri);
  entryByUriRef.current = entryByUri;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const selectedUrisRef = useRef(selectedUris);
  selectedUrisRef.current = selectedUris;
  const dragProjectIdRef = useRef(dragProjectId);
  dragProjectIdRef.current = dragProjectId;
  const dragRootUriRef = useRef(dragRootUri);
  dragRootUriRef.current = dragRootUri;
  const onEntryClickRef = useRef(onEntryClick);
  onEntryClickRef.current = onEntryClick;
  const onEntryContextMenuRef = useRef(onEntryContextMenu);
  onEntryContextMenuRef.current = onEntryContextMenu;
  const onEntryDragStartRef = useRef(onEntryDragStart);
  onEntryDragStartRef.current = onEntryDragStart;
  const onEntryDropRef = useRef(onEntryDrop);
  onEntryDropRef.current = onEntryDrop;
  const onOpenImageRef = useRef(onOpenImage);
  onOpenImageRef.current = onOpenImage;
  const onOpenCodeRef = useRef(onOpenCode);
  onOpenCodeRef.current = onOpenCode;
  const onOpenPdfRef = useRef(onOpenPdf);
  onOpenPdfRef.current = onOpenPdf;
  const onOpenDocRef = useRef(onOpenDoc);
  onOpenDocRef.current = onOpenDoc;
  const onOpenSpreadsheetRef = useRef(onOpenSpreadsheet);
  onOpenSpreadsheetRef.current = onOpenSpreadsheet;
  const onOpenBoardRef = useRef(onOpenBoard);
  onOpenBoardRef.current = onOpenBoard;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const gridRef = useRef<HTMLDivElement>(null);
  // 记录最近一次右键触发的条目与时间，用于 0.5 秒内拦截左右键误触。
  const lastContextMenuRef = useRef<{ uri: string; at: number } | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const { thumbnailByUri } = useFolderThumbnails({
    currentUri: activeUri,
    includeHidden,
  });

  const fallbackPreviewUri = useMemo(() => {
    if (!selectedUris || selectedUris.size !== 1) return null;
    const uri = selectedUris.values().next().value;
    if (!uri) return null;
    const entry = entryByUri.get(uri);
    if (!entry || entry.kind !== "file") return null;
    return entry.uri;
  }, [entryByUri, selectedUris]);
  const previewEntry = useMemo(() => {
    const uri = previewUri ?? fallbackPreviewUri;
    if (!uri) return null;
    const entry = entryByUri.get(uri);
    if (!entry || entry.kind !== "file") return null;
    return entry;
  }, [entryByUri, fallbackPreviewUri, previewUri]);
  useEffect(() => {
    if (!previewUri) return;
    if (entryByUri.has(previewUri)) return;
    setPreviewUri(null);
  }, [entryByUri, previewUri]);
  const previewExt = useMemo(
    () => (previewEntry ? getEntryExt(previewEntry) : ""),
    [previewEntry]
  );
  const isPreviewImage = previewEntry ? IMAGE_EXTS.has(previewExt) : false;
  const isPreviewPdf = previewEntry ? PDF_EXTS.has(previewExt) : false;
  const shouldLoadPreview =
    Boolean(previewEntry) &&
    (isPreviewImage || isPreviewPdf) &&
    Boolean(previewEntry?.uri?.startsWith("file://"));
  const previewQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({ uri: previewEntry?.uri ?? "" }),
    enabled: shouldLoadPreview,
  });
  const previewSrc = useMemo(() => {
    if (!previewEntry) return "";
    const payload = previewQuery.data;
    if (!payload?.contentBase64) return "";
    if (isPreviewImage) {
      const mime = payload.mime || "image/*";
      return `data:${mime};base64,${payload.contentBase64}`;
    }
    if (isPreviewPdf) {
      return `data:application/pdf;base64,${payload.contentBase64}`;
    }
    return "";
  }, [isPreviewImage, isPreviewPdf, previewEntry, previewQuery.data]);
  const previewDisplayName = useMemo(
    () => (previewEntry ? resolveColumnDisplayName(previewEntry) : ""),
    [previewEntry]
  );
  const previewTypeLabel = useMemo(
    () => (previewEntry ? resolveEntryTypeLabel(previewEntry) : ""),
    [previewEntry]
  );
  const previewSizeLabel = useMemo(
    () => (previewEntry ? formatSize(previewEntry.size) : "--"),
    [previewEntry]
  );
  const previewCreatedLabel = useMemo(
    () => (previewEntry ? formatTimestamp(previewEntry.createdAt) : "--"),
    [previewEntry]
  );
  const previewUpdatedLabel = useMemo(
    () => (previewEntry ? formatTimestamp(previewEntry.updatedAt) : "--"),
    [previewEntry]
  );
  const previewVisual = useMemo(() => {
    if (!previewEntry) return null;
    return getEntryVisual({
      kind: previewEntry.kind,
      name: previewEntry.name,
      ext: previewEntry.ext,
      isEmpty: previewEntry.isEmpty,
      sizeClassName: "h-16 w-16",
      thumbnailIconClassName: "h-full w-full p-3 text-muted-foreground",
    });
  }, [previewEntry]);
  const previewColumnIndex = useMemo(() => {
    if (!previewEntry) return null;
    const targetUri = previewEntry.uri;
    for (let index = 0; index < columnItems.length; index += 1) {
      if (columnItems[index].entries.some((entry) => entry.uri === targetUri)) {
        return index;
      }
    }
    return null;
  }, [columnItems, previewEntry]);
  const visibleColumns = useMemo(() => {
    if (previewColumnIndex === null) return columnItems;
    if (previewColumnIndex < columnItems.length - 1) {
      return columnItems.slice(0, previewColumnIndex + 1);
    }
    return columnItems;
  }, [columnItems, previewColumnIndex]);
  const columnsWidthStyle = useMemo(() => {
    const columnWidthRem = 18;
    const count = Math.max(visibleColumns.length, 1);
    return {
      width: `${count * columnWidthRem}rem`,
      maxWidth: "calc(100% - 320px)",
    };
  }, [visibleColumns.length]);

  /** Resolve the entry associated with a row event. */
  const resolveEntryFromEvent = useCallback(
    (event: { currentTarget: HTMLElement }) => {
      const uri = event.currentTarget.getAttribute("data-entry-uri") ?? "";
      if (!uri) return null;
      return entryByUriRef.current.get(uri) ?? null;
    },
    []
  );

  /** Block pointer events shortly after a context menu trigger. */
  const shouldBlockPointerEvent = useCallback(
    (event: { button?: number } | null | undefined) => {
      const button = event?.button;
      if (button !== 0 && button !== 2) return false;
      const last = lastContextMenuRef.current;
      if (!last) return false;
      if (Date.now() - last.at > 500) {
        lastContextMenuRef.current = null;
        return false;
      }
      // 右键后 0.5 秒内屏蔽左右键事件，避免误触。
      return true;
    },
    []
  );

  const { selectionRect, registerEntryRef, handleGridMouseDown } =
    useFileSystemSelection({
      gridRef,
      entriesRef,
      onSelectionChange,
      resolveSelectionMode,
      renamingUri,
      onRenamingSubmit,
      shouldBlockPointerEvent,
    });

  const {
    dragOverFolderUri,
    handleEntryDragStart,
    handleEntryDragOver,
    handleEntryDragEnter,
    handleEntryDragLeave,
    handleEntryDrop,
  } = useFileSystemDrag({
    entriesRef,
    selectedUrisRef,
    dragProjectIdRef,
    dragRootUriRef,
    onEntryDragStartRef,
    onEntryDropRef,
    resolveEntryFromEvent,
    isBoardFolderEntry,
    shouldBlockPointerEvent,
  });

  /** Handle entry click without recreating per-row closures. */
  const handleEntryClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      const isPrimaryClick =
        event.button === 0 && (event.nativeEvent?.which ?? 1) === 1;
      const hasModifier = event.metaKey || event.ctrlKey;
      if (isPrimaryClick && !hasModifier) {
        if (entry.kind === "file") {
          setPreviewUri(entry.uri);
        } else {
          setPreviewUri(null);
        }
      }
      const isActiveEntry = entriesRef.current.some((item) => item.uri === entry.uri);
      if (isActiveEntry) {
        onEntryClickRef.current?.(entry, event);
      }
      // 列视图中单击文件夹时推进右侧列，保持路径一致。
      if (event.button !== 0) return;
      if (event.nativeEvent.which !== 1) return;
      if (event.metaKey || event.ctrlKey) return;
      if (entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      onNavigateRef.current?.(entry.uri);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent, setPreviewUri]
  );

  /** Handle entry double click without recreating per-row closures. */
  const handleEntryDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      if (event.button !== 0) return;
      if (event.nativeEvent.which !== 1) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      const entryExt = getEntryExt(entry);
      if (entry.kind === "file" && IMAGE_EXTS.has(entryExt)) {
        onOpenImageRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && CODE_EXTS.has(entryExt)) {
        onOpenCodeRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && PDF_EXTS.has(entryExt)) {
        onOpenPdfRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && DOC_EXTS.has(entryExt)) {
        onOpenDocRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && SPREADSHEET_EXTS.has(entryExt)) {
        onOpenSpreadsheetRef.current?.(entry);
        return;
      }
      if (isBoardFolderEntry(entry)) {
        onOpenBoardRef.current?.(entry);
        return;
      }
      if (entry.kind === "file") {
        // 不支持预览的文件类型交给系统默认程序打开。
        const ok = window.confirm(
          "此文件类型暂不支持预览，是否使用系统默认程序打开？"
        );
        if (!ok) return;
        if (!window.teatimeElectron?.openPath) {
          toast.error("网页版不支持打开本地文件");
          return;
        }
        void window.teatimeElectron
          .openPath({ uri: entry.uri })
          .then((res) => {
            if (!res?.ok) {
              toast.error(res?.reason ?? "无法打开文件");
            }
          });
        return;
      }
      if (entry.kind !== "folder") return;
      // 双击文件夹进入下一级目录。
      onNavigateRef.current?.(entry.uri);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent]
  );

  /** Handle entry context menu without recreating per-row closures. */
  const handleEntryContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      const isActiveEntry = entriesRef.current.some((item) => item.uri === entry.uri);
      if (!isActiveEntry) return;
      onEntryContextMenuRef.current?.(entry, event);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent]
  );

  const handleGridContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (shouldBlockPointerEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target as HTMLElement | null;
      const entryEl = target?.closest(
        '[data-entry-card="true"]'
      ) as HTMLElement | null;
      const uri = entryEl?.getAttribute("data-entry-uri") ?? "";
      const isActiveEntry = entriesRef.current.some((item) => item.uri === uri);
      const targetUri = isActiveEntry ? uri : "";
      // 统一记录右键触发源，避免触控板右键后误触点击。
      lastContextMenuRef.current = { uri: targetUri, at: Date.now() };
      onGridContextMenuCapture?.(event, { uri: targetUri || null });
    },
    [onGridContextMenuCapture, shouldBlockPointerEvent]
  );

  const handlePreviewContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!previewEntry) return;
      if (shouldBlockPointerEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      lastContextMenuRef.current = { uri: previewEntry.uri, at: Date.now() };
      onGridContextMenuCapture?.(event, {
        uri: previewEntry.uri,
        entry: previewEntry,
      });
    },
    [onGridContextMenuCapture, previewEntry, shouldBlockPointerEvent]
  );

  useEffect(() => {
    const handleDocumentContextMenu = (event: MouseEvent) => {
      const last = lastContextMenuRef.current;
      if (!last) return;
      if (Date.now() - last.at > 500) {
        lastContextMenuRef.current = null;
        return;
      }
      // 右键触发后短时间内拦截系统右键菜单，避免闪烁。
      event.preventDefault();
    };
    document.addEventListener("contextmenu", handleDocumentContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleDocumentContextMenu);
    };
  }, []);

  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;
    // 列路径变化时滚动到最右侧，避免新列被遮挡。
    requestAnimationFrame(() => {
      container.scrollLeft = container.scrollWidth;
    });
  }, [columnUris]);

  return (
    <div className="relative flex min-h-full h-full overflow-hidden">
      {shouldShowSearchEmpty ? (
        <div className="absolute inset-0 z-10">
          <FileSystemSearchEmptyState query={searchText} />
        </div>
      ) : null}
      <div
        ref={gridRef}
        tabIndex={-1}
        className="relative flex-none min-h-full h-full min-w-0 overflow-x-auto overflow-y-hidden focus:outline-none"
        style={columnsWidthStyle}
        onMouseDown={handleGridMouseDown}
        onContextMenuCapture={handleGridContextMenuCapture}
      >
        {selectionRect && gridRef.current ? (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-primary/40 bg-primary/10"
            style={{
              left:
                selectionRect.left - gridRef.current.getBoundingClientRect().left,
              top:
                selectionRect.top - gridRef.current.getBoundingClientRect().top,
              width: selectionRect.right - selectionRect.left,
              height: selectionRect.bottom - selectionRect.top,
            }}
          />
        ) : null}
        <div className="flex min-h-full h-full w-max">
          {visibleColumns.map((column, columnIndex) => (
            <div
              key={column.uri}
              className={`flex h-full w-72 shrink-0 flex-col border-r border-border/70 bg-background/95 ${
                columnIndex === visibleColumns.length - 1 ? "border-r-0" : ""
              }`}
            >
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
                {column.isLoading ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    加载中...
                  </div>
                ) : column.entries.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    暂无内容
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {column.entries.map((entry) => {
                      const isRenaming = renamingUri === entry.uri;
                      const isPreviewSelected = previewEntry?.uri === entry.uri;
                      const isSelected =
                        (selectedUris?.has(entry.uri) ?? false) || isPreviewSelected;
                      const isPreviewColumn = previewColumnIndex === columnIndex;
                      const isPathSelected =
                        !hasExplicitSelection &&
                        !isPreviewColumn &&
                        column.pathSelectedUri === entry.uri;
                      const isDragOver =
                        entry.kind === "folder" && dragOverFolderUri === entry.uri;
                      const thumbnailSrc = thumbnailByUri.get(entry.uri);
                      const entryRef =
                        columnIndex === visibleColumns.length - 1
                          ? registerEntryRef(entry.uri)
                          : undefined;
                      const row = isRenaming ? (
                        <FileSystemColumnRenameRow
                          entry={entry}
                          entryRef={entryRef}
                          thumbnailSrc={thumbnailSrc}
                          isSelected={isSelected}
                          renamingValue={renamingValue}
                          onRenamingChange={onRenamingChange}
                          onRenamingSubmit={onRenamingSubmit}
                          onRenamingCancel={onRenamingCancel}
                        />
                      ) : (
                        <FileSystemColumnRow
                          entry={entry}
                          entryRef={entryRef}
                          thumbnailSrc={thumbnailSrc}
                          isSelected={isSelected}
                          isPathSelected={isPathSelected}
                          isDragOver={isDragOver}
                          onClick={handleEntryClick}
                          onDoubleClick={handleEntryDoubleClick}
                          onContextMenu={handleEntryContextMenu}
                          onDragStart={handleEntryDragStart}
                          onDragOver={handleEntryDragOver}
                          onDragEnter={handleEntryDragEnter}
                          onDragLeave={handleEntryDragLeave}
                          onDrop={handleEntryDrop}
                        />
                      );
                      return (
                        <Fragment key={entry.uri}>
                          {renderEntry ? renderEntry(entry, row) : row}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {previewEntry ? (
        <div
          className="flex h-full min-w-[320px] flex-1 flex-col border-l border-border/70 bg-background/95"
          onContextMenuCapture={handlePreviewContextMenuCapture}
        >
          <div className="flex h-full flex-col gap-3 p-3">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30">
              {isPreviewImage || isPreviewPdf ? (
                previewQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">预览加载中...</div>
                ) : previewSrc ? (
                  isPreviewImage ? (
                    <img
                      src={previewSrc}
                      alt={previewDisplayName}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <iframe
                      title={previewDisplayName}
                      src={previewSrc}
                      className="h-full w-full"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                    {previewVisual}
                    <span>预览失败</span>
                  </div>
                )
              ) : (
                previewVisual
              )}
            </div>
            <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-2 text-xs">
              <div className="text-muted-foreground">文件名</div>
              <div className="break-all text-foreground">{previewDisplayName}</div>
              <div className="text-muted-foreground">文件类型</div>
              <div className="break-all text-foreground">{previewTypeLabel}</div>
              <div className="text-muted-foreground">大小</div>
              <div className="break-all text-foreground">{previewSizeLabel}</div>
              <div className="text-muted-foreground">创建时间</div>
              <div className="break-all text-foreground">{previewCreatedLabel}</div>
              <div className="text-muted-foreground">修改时间</div>
              <div className="break-all text-foreground">{previewUpdatedLabel}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
FileSystemColumns.displayName = "FileSystemColumns";

export { FileSystemColumns };
