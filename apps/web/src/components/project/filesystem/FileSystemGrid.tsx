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
import { skipToken, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, Folder, FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useFlipLayout } from "@/lib/use-flip-layout";
import {
  type FileSystemEntry,
  buildTeatimeFileUrl,
  FILE_DRAG_URIS_MIME,
  getEntryExt,
  getRelativePathFromUri,
} from "./file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  getEntryVisual,
} from "./FileSystemEntryVisual";
import { FileSystemEntryCard } from "./FileSystemEntryCard";
import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import { setImageDragPayload } from "@/lib/image/drag";

/** Return true when the entry represents a board folder. */
const isBoardFolderEntry = (entry: FileSystemEntry) =>
  entry.kind === "folder" && isBoardFolderName(entry.name);

/** Resolve drag uri for a file system entry. */
const resolveEntryDragUri = (
  entry: FileSystemEntry,
  dragProjectId?: string,
  dragRootUri?: string
) => {
  if (!dragProjectId || !dragRootUri) return entry.uri;
  const relativePath = getRelativePathFromUri(dragRootUri, entry.uri);
  if (!relativePath) return entry.uri;
  // 对外拖拽统一使用 teatime-file 协议。
  return buildTeatimeFileUrl(dragProjectId, relativePath);
};

type FileSystemGridProps = {
  entries: FileSystemEntry[];
  isLoading: boolean;
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
    payload: { uri: string | null }
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
/** File system grid with empty state. */
const FileSystemGrid = memo(function FileSystemGrid({
  entries,
  isLoading,
  parentUri,
  currentUri,
  includeHidden,
  dragProjectId,
  dragRootUri,
  onNavigate,
  onOpenImage,
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
}: FileSystemGridProps) {
  // 上一级入口仅在可回退且当前目录非空时显示，避免根目录与空目录误导。
  const shouldShowParentEntry = Boolean(parentUri) && entries.length > 0;
  const gridRef = useRef<HTMLDivElement>(null);
  const gridListRef = useRef<HTMLDivElement>(null);
  const entryRefs = useRef(new Map<string, HTMLElement>());
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionRectRef = useRef<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  const selectionModeRef = useRef<"replace" | "toggle">("replace");
  const lastSelectedRef = useRef<string>("");
  // 记录当前拖拽悬停的文件夹，用于高亮提示。
  const [dragOverFolderUri, setDragOverFolderUri] = useState<string | null>(null);
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
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
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
  // 记录最近一次右键触发的条目与时间，用于 0.5 秒内拦截左右键误触。
  const lastContextMenuRef = useRef<{ uri: string; at: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  // 通过目录缩略图接口批量获取图片预览。
  const thumbnailsQuery = useQuery(
    trpc.fs.folderThumbnails.queryOptions(
      currentUri ? { uri: currentUri, includeHidden } : skipToken
    )
  );
  const thumbnailByUri = useMemo(() => {
    const map = new Map<string, string>();
    // 缓存缩略图结果，提升文件网格渲染稳定性。
    for (const item of thumbnailsQuery.data?.items ?? []) {
      map.set(item.uri, item.dataUrl);
    }
    return map;
  }, [thumbnailsQuery.data?.items]);

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

  // 登记网格条目节点，用于框选命中计算。
  const registerEntryRef = useCallback((uri: string) => {
    return (node: HTMLElement | null) => {
      if (node) {
        entryRefs.current.set(uri, node);
      } else {
        entryRefs.current.delete(uri);
      }
    };
  }, []);

  // 根据框选矩形计算命中的条目集合。
  const updateSelectionFromRect = useCallback(
    (rect: { left: number; top: number; right: number; bottom: number }) => {
      if (!onSelectionChange) return;
      const next: string[] = [];
      entryRefs.current.forEach((node, uri) => {
        const box = node.getBoundingClientRect();
        const hit =
          rect.left <= box.right &&
          rect.right >= box.left &&
          rect.top <= box.bottom &&
          rect.bottom >= box.top;
        if (hit) {
          next.push(uri);
        }
      });
      next.sort();
      const signature = next.join("|");
      if (signature === lastSelectedRef.current) return;
      lastSelectedRef.current = signature;
      onSelectionChange(next, selectionModeRef.current);
    },
    [onSelectionChange]
  );

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

  /** Handle entry click without recreating per-card closures. */
  const handleEntryClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
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

  /** Handle entry context menu without recreating per-card closures. */
  const handleEntryContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      onEntryContextMenuRef.current?.(entry, event);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent]
  );

  /** Handle entry drag start without recreating per-card closures. */
  const handleEntryDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      if (shouldBlockPointerEvent(event)) {
        event.preventDefault();
        return;
      }
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      // 固定拖拽预览为单个卡片，避免浏览器用整行作为拖拽影像。
      const dragPreview = event.currentTarget.cloneNode(true) as HTMLElement;
      const rect = event.currentTarget.getBoundingClientRect();
      dragPreview.style.position = "absolute";
      dragPreview.style.top = "-9999px";
      dragPreview.style.left = "-9999px";
      dragPreview.style.pointerEvents = "none";
      dragPreview.style.width = `${rect.width}px`;
      dragPreview.style.height = `${rect.height}px`;
      dragPreview.style.transform = "none";
      dragPreview.style.opacity = "0.9";
      document.body.appendChild(dragPreview);
      if (event.dataTransfer?.setDragImage) {
        event.dataTransfer.setDragImage(
          dragPreview,
          rect.width / 2,
          rect.height / 2
        );
      }
      requestAnimationFrame(() => {
        dragPreview.remove();
      });
      const currentEntries = entriesRef.current;
      const currentSelected = selectedUrisRef.current;
      const dragEntries =
        currentSelected &&
        currentSelected.size > 1 &&
        currentSelected.has(entry.uri)
          ? currentEntries.filter((item) => currentSelected.has(item.uri))
          : [entry];
      const normalizedEntries = dragEntries.length > 0 ? dragEntries : [entry];
      const dragUris = normalizedEntries.map((item) =>
        resolveEntryDragUri(
          item,
          dragProjectIdRef.current,
          dragRootUriRef.current
        )
      );
      const dragUri = dragUris[0];
      setImageDragPayload(event.dataTransfer, {
        baseUri: dragUri,
        fileName: normalizedEntries[0]?.name ?? entry.name,
      });
      if (dragUris.length > 1) {
        // 多选拖拽时保留完整列表用于目录内移动。
        event.dataTransfer.setData(FILE_DRAG_URIS_MIME, JSON.stringify(dragUris));
      }
      // 允许在应用内复制到聊天，同时支持文件管理中的移动操作。
      event.dataTransfer.effectAllowed = "copyMove";
      onEntryDragStartRef.current?.(entry, event);
    },
    [resolveEntryFromEvent, shouldBlockPointerEvent]
  );

  /** Handle drag over on entry folders. */
  const handleEntryDragOver = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      setDragOverFolderUri(entry.uri);
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [resolveEntryFromEvent]
  );

  /** Handle drag enter on entry folders. */
  const handleEntryDragEnter = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      setDragOverFolderUri(entry.uri);
    },
    [resolveEntryFromEvent]
  );

  /** Handle drag leave on entry folders. */
  const handleEntryDragLeave = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
      setDragOverFolderUri((current) => (current === entry.uri ? null : current));
    },
    [resolveEntryFromEvent]
  );

  /** Handle drop on entry folders. */
  const handleEntryDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      setDragOverFolderUri(null);
      onEntryDropRef.current?.(entry, event);
    },
    [resolveEntryFromEvent]
  );

  /** Handle select-all shortcut for the grid. */
  const handleSelectAll = useCallback(() => {
    const change = onSelectionChangeRef.current;
    if (!change) return;
    const allUris = entriesRef.current.map((entry) => entry.uri);
    const sorted = [...allUris].sort();
    lastSelectedRef.current = sorted.join("|");
    change(sorted, "replace");
  }, []);

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

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const start = selectionStartRef.current;
      if (!start) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx < 4 && dy < 4) {
        return;
      }
      const left = Math.min(start.x, event.clientX);
      const top = Math.min(start.y, event.clientY);
      const right = Math.max(start.x, event.clientX);
      const bottom = Math.max(start.y, event.clientY);
      const rect = { left, top, right, bottom };
      selectionRectRef.current = rect;
      setSelectionRect(rect);
      updateSelectionFromRect(rect);
      event.preventDefault();
    },
    [updateSelectionFromRect]
  );

  const handleMouseUp = useCallback(() => {
    if (!selectionStartRef.current) return;
    const rect = selectionRectRef.current;
    selectionStartRef.current = null;
    selectionRectRef.current = null;
    setSelectionRect(null);
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    // 未形成拖拽矩形时，视为点击空白处清空选择。
    if (!rect && onSelectionChange) {
      lastSelectedRef.current = "";
      onSelectionChange([], "replace");
    }
  }, [handleMouseMove, onSelectionChange]);

  /** Start drag selection when the user presses on empty space. */
  const handleGridMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (shouldBlockPointerEvent(event)) {
        event.preventDefault();
        return;
      }
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-entry-card="true"]')) return;
      if (renamingUri) {
        // 重命名时点击空白处直接提交，避免被框选逻辑拦截。
        onRenamingSubmit?.();
        return;
      }
      gridRef.current?.focus();
      selectionModeRef.current = resolveSelectionMode
        ? resolveSelectionMode(event)
        : event.metaKey || event.ctrlKey
          ? "toggle"
          : "replace";
      selectionStartRef.current = { x: event.clientX, y: event.clientY };
      selectionRectRef.current = null;
      lastSelectedRef.current = "";
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      event.preventDefault();
    },
    [
      handleMouseMove,
      handleMouseUp,
      onRenamingSubmit,
      renamingUri,
      resolveSelectionMode,
      shouldBlockPointerEvent,
    ]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        // 输入场景保留浏览器默认全选行为。
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      const gridEl = gridRef.current;
      if (!gridEl || !target || !gridEl.contains(target)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      handleSelectAll();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSelectAll]);

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
 
      {!isLoading && entries.length === 0 ? (
        <div className="flex h-full items-center justify-center translate-y-2">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Folder />
              </EmptyMedia>
              <EmptyTitle>暂无文件</EmptyTitle>
              <EmptyDescription>创建一个文档或画布开始工作。</EmptyDescription>
            </EmptyHeader>
            {showEmptyActions ? (
              <EmptyContent>
                <div className="flex gap-2">
                  <Button>创建文档</Button>
                  <Button
                    variant="outline"
                    onClick={(event) => {
                      if (shouldBlockPointerEvent(event)) return;
                      onCreateBoard?.();
                    }}
                  >
                    创建画布
                  </Button>
                </div>
              </EmptyContent>
            ) : null}
            {parentUri && parentEntry ? (
              <Button
                variant="link"
                className="text-muted-foreground"
                size="sm"
                onClick={(event) => {
                  if (shouldBlockPointerEvent(event)) return;
                  if (event.button !== 0) return;
                  if (event.nativeEvent.which !== 1) return;
                  onNavigate?.(parentUri);
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
                  setDragOverFolderUri((current) =>
                    current === parentEntry.uri ? null : current
                  );
                }}
                onDrop={(event) => {
                  setDragOverFolderUri(null);
                  onEntryDrop?.(parentEntry, event);
                }}
              >
                <ArrowLeftIcon />
                返回上级
              </Button>
            ) : null}
          </Empty>
        </div>
      ) : null}
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
          className="grid gap-5 justify-start [grid-template-columns:repeat(1,minmax(140px,1fr))] @[320px]/fs-grid:[grid-template-columns:repeat(2,minmax(140px,1fr))] @[480px]/fs-grid:[grid-template-columns:repeat(3,minmax(140px,1fr))] @[640px]/fs-grid:[grid-template-columns:repeat(4,minmax(140px,1fr))] @[800px]/fs-grid:[grid-template-columns:repeat(5,minmax(140px,1fr))] @[960px]/fs-grid:[grid-template-columns:repeat(6,minmax(140px,1fr))]"
        >
          {shouldShowParentEntry && parentEntry ? (
            <button
              type="button"
              data-flip-id={parentEntry.uri}
              className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/80 ${
                selectedUris?.has(parentEntry.uri)
                  ? "bg-muted/70 ring-1 ring-border"
                  : dragOverFolderUri === parentEntry.uri
                    ? "bg-muted/80 ring-1 ring-border"
                    : ""
              }`}
              onDoubleClick={(event) => {
                if (shouldBlockPointerEvent(event)) return;
                if (event.button !== 0) return;
                if (event.nativeEvent.which !== 1) return;
                onNavigate?.(parentUri!);
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
                setDragOverFolderUri((current) =>
                  current === parentEntry.uri ? null : current
                );
              }}
              onDrop={(event) => {
                setDragOverFolderUri(null);
                onEntryDrop?.(parentEntry, event);
              }}
            >
              <FolderUp className="h-11 w-11 text-muted-foreground" />
              <span className="line-clamp-2 min-h-[2rem] w-full break-words leading-4">
                上一级
              </span>
            </button>
          ) : null}
          {entries.map((entry) => {
            const isRenaming = renamingUri === entry.uri;
            const isSelected = selectedUris?.has(entry.uri) ?? false;
            const isDragOver = entry.kind === "folder" && dragOverFolderUri === entry.uri;
            const thumbnailSrc = thumbnailByUri.get(entry.uri);
            const visual = getEntryVisual({
              kind: entry.kind,
              name: entry.name,
              ext: entry.ext,
              isEmpty: entry.isEmpty,
              thumbnailSrc,
            });
            const displayName =
              entry.kind === "folder" && isBoardFolderName(entry.name)
                ? getBoardDisplayName(entry.name)
                : entry.kind === "file"
                  ? getDisplayFileName(entry.name, entry.ext)
                  : entry.name;
            const card = isRenaming ? (
              <div
                data-entry-card="true"
                data-entry-uri={entry.uri}
                data-flip-id={entry.uri}
                ref={registerEntryRef(entry.uri)}
                className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground transition-colors ring-1 ring-border/40 bg-muted/30 shadow-sm ${
                  isSelected ? "bg-muted/60 ring-border/70" : ""
                }`}
              >
                {visual}
                <Input
                  value={renamingValue ?? displayName}
                  onChange={(event) => onRenamingChange?.(event.target.value)}
                  className="h-7 text-center text-xs bg-background/80"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onRenamingSubmit?.();
                    }
                    if (event.key === "Escape") {
                      onRenamingCancel?.();
                    }
                  }}
                  onBlur={() => onRenamingSubmit?.()}
                />
              </div>
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
    </div>
  );
});

export type { FileSystemEntry };
export { FileSystemEntryCard, FileSystemGrid };
