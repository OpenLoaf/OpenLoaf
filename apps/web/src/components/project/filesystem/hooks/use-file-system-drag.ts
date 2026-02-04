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
  formatScopedProjectPath,
  FILE_DRAG_URIS_MIME,
  getEntryExt,
  getRelativePathFromUri,
} from "../utils/file-system-utils";
import { isElectronEnv } from "@/utils/is-electron-env";

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
  resolveThumbnailSrc?: (uri: string) => string | undefined;
  onEntryDragStartRef: MutableRefObject<
    | ((entries: FileSystemEntry[], event: DragEvent<HTMLElement>) => void)
    | undefined
  >;
  onEntryDropRef: MutableRefObject<
    | ((entry: FileSystemEntry, event: DragEvent<HTMLElement>) => void)
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
  handleEntryDragStart: (event: DragEvent<HTMLElement>) => void;
  handleEntryDragOver: (event: DragEvent<HTMLElement>) => void;
  handleEntryDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleEntryDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleEntryDrop: (event: DragEvent<HTMLElement>) => void;
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
  // 对外拖拽统一使用项目相对路径引用。
  return formatScopedProjectPath({
    projectId: dragProjectId,
    relativePath,
    includeAt: true,
  });
};

/** Manage drag interactions for file system entries. */
function useFileSystemDrag({
  entriesRef,
  selectedUrisRef,
  dragProjectIdRef,
  dragRootUriRef,
  resolveThumbnailSrc,
  onEntryDragStartRef,
  onEntryDropRef,
  resolveEntryFromEvent,
  isBoardFolderEntry,
  shouldBlockPointerEvent,
}: UseFileSystemDragParams): UseFileSystemDragResult {
  // 记录当前拖拽悬停的文件夹，用于高亮提示。
  const [dragOverFolderUri, setDragOverFolderUri] = useState<string | null>(null);

  const buildThumbnailDragPreview = useCallback(
    (entries: FileSystemEntry[], rect: DOMRect) => {
      if (!resolveThumbnailSrc) return null;
      const previewEntries = entries
        .map((entry) => ({
          entry,
          src: resolveThumbnailSrc(entry.uri),
          ext: getEntryExt(entry),
        }))
        .filter((item) => Boolean(item.src))
        .slice(0, 3);
      if (previewEntries.length === 0) return null;
      const cardWidth = Math.round(Math.max(64, Math.min(120, rect.width)));
      const cardHeight = Math.round(cardWidth * 0.75);
      const offset = Math.round(cardWidth * 0.12);
      const totalWidth = cardWidth + offset * (previewEntries.length - 1);
      const totalHeight = cardHeight + offset * (previewEntries.length - 1);
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "-9999px";
      container.style.left = "-9999px";
      container.style.pointerEvents = "none";
      container.style.width = `${totalWidth}px`;
      container.style.height = `${totalHeight}px`;
      // 逻辑：使用缩略图构建拖拽预览，支持多选堆叠展示。
      previewEntries.forEach((item, index) => {
        const frame = document.createElement("div");
        frame.style.position = "absolute";
        frame.style.top = `${index * offset}px`;
        frame.style.left = `${index * offset}px`;
        frame.style.width = `${cardWidth}px`;
        frame.style.height = `${cardHeight}px`;
        frame.style.borderRadius = "6px";
        frame.style.overflow = "hidden";
        frame.style.background = "rgba(255, 255, 255, 0.92)";
        frame.style.border = "1px solid rgba(0, 0, 0, 0.08)";
        frame.style.boxShadow = "0 12px 24px rgba(0, 0, 0, 0.18)";
        frame.style.zIndex = `${10 + index}`;
        const image = document.createElement("img");
        image.src = item.src ?? "";
        image.alt = item.entry.name;
        image.draggable = false;
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = item.ext && item.ext === "svg" ? "contain" : "cover";
        frame.appendChild(image);
        container.appendChild(frame);
      });
      return container;
    },
    [resolveThumbnailSrc]
  );

  /** Handle entry drag start without recreating per-card closures. */
  const handleEntryDragStart = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (shouldBlockPointerEvent(event)) {
        event.preventDefault();
        return;
      }
      const entry = resolveEntryFromEvent(event);
      if (!entry) return;
      const currentEntries = entriesRef.current;
      const currentSelected = selectedUrisRef.current;
      const dragEntries =
        currentSelected &&
        currentSelected.size > 1 &&
        currentSelected.has(entry.uri)
          ? currentEntries.filter((item) => currentSelected.has(item.uri))
          : [entry];
      const normalizedEntries = dragEntries.length > 0 ? dragEntries : [entry];
      const rect = event.currentTarget.getBoundingClientRect();
      const dragPreview = buildThumbnailDragPreview(normalizedEntries, rect);
      const fallbackPreview = event.currentTarget.cloneNode(true) as HTMLElement;
      const previewElement = dragPreview ?? fallbackPreview;
      // 逻辑：固定拖拽预览，避免浏览器用整行作为拖拽影像。
      previewElement.style.position = "absolute";
      previewElement.style.top = "-9999px";
      previewElement.style.left = "-9999px";
      previewElement.style.pointerEvents = "none";
      previewElement.style.transform = "none";
      previewElement.style.opacity = "0.95";
      if (!dragPreview) {
        previewElement.style.width = `${rect.width}px`;
        previewElement.style.height = `${rect.height}px`;
      }
      document.body.appendChild(previewElement);
      if (event.dataTransfer?.setDragImage) {
        const previewRect = previewElement.getBoundingClientRect();
        event.dataTransfer.setDragImage(
          previewElement,
          previewRect.width / 2,
          previewRect.height / 2
        );
      }
      requestAnimationFrame(() => {
        previewElement.remove();
      });
      const dragUris = normalizedEntries.map((item) =>
        resolveEntryDragUri(
          item,
          dragProjectIdRef.current,
          dragRootUriRef.current
        )
      );
      const isElectron = isElectronEnv() && Boolean(window.tenasElectron?.startDrag);
      console.log("[drag-out] renderer dragstart", {
        isElectron,
        hasApi: Boolean(window.tenasElectron?.startDrag),
      });
      if (isElectron) {
        onEntryDragStartRef.current?.(normalizedEntries, event);
        return;
      }
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
      onEntryDragStartRef.current?.(normalizedEntries, event);
    },
    [
      buildThumbnailDragPreview,
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
    (event: DragEvent<HTMLElement>) => {
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
    (event: DragEvent<HTMLElement>) => {
      const entry = resolveEntryFromEvent(event);
      if (!entry || entry.kind !== "folder" || isBoardFolderEntry(entry)) return;
      setDragOverFolderUri(entry.uri);
    },
    [isBoardFolderEntry, resolveEntryFromEvent]
  );

  /** Handle drag leave on entry folders. */
  const handleEntryDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
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
    (event: DragEvent<HTMLElement>) => {
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
