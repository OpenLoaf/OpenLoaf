"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type DragEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { setImageDragPayload } from "@/lib/image/drag";
import {
  type FileSystemEntry,
  buildTenasFileUrl,
  FILE_DRAG_URIS_MIME,
  getRelativePathFromUri,
} from "../utils/file-system-utils";

/** Image filename matcher. */
const IMAGE_FILE_NAME_REGEX = /\.(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i;

/** Check whether a file system entry is an image. */
function isImageEntry(entry: FileSystemEntry) {
  return IMAGE_FILE_NAME_REGEX.test(entry.name);
}

type UseFileSystemDragParams = {
  entriesRef: MutableRefObject<FileSystemEntry[]>;
  selectedUrisRef: MutableRefObject<Set<string> | undefined>;
  dragProjectIdRef: MutableRefObject<string | undefined>;
  dragRootUriRef: MutableRefObject<string | undefined>;
  onEntryDragStartRef: MutableRefObject<
    | ((entry: FileSystemEntry, event: DragEvent<HTMLButtonElement>) => void)
    | undefined
  >;
  onEntryDropRef: MutableRefObject<
    | ((entry: FileSystemEntry, event: DragEvent<HTMLButtonElement>) => void)
    | undefined
  >;
  resolveEntryFromEvent: (event: {
    currentTarget: HTMLElement;
  }) => FileSystemEntry | null;
  isBoardFolderEntry: (entry: FileSystemEntry) => boolean;
  shouldBlockPointerEvent: (event: { button?: number } | null | undefined) => boolean;
};

type UseFileSystemDragResult = {
  dragOverFolderUri: string | null;
  setDragOverFolderUri: Dispatch<SetStateAction<string | null>>;
  handleEntryDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  handleEntryDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  handleEntryDragEnter: (event: DragEvent<HTMLButtonElement>) => void;
  handleEntryDragLeave: (event: DragEvent<HTMLButtonElement>) => void;
  handleEntryDrop: (event: DragEvent<HTMLButtonElement>) => void;
};

/** Resolve drag uri for a file system entry. */
const resolveEntryDragUri = (
  entry: FileSystemEntry,
  dragProjectId?: string,
  dragRootUri?: string
) => {
  if (!dragProjectId || !dragRootUri) return entry.uri;
  const relativePath = getRelativePathFromUri(dragRootUri, entry.uri);
  if (!relativePath) return entry.uri;
  // 对外拖拽统一使用 tenas-file 协议。
  return buildTenasFileUrl(dragProjectId, relativePath);
};

/** Manage drag interactions for file system entries. */
function useFileSystemDrag({
  entriesRef,
  selectedUrisRef,
  dragProjectIdRef,
  dragRootUriRef,
  onEntryDragStartRef,
  onEntryDropRef,
  resolveEntryFromEvent,
  isBoardFolderEntry,
  shouldBlockPointerEvent,
}: UseFileSystemDragParams): UseFileSystemDragResult {
  // 记录当前拖拽悬停的文件夹，用于高亮提示。
  const [dragOverFolderUri, setDragOverFolderUri] = useState<string | null>(null);

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
      }, {
        kind: isImageEntry(normalizedEntries[0] ?? entry) ? "image" : "file",
      });
      if (dragUris.length > 1) {
        // 多选拖拽时保留完整列表用于目录内移动。
        event.dataTransfer.setData(FILE_DRAG_URIS_MIME, JSON.stringify(dragUris));
      }
      // 允许在应用内复制到聊天，同时支持文件管理中的移动操作。
      event.dataTransfer.effectAllowed = "copyMove";
      onEntryDragStartRef.current?.(entry, event);
    },
    [
      dragProjectIdRef,
      dragRootUriRef,
      entriesRef,
      onEntryDragStartRef,
      resolveEntryFromEvent,
      selectedUrisRef,
      shouldBlockPointerEvent,
    ]
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
    [isBoardFolderEntry, resolveEntryFromEvent]
  );

  /** Handle drag enter on entry folders. */
  const handleEntryDragEnter = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      setDragOverFolderUri(entry.uri);
    },
    [isBoardFolderEntry, resolveEntryFromEvent]
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
    [isBoardFolderEntry, resolveEntryFromEvent]
  );

  /** Handle drop on entry folders. */
  const handleEntryDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      setDragOverFolderUri(null);
      onEntryDropRef.current?.(entry, event);
    },
    [isBoardFolderEntry, onEntryDropRef, resolveEntryFromEvent]
  );

  return {
    dragOverFolderUri,
    setDragOverFolderUri,
    handleEntryDragStart,
    handleEntryDragOver,
    handleEntryDragEnter,
    handleEntryDragLeave,
    handleEntryDrop,
  };
}

export { useFileSystemDrag };
