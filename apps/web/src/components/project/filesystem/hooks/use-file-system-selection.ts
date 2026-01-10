"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { type FileSystemEntry } from "../utils/file-system-utils";

type SelectionRect = {
  /** Left edge in viewport coordinates. */
  left: number;
  /** Top edge in viewport coordinates. */
  top: number;
  /** Right edge in viewport coordinates. */
  right: number;
  /** Bottom edge in viewport coordinates. */
  bottom: number;
};

type UseFileSystemSelectionParams = {
  /** Grid container ref for focus and coordinate mapping. */
  gridRef: RefObject<HTMLDivElement | null>;
  /** Latest entries ref for selection shortcuts. */
  entriesRef: MutableRefObject<FileSystemEntry[]>;
  /** Selection change callback. */
  onSelectionChange?: (uris: string[], mode: "replace" | "toggle") => void;
  /** Resolve selection mode on mouse down. */
  resolveSelectionMode?: (
    event: ReactMouseEvent<HTMLDivElement>
  ) => "replace" | "toggle";
  /** Current renaming uri, used to cancel selection on edit. */
  renamingUri?: string | null;
  /** Submit rename when clicking outside. */
  onRenamingSubmit?: () => void;
  /** Block pointer events after context menu triggers. */
  shouldBlockPointerEvent: (event: { button?: number } | null | undefined) => boolean;
};

type UseFileSystemSelectionResult = {
  /** Selection rectangle for overlay rendering. */
  selectionRect: SelectionRect | null;
  /** Register entry nodes for hit testing. */
  registerEntryRef: (uri: string) => (node: HTMLElement | null) => void;
  /** Grid mouse down handler to start selection. */
  handleGridMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

/** Manage drag selection and select-all shortcuts inside the grid. */
function useFileSystemSelection({
  gridRef,
  entriesRef,
  onSelectionChange,
  resolveSelectionMode,
  renamingUri,
  onRenamingSubmit,
  shouldBlockPointerEvent,
}: UseFileSystemSelectionParams): UseFileSystemSelectionResult {
  // 记录条目节点用于命中判断。
  const entryRefs = useRef(new Map<string, HTMLElement>());
  // 记录框选起点坐标。
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  // 保存框选矩形的最新值。
  const selectionRectRef = useRef<SelectionRect | null>(null);
  // 记录当前框选模式。
  const selectionModeRef = useRef<"replace" | "toggle">("replace");
  // 缓存上一次命中的签名，避免重复更新。
  const lastSelectedRef = useRef<string>("");
  // 保存当前框选矩形用于渲染覆盖层。
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  // 保持最新的选择回调引用。
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  /** Register entry nodes for hit testing. */
  const registerEntryRef = useCallback((uri: string) => {
    return (node: HTMLElement | null) => {
      if (node) {
        entryRefs.current.set(uri, node);
      } else {
        entryRefs.current.delete(uri);
      }
    };
  }, []);

  /** Update selection based on a drag rectangle. */
  const updateSelectionFromRect = useCallback(
    (rect: SelectionRect) => {
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

  /** Handle select-all shortcut for the grid. */
  const handleSelectAll = useCallback(() => {
    const change = onSelectionChangeRef.current;
    if (!change) return;
    const allUris = entriesRef.current.map((entry) => entry.uri);
    const sorted = [...allUris].sort();
    lastSelectedRef.current = sorted.join("|");
    change(sorted, "replace");
  }, [entriesRef]);

  /** Handle pointer move during selection. */
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

  /** Finish selection when the pointer is released. */
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
      gridRef,
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
  }, [gridRef, handleSelectAll]);

  return {
    selectionRect,
    registerEntryRef,
    handleGridMouseDown,
  };
}

export { useFileSystemSelection };
