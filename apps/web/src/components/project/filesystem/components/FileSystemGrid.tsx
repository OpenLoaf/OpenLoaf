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
import { useFlipLayout } from "@/lib/use-flip-layout";
import { isBoardFolderName } from "@/lib/file-name";
import { type FileSystemEntry } from "../utils/file-system-utils";
import { FileSystemEntryCard } from "./FileSystemEntryCard";
import { FileSystemEmptyState, FileSystemSearchEmptyState } from "./FileSystemEmptyState";
import { FileSystemEntryRenameCard } from "./FileSystemEntryRenameCard";
import { FileSystemParentEntryCard } from "./FileSystemParentEntryCard";
import { useFileSystemDrag } from "../hooks/use-file-system-drag";
import { useFileSystemSelection } from "../hooks/use-file-system-selection";
import { useFolderThumbnails } from "../hooks/use-folder-thumbnails";
import { handleFileSystemEntryOpen } from "../utils/entry-open";

/** Return true when the entry represents a board folder. */
const isBoardFolderEntry = (entry: FileSystemEntry) =>
  entry.kind === "folder" && isBoardFolderName(entry.name);

type FileSystemGridProps = {
  entries: FileSystemEntry[];
  isLoading: boolean;
  isSearchLoading?: boolean;
  searchQuery?: string;
  /** Render a denser grid with smaller cards. */
  compact?: boolean;
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
  /** Open entries using the unified preview handler. */
  onOpenEntry?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Open image entries in an external viewer. */
  onOpenImage?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
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
  /** Open video entries in an external viewer. */
  onOpenVideo?: (entry: FileSystemEntry) => void;
  /** Open board entries in the board viewer. */
  onOpenBoard?: (entry: FileSystemEntry) => void;
  showEmptyActions?: boolean;
  /** Create a new markdown document from empty state. */
  onCreateDocument?: () => void;
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
    entries: FileSystemEntry[],
    event: DragEvent<HTMLElement>
  ) => void;
  renamingUri?: string | null;
  renamingValue?: string;
  onRenamingChange?: (value: string) => void;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
  onSelectionChange?: (uris: string[], mode: "replace" | "toggle") => void;
  /** Resolve whether an entry is selectable. */
  isEntrySelectable?: (entry: FileSystemEntry) => boolean;
};
/** File system grid with empty state. */
const FileSystemGrid = memo(function FileSystemGrid({
  entries,
  isLoading,
  isSearchLoading = false,
  searchQuery,
  compact = false,
  projectId,
  rootUri,
  parentUri,
  currentUri,
  includeHidden,
  dragProjectId,
  dragRootUri,
  onNavigate,
  onOpenEntry,
  onOpenImage,
  onOpenMarkdown,
  onOpenCode,
  onOpenPdf,
  onOpenDoc,
  onOpenSpreadsheet,
  onOpenVideo,
  onOpenBoard,
  showEmptyActions = true,
  onCreateDocument,
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
  isEntrySelectable,
  resolveSelectionMode,
  onGridContextMenuCapture,
}: FileSystemGridProps) {
  // 上一级入口仅在可回退时显示，允许回到根目录。
  const shouldShowParentEntry = parentUri !== null && parentUri !== undefined;
  const searchText = searchQuery?.trim() ?? "";
  const hasSearchQuery = searchText.length > 0;
  const shouldShowSearchEmpty =
    hasSearchQuery && !isLoading && !isSearchLoading && entries.length === 0;
  const shouldShowEmpty = !hasSearchQuery && !isLoading && entries.length === 0;
  const gridRef = useRef<HTMLDivElement>(null);
  const gridListRef = useRef<HTMLDivElement>(null);
  const parentEntry = useMemo<FileSystemEntry | null>(
    () =>
      parentUri !== null && parentUri !== undefined
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
  const onOpenEntryRef = useRef(onOpenEntry);
  onOpenEntryRef.current = onOpenEntry;
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
  const onOpenVideoRef = useRef(onOpenVideo);
  onOpenVideoRef.current = onOpenVideo;
  const onOpenBoardRef = useRef(onOpenBoard);
  onOpenBoardRef.current = onOpenBoard;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const isEntrySelectableRef = useRef(isEntrySelectable);
  isEntrySelectableRef.current = isEntrySelectable;
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
    containerRef: gridListRef,
    deps: flipDeps,
    durationMs: 800,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    enabled: !isLoading,
    observeResize: false,
  });

  /** Resolve the entry associated with a card event. */
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
      isUriSelectable: (uri) => {
        const entry = entryByUriRef.current.get(uri);
        if (!entry) return false;
        return isEntrySelectableRef.current ? isEntrySelectableRef.current(entry) : true;
      },
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
    resolveThumbnailSrc: (uri) => thumbnailByUri.get(uri),
    onEntryDragStartRef,
    onEntryDropRef,
    resolveEntryFromEvent,
    isBoardFolderEntry,
    shouldBlockPointerEvent,
  });

  /** Handle entry click without recreating per-card closures. */
  const handleEntryClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      if (isEntrySelectableRef.current && !isEntrySelectableRef.current(entry)) return;
      onEntryClickRef.current?.(entry, event);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent]
  );

  /** Handle entry double click without recreating per-card closures. */
  const handleEntryDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      if (event.button !== 0) return;
      if (event.nativeEvent.which !== 1) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      if (isEntrySelectableRef.current && !isEntrySelectableRef.current(entry)) return;
      const thumbnailSrc = thumbnailByUri.get(entry.uri);
      handleFileSystemEntryOpen({
        entry,
        rootUri,
        thumbnailSrc,
        handlers: {
          onOpenEntry: onOpenEntryRef.current,
          onOpenImage: onOpenImageRef.current,
          onOpenMarkdown: onOpenMarkdownRef.current,
          onOpenCode: onOpenCodeRef.current,
          onOpenPdf: onOpenPdfRef.current,
          onOpenDoc: onOpenDocRef.current,
          onOpenSpreadsheet: onOpenSpreadsheetRef.current,
          onOpenVideo: onOpenVideoRef.current,
          onOpenBoard: onOpenBoardRef.current,
          onNavigate: onNavigateRef.current,
        },
      });
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent, thumbnailByUri]
  );

  /** Handle entry context menu without recreating per-card closures. */
  const handleEntryContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      if (isEntrySelectableRef.current && !isEntrySelectableRef.current(entry)) return;
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

  const gridClassName = compact
    ? "grid gap-4 justify-start [grid-template-columns:repeat(1,minmax(120px,1fr))] @[300px]/fs-grid:[grid-template-columns:repeat(2,minmax(120px,1fr))] @[420px]/fs-grid:[grid-template-columns:repeat(3,minmax(120px,1fr))] @[560px]/fs-grid:[grid-template-columns:repeat(4,minmax(120px,1fr))] @[700px]/fs-grid:[grid-template-columns:repeat(5,minmax(120px,1fr))] @[840px]/fs-grid:[grid-template-columns:repeat(6,minmax(120px,1fr))]"
    : "grid gap-5 justify-start [grid-template-columns:repeat(1,minmax(140px,1fr))] @[320px]/fs-grid:[grid-template-columns:repeat(2,minmax(140px,1fr))] @[480px]/fs-grid:[grid-template-columns:repeat(3,minmax(140px,1fr))] @[640px]/fs-grid:[grid-template-columns:repeat(4,minmax(140px,1fr))] @[800px]/fs-grid:[grid-template-columns:repeat(5,minmax(140px,1fr))] @[960px]/fs-grid:[grid-template-columns:repeat(6,minmax(140px,1fr))]";

  return (
    <div className="flex min-h-full h-full flex-col">
 
      {shouldShowSearchEmpty ? (
        <FileSystemSearchEmptyState query={searchText} />
      ) : shouldShowEmpty ? (
          <FileSystemEmptyState
            showEmptyActions={showEmptyActions}
            parentEntry={parentEntry}
            onCreateDocument={onCreateDocument}
            onCreateBoard={onCreateBoard}
            onNavigate={onNavigate}
            onEntryDrop={onEntryDrop}
          setDragOverFolderUri={setDragOverFolderUri}
          shouldBlockPointerEvent={shouldBlockPointerEvent}
        />
      ) : null}
      {shouldShowEmpty ? null : (
        <div
          ref={gridRef}
          tabIndex={-1}
          className="relative flex-1 min-h-full h-full p-0.5 focus:outline-none @container/fs-grid"
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
                  selectionRect.top - gridRef.current.getBoundingClientRect().top,
                width: selectionRect.right - selectionRect.left,
                height: selectionRect.bottom - selectionRect.top,
              }}
            />
          ) : null}
          <div
            ref={gridListRef}
            className={gridClassName}
          >
            {shouldShowParentEntry && parentEntry ? (
              <FileSystemParentEntryCard
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
              const isDisabled = isEntrySelectable ? !isEntrySelectable(entry) : false;
              const card = isRenaming ? (
                <FileSystemEntryRenameCard
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
                <FileSystemEntryCard
                  uri={entry.uri}
                  name={entry.name}
                  kind={entry.kind}
                  ext={entry.ext}
                  isEmpty={entry.isEmpty}
                  thumbnailSrc={thumbnailSrc}
                  ref={registerEntryRef(entry.uri)}
                  isSelected={isSelected}
                  isDisabled={isDisabled}
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
                  {renderEntry ? renderEntry(entry, card) : card}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export type { FileSystemEntry };
export { FileSystemEntryCard, FileSystemGrid };
