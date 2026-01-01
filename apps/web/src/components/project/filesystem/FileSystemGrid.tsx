"use client";

import {
  Fragment,
  forwardRef,
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
import {
  ArrowLeftIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderUp,
} from "lucide-react";
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
import {
  type FileSystemEntry,
  buildTeatimeFileUrl,
  getEntryExt,
  getRelativePathFromUri,
} from "./file-system-utils";
import { FILE_DRAG_NAME_MIME, FILE_DRAG_URI_MIME } from "./file-system-utils";
import { getDisplayFileName, isBoardFileExt } from "@/lib/file-name";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "avif",
  "tiff",
  "heic",
]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "gz", "tar", "bz2", "xz"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aac"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
const SPREADSHEET_EXTS = new Set(["xls", "xlsx", "csv", "tsv", "numbers"]);
const PDF_EXTS = new Set(["pdf"]);
const CODE_EXTS = new Set([
  "js",
  "ts",
  "tsx",
  "jsx",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "py",
  "go",
  "rs",
  "java",
  "cpp",
  "c",
  "h",
  "hpp",
  "css",
  "scss",
  "less",
  "html",
  "xml",
  "sh",
  "zsh",
  "md",
  "mdx",
]);

type FileSystemGridProps = {
  entries: FileSystemEntry[];
  isLoading: boolean;
  parentUri?: string | null;
  dragProjectId?: string;
  dragRootUri?: string;
  onNavigate?: (nextUri: string) => void;
  /** Open image entries in an external viewer. */
  onOpenImage?: (entry: FileSystemEntry) => void;
  /** Open code entries in an external viewer. */
  onOpenCode?: (entry: FileSystemEntry) => void;
  /** Open PDF entries in an external viewer. */
  onOpenPdf?: (entry: FileSystemEntry) => void;
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

type FileSystemEntryCardProps = {
  entry: FileSystemEntry;
  /** Thumbnail data url for image entries. */
  thumbnailSrc?: string;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isSelected?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
};

/** Render a thumbnail preview for image files. */
const ImageThumbnail = memo(function ImageThumbnail({
  src,
  name,
}: {
  src?: string | null;
  name: string;
}) {
  return (
    <div className="h-10 w-10 overflow-hidden rounded-md bg-muted/40">
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <FileImage className="h-full w-full p-2 text-muted-foreground" />
      )}
    </div>
  );
});

/** Resolve file icon or image thumbnail for grid items. */
function getEntryVisual(entry: FileSystemEntry, thumbnailSrc?: string) {
  if (entry.kind === "folder") {
    return <Folder className="h-10 w-10 text-muted-foreground" />;
  }
  const ext = getEntryExt(entry);
  if (IMAGE_EXTS.has(ext)) {
    return <ImageThumbnail src={thumbnailSrc} name={entry.name} />;
  }
  if (ARCHIVE_EXTS.has(ext)) {
    return <FileArchive className="h-10 w-10 text-muted-foreground" />;
  }
  if (AUDIO_EXTS.has(ext)) {
    return <FileAudio className="h-10 w-10 text-muted-foreground" />;
  }
  if (VIDEO_EXTS.has(ext)) {
    return <FileVideo className="h-10 w-10 text-muted-foreground" />;
  }
  if (SPREADSHEET_EXTS.has(ext)) {
    return <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />;
  }
  if (CODE_EXTS.has(ext)) {
    return <FileCode className="h-10 w-10 text-muted-foreground" />;
  }
  return <FileText className="h-10 w-10 text-muted-foreground" />;
}

/** Render a single file system entry card. */
const FileSystemEntryCard = memo(
  forwardRef<HTMLButtonElement, FileSystemEntryCardProps>(
    function FileSystemEntryCard(
      {
        entry,
        thumbnailSrc,
        onClick,
        onDoubleClick,
        onContextMenu,
        isSelected = false,
        onDragStart,
        onDragOver,
        onDrop,
      },
      ref
    ) {
      const visual = getEntryVisual(entry, thumbnailSrc);
      const displayName =
        entry.kind === "file"
          ? getDisplayFileName(entry.name, entry.ext)
          : entry.name;
      return (
        <button
          ref={ref}
          type="button"
          data-entry-card="true"
          data-entry-uri={entry.uri}
          className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/80 ${
            isSelected ? "bg-muted/70 ring-1 ring-border" : ""
          }`}
          draggable
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {visual}
          <span className="line-clamp-2 min-h-[2rem] w-full break-words leading-4">
            {displayName}
          </span>
        </button>
      );
    }
  )
);
FileSystemEntryCard.displayName = "FileSystemEntryCard";

/** File system grid with empty state. */
const FileSystemGrid = memo(function FileSystemGrid({
  entries,
  isLoading,
  parentUri,
  dragProjectId,
  dragRootUri,
  onNavigate,
  onOpenImage,
  onOpenCode,
  onOpenPdf,
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
  const [selectionRect, setSelectionRect] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  const [isMultiRow, setIsMultiRow] = useState(false);
  // 仅筛选图片文件用于缩略图请求，减少不必要的传输。
  const imageUris = useMemo(() => {
    return entries
      .filter(
        (entry) => entry.kind === "file" && IMAGE_EXTS.has(getEntryExt(entry))
      )
      .map((entry) => entry.uri);
  }, [entries]);
  // 通过缩略图接口批量获取图片预览。
  const thumbnailsQuery = useQuery(
    trpc.fs.thumbnails.queryOptions(
      imageUris.length ? { uris: imageUris } : skipToken
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

  // 中文注释：登记网格条目节点，用于框选命中计算。
  const registerEntryRef = useCallback((uri: string) => {
    return (node: HTMLElement | null) => {
      if (node) {
        entryRefs.current.set(uri, node);
      } else {
        entryRefs.current.delete(uri);
      }
    };
  }, []);

  // 中文注释：根据框选矩形计算命中的条目集合。
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
    // 中文注释：未形成拖拽矩形时，视为点击空白处清空选择。
    if (!rect && onSelectionChange) {
      lastSelectedRef.current = "";
      onSelectionChange([], "replace");
    }
  }, [handleMouseMove, onSelectionChange]);

  const handleGridMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-entry-card="true"]')) return;
      selectionModeRef.current =
        event.metaKey || event.ctrlKey ? "toggle" : "replace";
      selectionStartRef.current = { x: event.clientX, y: event.clientY };
      selectionRectRef.current = null;
      lastSelectedRef.current = "";
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      event.preventDefault();
    },
    [handleMouseMove, handleMouseUp]
  );

  // 记录文件列表状态变化，方便定位异常跳转。
  useEffect(() => {
    console.debug("[FileSystemGrid] state", {
      at: new Date().toISOString(),
      isLoading,
      entriesLength: entries.length,
      parentUri,
      showEmptyActions,
      shouldShowParentEntry,
    });
  }, [
    isLoading,
    entries.length,
    parentUri,
    showEmptyActions,
    shouldShowParentEntry,
  ]);

  useEffect(() => {
    const gridEl = gridListRef.current;
    if (!gridEl) return;
    let frame = 0;
    // 中文注释：通过子元素的 offsetTop 统计行数，决定整体对齐方式。
    const measureRows = () => {
      const children = Array.from(gridEl.children) as HTMLElement[];
      const rowTops = new Set<number>();
      for (const child of children) {
        rowTops.add(child.offsetTop);
        if (rowTops.size > 1) break;
      }
      setIsMultiRow(rowTops.size > 1);
    };
    const requestMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureRows);
    };
    requestMeasure();
    const observer = new ResizeObserver(requestMeasure);
    observer.observe(gridEl);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [entries.length, shouldShowParentEntry]);

  return (
    <div className="flex min-h-full h-full flex-col">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">正在读取文件...</div>
      ) : null}
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
                  <Button variant="outline" onClick={onCreateBoard}>
                    创建画布
                  </Button>
                </div>
              </EmptyContent>
            ) : null}
            {parentUri ? (
              <Button
                variant="link"
                className="text-muted-foreground"
                size="sm"
                onClick={(event) => {
                  console.debug("[FileSystemGrid] empty navigate", {
                    at: new Date().toISOString(),
                    uri: parentUri,
                    button: event.button,
                    detail: event.detail,
                    type: event.type,
                    which: event.nativeEvent?.which,
                    buttons: event.nativeEvent?.buttons,
                  });
                  if (event.button !== 0) return;
                  if (event.nativeEvent.which !== 1) return;
                  onNavigate?.(parentUri);
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
        className="relative flex-1 min-h-full h-full"
        onMouseDown={handleGridMouseDown}
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
          className={`grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(140px,180px))] ${
            isMultiRow ? "justify-between" : "justify-start"
          }`}
        >
          {shouldShowParentEntry ? (
            <button
              type="button"
              className="flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/80"
              onDoubleClick={(event) => {
                if (event.button !== 0) return;
                if (event.nativeEvent.which !== 1) return;
                const pointerType =
                  "pointerType" in event.nativeEvent
                    ? (event.nativeEvent as PointerEvent).pointerType
                    : undefined;
                console.debug("[FileSystemGrid] parent dblclick", {
                  at: new Date().toISOString(),
                  button: event.button,
                  detail: event.detail,
                  type: event.type,
                  which: event.nativeEvent?.which,
                  buttons: event.nativeEvent?.buttons,
                  pointerType,
                });
                console.debug("[FileSystemGrid] parent navigate", {
                  at: new Date().toISOString(),
                  uri: parentUri,
                });
                onNavigate?.(parentUri!);
              }}
            >
              <FolderUp className="h-10 w-10 text-muted-foreground" />
              <span className="line-clamp-2 min-h-[2rem] w-full break-words leading-4">
                上一级
              </span>
            </button>
          ) : null}
          {entries.map((entry) => {
            const isRenaming = renamingUri === entry.uri;
            const isSelected = selectedUris?.has(entry.uri) ?? false;
            const thumbnailSrc = thumbnailByUri.get(entry.uri);
            const visual = getEntryVisual(entry, thumbnailSrc);
            const displayName =
              entry.kind === "file"
                ? getDisplayFileName(entry.name, entry.ext)
                : entry.name;
            const card = isRenaming ? (
              <div
                data-entry-card="true"
                data-entry-uri={entry.uri}
                ref={registerEntryRef(entry.uri)}
                className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground ring-1 ring-border ${
                  isSelected ? "bg-muted/70" : ""
                }`}
              >
                {visual}
                <Input
                  value={renamingValue ?? displayName}
                  onChange={(event) => onRenamingChange?.(event.target.value)}
                  className="h-7 text-center text-xs"
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
                entry={entry}
                thumbnailSrc={thumbnailSrc}
                ref={registerEntryRef(entry.uri)}
                isSelected={isSelected}
                onClick={(event) => onEntryClick?.(entry, event)}
                onDoubleClick={(event) => {
                  const pointerType =
                    "pointerType" in event.nativeEvent
                      ? (event.nativeEvent as PointerEvent).pointerType
                      : undefined;
                  console.debug("[FileSystemGrid] entry dblclick", {
                    at: new Date().toISOString(),
                    name: entry.name,
                    kind: entry.kind,
                    button: event.button,
                    detail: event.detail,
                    type: event.type,
                    which: event.nativeEvent?.which,
                    buttons: event.nativeEvent?.buttons,
                    pointerType,
                  });
                  if (event.button !== 0) return;
                  if (event.nativeEvent.which !== 1) return;
                  const entryExt = getEntryExt(entry);
                  if (entry.kind === "file" && IMAGE_EXTS.has(entryExt)) {
                    console.debug("[FileSystemGrid] entry image open", {
                      at: new Date().toISOString(),
                      name: entry.name,
                      uri: entry.uri,
                    });
                    onOpenImage?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && CODE_EXTS.has(entryExt)) {
                    console.debug("[FileSystemGrid] entry code open", {
                      at: new Date().toISOString(),
                      name: entry.name,
                      uri: entry.uri,
                    });
                    onOpenCode?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && PDF_EXTS.has(entryExt)) {
                    console.debug("[FileSystemGrid] entry pdf open", {
                      at: new Date().toISOString(),
                      name: entry.name,
                      uri: entry.uri,
                    });
                    onOpenPdf?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && isBoardFileExt(entryExt)) {
                    console.debug("[FileSystemGrid] entry board open", {
                      at: new Date().toISOString(),
                      name: entry.name,
                      uri: entry.uri,
                    });
                    onOpenBoard?.(entry);
                    return;
                  }
                  if (entry.kind === "file") {
                    // 中文注释：不支持预览的文件类型交给系统默认程序打开。
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
                  console.debug("[FileSystemGrid] entry navigate", {
                    at: new Date().toISOString(),
                    name: entry.name,
                    uri: entry.uri,
                  });
                  onNavigate?.(entry.uri);
                }}
                onContextMenu={(event) => {
                  const pointerType =
                    "pointerType" in event.nativeEvent
                      ? (event.nativeEvent as PointerEvent).pointerType
                      : undefined;
                  console.debug("[FileSystemGrid] entry contextmenu", {
                    at: new Date().toISOString(),
                    name: entry.name,
                    kind: entry.kind,
                    button: event.button,
                    detail: event.detail,
                    type: event.type,
                    pointerType,
                  });
                  onEntryContextMenu?.(entry, event);
                }}
                onDragStart={(event) => {
                  const dragUri = (() => {
                    if (!dragProjectId || !dragRootUri) return entry.uri;
                    const relativePath = getRelativePathFromUri(
                      dragRootUri,
                      entry.uri
                    );
                    if (!relativePath) return entry.uri;
                    // 中文注释：对外拖拽统一使用 teatime-file 协议。
                    return buildTeatimeFileUrl(dragProjectId, relativePath);
                  })();
                  event.dataTransfer.setData(FILE_DRAG_URI_MIME, dragUri);
                  event.dataTransfer.setData(FILE_DRAG_NAME_MIME, entry.name);
                  event.dataTransfer.effectAllowed = "move";
                  onEntryDragStart?.(entry, event);
                }}
                onDragOver={(event) => {
                  if (entry.kind !== "folder") return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (entry.kind !== "folder") return;
                  onEntryDrop?.(entry, event);
                }}
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
