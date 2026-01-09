"use client";

import {
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  getEntryExt,
  getRelativePathFromUri,
} from "./file-system-utils";
import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFileExt,
  isBoardFolderName,
} from "@/lib/file-name";
import { setImageDragPayload } from "@/lib/image/drag";

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
const DOC_EXTS = new Set(["doc", "docx"]);
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

/** Return true when the entry represents a board folder. */
const isBoardFolderEntry = (entry: FileSystemEntry) =>
  entry.kind === "folder" && isBoardFolderName(entry.name);

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

type FileSystemEntryCardProps = {
  entry: FileSystemEntry;
  /** Thumbnail data url for image entries. */
  thumbnailSrc?: string;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isSelected?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnter?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLButtonElement>) => void;
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
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return <FileText className="h-10 w-10 text-muted-foreground" />;
  }
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

/** Render a file name with suffix-preserving truncation. */
const FileSystemEntryName = memo(function FileSystemEntryName({
  entry,
}: {
  entry: FileSystemEntry;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  // 用于测量文本高度的隐藏节点。
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const nameInfo = useMemo(() => {
    const normalizedExt = entry.kind === "file" ? getEntryExt(entry) : "";
    const displayName = (() => {
      if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
        return getBoardDisplayName(entry.name);
      }
      if (entry.kind === "file") {
        return getDisplayFileName(entry.name, normalizedExt);
      }
      return entry.name;
    })();
    if (entry.kind !== "file" || !normalizedExt || isBoardFileExt(normalizedExt)) {
      return {
        prefix: displayName,
        suffix: "",
        fullName: displayName,
      };
    }
    const dotIndex = entry.name.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex >= entry.name.length - 1) {
      return {
        prefix: displayName,
        suffix: "",
        fullName: displayName,
      };
    }
    return {
      prefix: entry.name.slice(0, dotIndex),
      suffix: entry.name.slice(dotIndex),
      fullName: entry.name,
    };
  }, [entry.ext, entry.kind, entry.name]);
  // 缓存计算后的显示文本，避免频繁触发布局测量。
  const [labelText, setLabelText] = useState(nameInfo.fullName);

  /** Ensure the hidden measurement node exists. */
  const ensureMeasureElement = useCallback((host: HTMLElement) => {
    if (measureRef.current) return measureRef.current;
    const span = document.createElement("span");
    span.setAttribute("data-entry-name-measure", "true");
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.pointerEvents = "none";
    span.style.left = "0";
    span.style.top = "0";
    span.style.padding = "0";
    span.style.margin = "0";
    span.style.border = "0";
    span.style.boxSizing = "border-box";
    span.style.whiteSpace = "normal";
    span.style.overflowWrap = "break-word";
    span.style.wordBreak = "break-word";
    span.style.zIndex = "-1";
    const container = host.parentElement ?? document.body;
    container.appendChild(span);
    measureRef.current = span;
    return span;
  }, []);

  /** Recalculate the label text so the suffix stays visible. */
  const recomputeLabel = useCallback(() => {
    const labelEl = labelRef.current;
    if (!labelEl) return;
    if (!nameInfo.suffix) {
      setLabelText(nameInfo.fullName);
      return;
    }
    const width = labelEl.clientWidth;
    if (!width) {
      setLabelText(nameInfo.fullName);
      return;
    }
    const measureEl = ensureMeasureElement(labelEl);
    const computed = window.getComputedStyle(labelEl);
    const fontSize = parseFloat(computed.fontSize || "0");
    const parsedLineHeight = parseFloat(computed.lineHeight || "");
    const lineHeight = Number.isNaN(parsedLineHeight)
      ? Math.ceil(fontSize * 1.4)
      : parsedLineHeight;
    if (!lineHeight) {
      setLabelText(nameInfo.fullName);
      return;
    }
    // 同步文本样式与宽度，确保测量结果准确。
    measureEl.style.width = `${width}px`;
    measureEl.style.font = computed.font;
    measureEl.style.letterSpacing = computed.letterSpacing;
    measureEl.style.textTransform = computed.textTransform;
    measureEl.style.textAlign = computed.textAlign;
    measureEl.style.lineHeight = `${lineHeight}px`;
    const maxHeight = lineHeight * 2 + 0.5;
    const fits = (text: string) => {
      measureEl.textContent = text;
      return measureEl.getBoundingClientRect().height <= maxHeight;
    };
    if (fits(nameInfo.fullName)) {
      setLabelText(nameInfo.fullName);
      return;
    }
    const prefixChars = Array.from(nameInfo.prefix);
    let low = 0;
    let high = prefixChars.length;
    let best = `...${nameInfo.suffix}`;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${prefixChars.slice(0, mid).join("")}...${nameInfo.suffix}`;
      if (fits(candidate)) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    setLabelText(best);
  }, [ensureMeasureElement, nameInfo]);

  useLayoutEffect(() => {
    recomputeLabel();
  }, [recomputeLabel]);

  useEffect(() => {
    if (!nameInfo.suffix) return;
    const labelEl = labelRef.current;
    if (!labelEl) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        recomputeLabel();
      });
    });
    observer.observe(labelEl);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [recomputeLabel]);

  useEffect(() => {
    return () => {
      if (measureRef.current) {
        measureRef.current.remove();
        measureRef.current = null;
      }
    };
  }, []);

  return (
    <span
      ref={labelRef}
      className="line-clamp-2 min-h-[2rem] w-full break-words leading-4"
    >
      {labelText}
    </span>
  );
});
FileSystemEntryName.displayName = "FileSystemEntryName";

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
        isDragOver = false,
        onDragStart,
        onDragOver,
        onDragEnter,
        onDragLeave,
        onDrop,
      },
      ref
    ) {
      const visual = getEntryVisual(entry, thumbnailSrc);
      return (
        <button
          ref={ref}
          type="button"
          data-entry-card="true"
          data-entry-uri={entry.uri}
          className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/80 ${
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
          {visual}
          <FileSystemEntryName entry={entry} />
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
  // 记录最近一次右键触发的条目与时间，用于 0.5 秒内拦截左右键误触。
  const lastContextMenuRef = useRef<{ uri: string; at: number } | null>(null);
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
    const gridEl = gridListRef.current;
    if (!gridEl) return;
    let frame = 0;
    // 通过子元素的 offsetTop 统计行数，决定整体对齐方式。
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
            {parentUri ? (
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
        className="relative flex-1 min-h-full h-full p-0.5"
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
          className={`grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(140px,180px))] ${
            isMultiRow ? "justify-between" : "justify-start"
          }`}
        >
          {shouldShowParentEntry ? (
            <button
              type="button"
              className="flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/80"
              onDoubleClick={(event) => {
                if (shouldBlockPointerEvent(event)) return;
                if (event.button !== 0) return;
                if (event.nativeEvent.which !== 1) return;
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
            const isDragOver = entry.kind === "folder" && dragOverFolderUri === entry.uri;
            const thumbnailSrc = thumbnailByUri.get(entry.uri);
            const visual = getEntryVisual(entry, thumbnailSrc);
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
                entry={entry}
                thumbnailSrc={thumbnailSrc}
                ref={registerEntryRef(entry.uri)}
                isSelected={isSelected}
                isDragOver={isDragOver}
                onClick={(event) => {
                  if (shouldBlockPointerEvent(event)) return;
                  onEntryClick?.(entry, event);
                }}
                onDoubleClick={(event) => {
                  if (shouldBlockPointerEvent(event)) return;
                  if (event.button !== 0) return;
                  if (event.nativeEvent.which !== 1) return;
                  const entryExt = getEntryExt(entry);
                  if (entry.kind === "file" && IMAGE_EXTS.has(entryExt)) {
                    onOpenImage?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && CODE_EXTS.has(entryExt)) {
                    onOpenCode?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && PDF_EXTS.has(entryExt)) {
                    onOpenPdf?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && DOC_EXTS.has(entryExt)) {
                    onOpenDoc?.(entry);
                    return;
                  }
                  if (entry.kind === "file" && SPREADSHEET_EXTS.has(entryExt)) {
                    onOpenSpreadsheet?.(entry);
                    return;
                  }
                  if (isBoardFolderEntry(entry)) {
                    onOpenBoard?.(entry);
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
                  onNavigate?.(entry.uri);
                }}
                onContextMenu={(event) => {
                  onEntryContextMenu?.(entry, event);
                }}
                onDragStart={(event) => {
                  if (shouldBlockPointerEvent(event)) {
                    event.preventDefault();
                    return;
                  }
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
                  const dragUri = (() => {
                    if (!dragProjectId || !dragRootUri) return entry.uri;
                    const relativePath = getRelativePathFromUri(
                      dragRootUri,
                      entry.uri
                    );
                    if (!relativePath) return entry.uri;
                    // 对外拖拽统一使用 teatime-file 协议。
                    return buildTeatimeFileUrl(dragProjectId, relativePath);
                  })();
                  setImageDragPayload(event.dataTransfer, {
                    baseUri: dragUri,
                    fileName: entry.name,
                  });
                  // 允许在应用内复制到聊天，同时支持文件管理中的移动操作。
                  event.dataTransfer.effectAllowed = "copyMove";
                  onEntryDragStart?.(entry, event);
                }}
                onDragOver={(event) => {
                  if (entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
                  setDragOverFolderUri(entry.uri);
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragEnter={(event) => {
                  if (entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
                  setDragOverFolderUri(entry.uri);
                }}
                onDragLeave={(event) => {
                  if (entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                  setDragOverFolderUri((current) =>
                    current === entry.uri ? null : current
                  );
                }}
                onDrop={(event) => {
                  if (entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
                  setDragOverFolderUri(null);
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
