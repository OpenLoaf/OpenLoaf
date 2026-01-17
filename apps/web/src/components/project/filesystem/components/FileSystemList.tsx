"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useFlipLayout } from "@/lib/use-flip-layout";
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
  resolveFileUriFromRoot,
} from "../utils/file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  FolderIcon,
  isTextFallbackExt,
  getEntryVisual,
} from "./FileSystemEntryVisual";
import { FileSystemEmptyState, FileSystemSearchEmptyState } from "./FileSystemEmptyState";
import { useFileSystemDrag } from "../hooks/use-file-system-drag";
import { useFileSystemSelection } from "../hooks/use-file-system-selection";
import { useFolderThumbnails } from "../hooks/use-folder-thumbnails";

/** Return true when the entry represents a board folder. */
const isBoardFolderEntry = (entry: FileSystemEntry) =>
  entry.kind === "folder" && isBoardFolderName(entry.name);

/** Responsive column template for list layout. */
const listColumnClassName =
  "grid-cols-[minmax(200px,1fr)] @[520px]/fs-list:grid-cols-[minmax(200px,1fr)_160px] @[760px]/fs-list:grid-cols-[minmax(220px,1fr)_160px_140px_90px] @[980px]/fs-list:grid-cols-[minmax(260px,1fr)_200px_160px_110px]";
/** Base layout for list rows. */
const listRowBaseClassName =
  "grid items-center gap-3 rounded-md px-3 py-2 text-left text-xs leading-4";
/** Base layout for list headers. */
const listHeaderClassName =
  "grid items-center gap-3 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground";
/** Document extensions handled by the built-in viewer. */
const INTERNAL_DOC_EXTS = new Set<string>();
/** Spreadsheet extensions handled by the built-in viewer. */
const INTERNAL_SHEET_EXTS = new Set(["csv"]);
/** Extension display labels for list type column. */
const FILE_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
};

/** Return true when the office file should open with the system default app. */
function shouldOpenOfficeWithSystem(ext: string): boolean {
  // 逻辑：仅对内置未覆盖的 Office 扩展使用系统默认程序。
  if (DOC_EXTS.has(ext)) return !INTERNAL_DOC_EXTS.has(ext);
  if (SPREADSHEET_EXTS.has(ext)) return !INTERNAL_SHEET_EXTS.has(ext);
  return false;
}

/** Open a file via the system default handler. */
function openWithDefaultApp(entry: FileSystemEntry, rootUri?: string): void {
  // 逻辑：桌面端通过 openPath 调起系统默认应用。
  if (!window.tenasElectron?.openPath) {
    toast.error("网页版不支持打开本地文件");
    return;
  }
  const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
  void window.tenasElectron.openPath({ uri: fileUri }).then((res) => {
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  });
}

type FileSystemListHeaderProps = {
  sortField: "name" | "mtime" | null;
  sortOrder: "asc" | "desc" | null;
  onSortByName: () => void;
  onSortByTime: () => void;
};

/** Render the list header row. */
const FileSystemListHeader = memo(function FileSystemListHeader({
  sortField,
  sortOrder,
  onSortByName,
  onSortByTime,
}: FileSystemListHeaderProps) {
  const isNameSorted = sortField === "name";
  const isTimeSorted = sortField === "mtime";
  const sortIconClassName = "h-3 w-3 shrink-0";
  const nameSortIcon =
    isNameSorted && sortOrder
      ? sortOrder === "asc"
        ? <ArrowUp className={sortIconClassName} />
        : <ArrowDown className={sortIconClassName} />
      : null;
  const timeSortIcon =
    isTimeSorted && sortOrder
      ? sortOrder === "asc"
        ? <ArrowUp className={sortIconClassName} />
        : <ArrowDown className={sortIconClassName} />
      : null;
  return (
    <div className={`${listHeaderClassName} ${listColumnClassName}`}>
      <button
        type="button"
        className={`flex w-full items-center justify-start gap-1 text-left ${
          isNameSorted ? "text-foreground" : "text-muted-foreground"
        } hover:text-foreground`}
        aria-label="按名称排序"
        onClick={onSortByName}
      >
        <span>名称</span>
        {nameSortIcon}
      </button>
      <button
        type="button"
        className={`hidden w-full items-center justify-start gap-1 text-left @[520px]/fs-list:flex ${
          isTimeSorted ? "text-foreground" : "text-muted-foreground"
        } hover:text-foreground`}
        aria-label="按修改时间排序"
        onClick={onSortByTime}
      >
        <span>修改时间</span>
        {timeSortIcon}
      </button>
      <div className="hidden @[760px]/fs-list:block">类型</div>
      <div className="hidden @[760px]/fs-list:block text-right">大小</div>
    </div>
  );
});
FileSystemListHeader.displayName = "FileSystemListHeader";

type FileSystemListProps = {
  entries: FileSystemEntry[];
  isLoading: boolean;
  isSearchLoading?: boolean;
  searchQuery?: string;
  projectId?: string;
  rootUri?: string;
  parentUri?: string | null;
  /** Current folder uri used to request folder thumbnails. */
  currentUri?: string | null;
  /** Whether hidden files are included in the thumbnail query. */
  includeHidden?: boolean;
  dragProjectId?: string;
  dragRootUri?: string;
  onNavigate?: (nextUri: string) => void;
  /** Open image entries in an external viewer. */
  onOpenImage?: (entry: FileSystemEntry) => void;
  /** Open markdown entries in a markdown viewer. */
  onOpenMarkdown?: (entry: FileSystemEntry) => void;
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
  showEmptyActions?: boolean;
  /** Create a new board from empty state. */
  onCreateBoard?: () => void;
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
    event: DragEvent<HTMLElement>
  ) => void;
  onEntryDragStart?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ) => void;
  renamingUri?: string | null;
  renamingValue?: string;
  onRenamingChange?: (value: string) => void;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
  onSelectionChange?: (uris: string[], mode: "replace" | "toggle") => void;
};

/** Resolve a display name for list rows. */
function resolveEntryDisplayName(entry: FileSystemEntry) {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Resolve list type label for an entry. */
function resolveEntryTypeLabel(entry: FileSystemEntry) {
  if (entry.kind === "folder") {
    return isBoardFolderName(entry.name) ? "画布" : "文件夹";
  }
  const ext = getEntryExt(entry);
  if (!ext) return "文件";
  if (isBoardFileExt(ext)) return "画布";
  const override = FILE_TYPE_LABEL_OVERRIDES[ext];
  if (override) return override;
  return ext.toUpperCase();
}

type FileSystemListRowContentProps = {
  entry: FileSystemEntry;
  thumbnailSrc?: string;
  nameSlot?: ReactNode;
  visualOverride?: ReactNode;
};

/** Render list row cells for file system entries. */
const FileSystemListRowContent = memo(function FileSystemListRowContent({
  entry,
  thumbnailSrc,
  nameSlot,
  visualOverride,
}: FileSystemListRowContentProps) {
  const displayName = useMemo(() => resolveEntryDisplayName(entry), [entry]);
  const typeLabel = useMemo(() => resolveEntryTypeLabel(entry), [entry]);
  const sizeLabel = useMemo(() => formatSize(entry.size), [entry.size]);
  const updatedLabel = useMemo(
    () => formatTimestamp(entry.updatedAt),
    [entry.updatedAt]
  );
  const visual = useMemo(
    () =>
      visualOverride ??
      getEntryVisual({
        kind: entry.kind,
        name: entry.name,
        ext: entry.ext,
        isEmpty: entry.isEmpty,
        thumbnailSrc,
        sizeClassName: "h-6 w-6",
        thumbnailIconClassName: "h-full w-full p-1 text-muted-foreground",
      }),
    [entry.ext, entry.isEmpty, entry.kind, entry.name, thumbnailSrc, visualOverride]
  );

  return (
    <>
      <div className="flex min-w-0 items-center gap-2 text-foreground">
        {visual}
        <div className="min-w-0 flex-1">
          {nameSlot ?? <span className="block truncate">{displayName}</span>}
        </div>
      </div>
      <div className="hidden @[520px]/fs-list:block text-muted-foreground truncate">
        {updatedLabel}
      </div>
      <div className="hidden @[760px]/fs-list:block text-muted-foreground truncate">
        {typeLabel}
      </div>
      <div className="hidden @[760px]/fs-list:block text-muted-foreground text-right">
        {sizeLabel}
      </div>
    </>
  );
});
FileSystemListRowContent.displayName = "FileSystemListRowContent";

type FileSystemListRowProps = {
  entry: FileSystemEntry;
  thumbnailSrc?: string;
  isSelected?: boolean;
  isDragOver?: boolean;
  entryRef?: (node: HTMLButtonElement | null) => void;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragEnter?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
};

/** Render a single list row entry. */
const FileSystemListRow = memo(function FileSystemListRow({
  entry,
  thumbnailSrc,
  isSelected = false,
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
}: FileSystemListRowProps) {
  return (
    <button
      ref={entryRef}
      type="button"
      data-entry-card="true"
      data-entry-uri={entry.uri}
      data-flip-id={entry.uri}
      className={`${listRowBaseClassName} ${listColumnClassName} hover:bg-muted/80 ${
        isSelected ? "bg-muted/70 ring-1 ring-border" : ""
      } ${isDragOver ? "bg-muted/80 ring-1 ring-border" : ""}`}
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
      <FileSystemListRowContent entry={entry} thumbnailSrc={thumbnailSrc} />
    </button>
  );
});
FileSystemListRow.displayName = "FileSystemListRow";

type FileSystemEntryRenameRowProps = {
  entry: FileSystemEntry;
  thumbnailSrc?: string;
  isSelected?: boolean;
  entryRef?: (node: HTMLDivElement | null) => void;
  renamingValue?: string;
  onRenamingChange?: (value: string) => void;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
};

/** Render a rename row for list layout. */
const FileSystemEntryRenameRow = memo(function FileSystemEntryRenameRow({
  entry,
  thumbnailSrc,
  isSelected = false,
  entryRef,
  renamingValue,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
}: FileSystemEntryRenameRowProps) {
  const displayName = useMemo(() => resolveEntryDisplayName(entry), [entry]);

  return (
    <div
      data-entry-card="true"
      data-entry-uri={entry.uri}
      data-flip-id={entry.uri}
      ref={entryRef}
      className={`${listRowBaseClassName} ${listColumnClassName} ${
        isSelected ? "bg-muted/70 ring-1 ring-border" : ""
      }`}
    >
      <FileSystemListRowContent
        entry={entry}
        thumbnailSrc={thumbnailSrc}
        nameSlot={
          <Input
            value={renamingValue ?? displayName}
            onChange={(event) => onRenamingChange?.(event.target.value)}
            className="h-6 w-full rounded-sm border border-border/60 bg-background px-2 py-0 text-left text-xs leading-4 shadow-none md:text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
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
        }
      />
    </div>
  );
});
FileSystemEntryRenameRow.displayName = "FileSystemEntryRenameRow";

type FileSystemParentEntryRowProps = {
  parentEntry: FileSystemEntry;
  isSelected?: boolean;
  isDragOver?: boolean;
  onNavigate?: (nextUri: string) => void;
  onEntryDrop?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ) => void;
  setDragOverFolderUri: (value: string | null) => void;
  shouldBlockPointerEvent: (event: { button?: number } | null | undefined) => boolean;
};

/** Render the parent folder entry inside the list layout. */
const FileSystemParentEntryRow = memo(function FileSystemParentEntryRow({
  parentEntry,
  isSelected = false,
  isDragOver = false,
  onNavigate,
  onEntryDrop,
  setDragOverFolderUri,
  shouldBlockPointerEvent,
}: FileSystemParentEntryRowProps) {
  return (
    <button
      type="button"
      data-flip-id={parentEntry.uri}
      className={`${listRowBaseClassName} ${listColumnClassName} hover:bg-muted/80 ${
        isSelected
          ? "bg-muted/70 ring-1 ring-border"
          : isDragOver
            ? "bg-muted/80 ring-1 ring-border"
            : ""
      }`}
      onDoubleClick={(event) => {
        if (shouldBlockPointerEvent(event)) return;
        if (event.button !== 0) return;
        if (event.nativeEvent.which !== 1) return;
        onNavigate?.(parentEntry.uri);
      }}
      onDragOver={(event) => {
        setDragOverFolderUri(parentEntry.uri);
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={() => {
        setDragOverFolderUri(parentEntry.uri);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setDragOverFolderUri(null);
      }}
      onDrop={(event) => {
        setDragOverFolderUri(null);
        onEntryDrop?.(parentEntry, event);
      }}
    >
      <FileSystemListRowContent
        entry={parentEntry}
        visualOverride={<FolderIcon className="h-6 w-6" showArrow />}
      />
    </button>
  );
});
FileSystemParentEntryRow.displayName = "FileSystemParentEntryRow";

/** File system list layout with empty state. */
const FileSystemList = memo(function FileSystemList({
  entries,
  isLoading,
  isSearchLoading = false,
  searchQuery,
  projectId,
  rootUri,
  parentUri,
  currentUri,
  includeHidden,
  dragProjectId,
  dragRootUri,
  onNavigate,
  onOpenImage,
  onOpenMarkdown,
  onOpenCode,
  onOpenPdf,
  onOpenDoc,
  onOpenSpreadsheet,
  onOpenBoard,
  showEmptyActions = true,
  onCreateBoard,
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
}: FileSystemListProps) {
  // 上一级入口仅在可回退且当前目录非空时显示，避免根目录与空目录误导。
  const shouldShowParentEntry = Boolean(parentUri) && entries.length > 0;
  const searchText = searchQuery?.trim() ?? "";
  const hasSearchQuery = searchText.length > 0;
  const shouldShowSearchEmpty =
    hasSearchQuery && !isLoading && !isSearchLoading && entries.length === 0;
  const shouldShowEmpty = !hasSearchQuery && !isLoading && entries.length === 0;
  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const parentEntry = useMemo<FileSystemEntry | null>(
    () =>
      parentUri
        ? {
            uri: parentUri,
            name: "上一级",
            kind: "folder",
          }
        : null,
    [parentUri]
  );
  const entryByUri = useMemo(
    () => new Map(entries.map((entry) => [entry.uri, entry])),
    [entries]
  );
  const entryByUriRef = useRef(entryByUri);
  entryByUriRef.current = entryByUri;
  // 缓存最新数据供事件委托使用，避免频繁创建 handler。
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
  const onOpenMarkdownRef = useRef(onOpenMarkdown);
  onOpenMarkdownRef.current = onOpenMarkdown;
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
  // 记录最近一次右键触发的条目与时间，用于 0.5 秒内拦截左右键误触。
  const lastContextMenuRef = useRef<{ uri: string; at: number } | null>(null);
  const { thumbnailByUri } = useFolderThumbnails({
    currentUri,
    includeHidden,
    projectId,
  });

  const entryOrderKey = useMemo(
    () => entries.map((entry) => entry.uri).join("|"),
    [entries]
  );
  const flipDeps = useMemo(
    () => [
      entryOrderKey,
      shouldShowParentEntry ? parentEntry?.uri ?? "" : "",
    ],
    [entryOrderKey, parentEntry?.uri, shouldShowParentEntry]
  );
  useFlipLayout({
    containerRef: listRef,
    deps: flipDeps,
    durationMs: 800,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    enabled: !isLoading,
    observeResize: false,
  });

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
    setDragOverFolderUri,
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
      onEntryClickRef.current?.(entry, event);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent]
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
      if (entry.kind === "file" && MARKDOWN_EXTS.has(entryExt)) {
        onOpenMarkdownRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && CODE_EXTS.has(entryExt)) {
        onOpenCodeRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && isTextFallbackExt(entryExt)) {
        onOpenCodeRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && PDF_EXTS.has(entryExt)) {
        onOpenPdfRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && DOC_EXTS.has(entryExt)) {
        if (shouldOpenOfficeWithSystem(entryExt)) {
          openWithDefaultApp(entry, rootUri);
          return;
        }
        onOpenDocRef.current?.(entry);
        return;
      }
      if (entry.kind === "file" && SPREADSHEET_EXTS.has(entryExt)) {
        if (shouldOpenOfficeWithSystem(entryExt)) {
          openWithDefaultApp(entry, rootUri);
          return;
        }
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
        openWithDefaultApp(entry, rootUri);
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
      // 统一记录右键触发源，避免触控板右键后误触点击。
      lastContextMenuRef.current = { uri, at: Date.now() };
      onGridContextMenuCapture?.(event, { uri: uri || null });
    },
    [onGridContextMenuCapture, shouldBlockPointerEvent]
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

  return (
    <div className="flex min-h-full h-full flex-col">
      <div
        ref={gridRef}
        tabIndex={-1}
        className="relative flex-1 min-h-full h-full focus:outline-none"
        onMouseDown={handleGridMouseDown}
        onContextMenuCapture={handleGridContextMenuCapture}
      >
        {selectionRect && gridRef.current ? (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-primary/40 bg-primary/10"
            style={{
              left:
                selectionRect.left -
                gridRef.current.getBoundingClientRect().left,
              top:
                selectionRect.top -
                gridRef.current.getBoundingClientRect().top,
              width: selectionRect.right - selectionRect.left,
              height: selectionRect.bottom - selectionRect.top,
            }}
          />
        ) : null}
        {shouldShowSearchEmpty ? (
          <FileSystemSearchEmptyState query={searchText} />
        ) : shouldShowEmpty ? (
          <FileSystemEmptyState
            showEmptyActions={showEmptyActions}
            parentEntry={parentEntry}
            onCreateBoard={onCreateBoard}
            onNavigate={onNavigate}
            onEntryDrop={onEntryDrop}
            setDragOverFolderUri={setDragOverFolderUri}
            shouldBlockPointerEvent={shouldBlockPointerEvent}
          />
        ) : null}
        <div ref={listRef} className="flex flex-col gap-1 py-1">
          {shouldShowParentEntry && parentEntry ? (
            <FileSystemParentEntryRow
              parentEntry={parentEntry}
              isSelected={selectedUris?.has(parentEntry.uri)}
              isDragOver={dragOverFolderUri === parentEntry.uri}
              onNavigate={onNavigate}
              onEntryDrop={onEntryDrop}
              setDragOverFolderUri={setDragOverFolderUri}
              shouldBlockPointerEvent={shouldBlockPointerEvent}
            />
          ) : null}
          {entries.map((entry) => {
            const isRenaming = renamingUri === entry.uri;
            const isSelected = selectedUris?.has(entry.uri) ?? false;
            const isDragOver =
              entry.kind === "folder" && dragOverFolderUri === entry.uri;
            const thumbnailSrc = thumbnailByUri.get(entry.uri);
            const row = isRenaming ? (
              <FileSystemEntryRenameRow
                entry={entry}
                thumbnailSrc={thumbnailSrc}
                entryRef={registerEntryRef(entry.uri)}
                isSelected={isSelected}
                renamingValue={renamingValue}
                onRenamingChange={onRenamingChange}
                onRenamingSubmit={onRenamingSubmit}
                onRenamingCancel={onRenamingCancel}
              />
            ) : (
              <FileSystemListRow
                entry={entry}
                thumbnailSrc={thumbnailSrc}
                entryRef={registerEntryRef(entry.uri)}
                isSelected={isSelected}
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
      </div>
    </div>
  );
});
FileSystemList.displayName = "FileSystemList";

export { FileSystemList, FileSystemListHeader };
