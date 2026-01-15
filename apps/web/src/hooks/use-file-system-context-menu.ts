"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { FileSystemEntry } from "@/components/project/filesystem/utils/file-system-utils";

/** Context menu target snapshot. */
type FileSystemContextMenuTarget =
  | {
      type: "entry";
      uri: string;
    }
  | {
      type: "empty";
    };

/** Payload for grid context menu capture. */
export type FileSystemContextMenuCapturePayload = {
  /** Entry uri under the context menu trigger. */
  uri: string | null;
  /** Optional entry snapshot for non-list targets (e.g. preview panel). */
  entry?: FileSystemEntry | null;
};

/** Options for file system context menu state. */
export type UseFileSystemContextMenuOptions = {
  /** Entries for the current folder. */
  entries: FileSystemEntry[];
  /** Selected entry uris. */
  selectedUris: Set<string>;
  /** Replace selection callback. */
  onReplaceSelection: (uris: string[]) => void;
  /** Delay before clearing menu target after close. */
  closeDelayMs?: number;
  /** Guard duration for accidental menu selection. */
  selectGuardMs?: number;
};

/** State and handlers for the file system context menu. */
export type UseFileSystemContextMenuResult = {
  /** Entry snapshot used for context menu rendering. */
  menuContextEntry: FileSystemEntry | null;
  /** Whether the context menu is currently open. */
  isContextMenuOpen: boolean;
  /** Capture the grid context menu target before Radix opens. */
  handleGridContextMenuCapture: (
    event: ReactMouseEvent<HTMLDivElement>,
    payload: FileSystemContextMenuCapturePayload
  ) => void;
  /** Track context menu open state changes. */
  handleContextMenuOpenChange: (open: boolean) => void;
  /** Wrap menu item actions with an open-click guard. */
  withMenuSelectGuard: (handler: () => void | Promise<void>) => (event: Event) => void;
  /** Clear the context target when the menu is not open. */
  clearContextTargetIfClosed: () => void;
  /** Reset context menu state when directory changes. */
  resetContextMenu: () => void;
};

/** Manage file system context menu state and guards. */
export function useFileSystemContextMenu({
  entries,
  selectedUris,
  onReplaceSelection,
  closeDelayMs = 200,
  selectGuardMs = 200,
}: UseFileSystemContextMenuOptions): UseFileSystemContextMenuResult {
  /** Last entry uri that opened the menu. */
  const [contextTargetUri, setContextTargetUri] = useState<string | null>(null);
  /** Snapshot of the menu target to avoid flicker. */
  const [menuTarget, setMenuTarget] = useState<FileSystemContextMenuTarget | null>(
    null
  );
  /** Snapshot entry for context menu rendering. */
  const [menuTargetEntry, setMenuTargetEntry] = useState<FileSystemEntry | null>(null);
  /** Track whether the context menu is open. */
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  /** Record the last menu open time for select guards. */
  const lastContextMenuOpenAtRef = useRef(0);
  /** Store the pending menu target clear timeout. */
  const menuTargetClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  /** Resolve the menu entry snapshot used for rendering. */
  const menuContextEntry = useMemo(() => {
    if (menuTargetEntry) return menuTargetEntry;
    if (!menuTarget || menuTarget.type !== "entry") return null;
    return entries.find((entry) => entry.uri === menuTarget.uri) ?? null;
  }, [entries, menuTarget, menuTargetEntry]);

  /** Clear any pending menu target cleanup timer. */
  const clearMenuTargetTimeout = useCallback(() => {
    if (!menuTargetClearTimeoutRef.current) return;
    clearTimeout(menuTargetClearTimeoutRef.current);
    menuTargetClearTimeoutRef.current = null;
  }, []);

  /** Set menu target snapshot from a uri. */
  const setMenuTargetFromUri = useCallback((uri: string | null) => {
    setMenuTarget(
      uri
        ? {
            type: "entry",
            uri,
          }
        : {
            type: "empty",
          }
    );
    setContextTargetUri(uri);
  }, []);

  /** Capture context menu target before menu opens. */
  const handleGridContextMenuCapture = useCallback(
    (_event: ReactMouseEvent<HTMLDivElement>, payload: FileSystemContextMenuCapturePayload) => {
      lastContextMenuOpenAtRef.current = Date.now();
      clearMenuTargetTimeout();
      const targetUri = payload.entry?.uri ?? payload.uri;
      setMenuTargetFromUri(targetUri ?? null);
      // 逻辑：缓存目标条目快照，避免目录切换时菜单内容闪动。
      const targetEntry =
        payload.entry ?? (targetUri ? entries.find((entry) => entry.uri === targetUri) : null);
      setMenuTargetEntry(targetEntry ?? null);
      if (!targetUri) return;
      if (!selectedUris.has(targetUri)) {
        onReplaceSelection([targetUri]);
      }
    },
    [
      clearMenuTargetTimeout,
      entries,
      onReplaceSelection,
      selectedUris,
      setMenuTargetFromUri,
    ]
  );

  /** Ignore menu selection triggered by the opening right-click release. */
  const shouldIgnoreMenuSelect = useCallback(
    (event: Event) => {
      const elapsed = Date.now() - lastContextMenuOpenAtRef.current;
      if (elapsed > selectGuardMs) return false;
      // 右键抬起会触发菜单项选择，这里直接拦截。
      event.preventDefault();
      return true;
    },
    [selectGuardMs]
  );

  /** Wrap menu item actions with the open-click guard. */
  const withMenuSelectGuard = useCallback(
    (handler: () => void | Promise<void>) => {
      return (event: Event) => {
        if (shouldIgnoreMenuSelect(event)) return;
        handler();
      };
    },
    [shouldIgnoreMenuSelect]
  );

  /** Track menu open changes and clean up targets. */
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        lastContextMenuOpenAtRef.current = Date.now();
        clearMenuTargetTimeout();
        if (!menuTarget) {
          setMenuTarget(
            contextTargetUri
              ? {
                  type: "entry",
                  uri: contextTargetUri,
                }
              : {
                  type: "empty",
                }
          );
        }
        setIsContextMenuOpen(true);
        return;
      }
      setIsContextMenuOpen(false);
      clearMenuTargetTimeout();
      // 关闭时延迟清理菜单目标，避免动画期间菜单内容闪动。
      menuTargetClearTimeoutRef.current = setTimeout(() => {
        setMenuTarget(null);
        setMenuTargetEntry(null);
        menuTargetClearTimeoutRef.current = null;
      }, closeDelayMs);
      setContextTargetUri(null);
    },
    [clearMenuTargetTimeout, closeDelayMs, contextTargetUri, menuTarget]
  );

  /** Clear context target when the menu is not open. */
  const clearContextTargetIfClosed = useCallback(() => {
    if (isContextMenuOpen) return;
    setContextTargetUri(null);
  }, [isContextMenuOpen]);

  /** Reset context menu state for navigation changes. */
  const resetContextMenu = useCallback(() => {
    clearMenuTargetTimeout();
    setMenuTarget(null);
    setContextTargetUri(null);
    setIsContextMenuOpen(false);
    setMenuTargetEntry(null);
  }, [clearMenuTargetTimeout]);

  useEffect(() => {
    return () => {
      clearMenuTargetTimeout();
    };
  }, [clearMenuTargetTimeout]);

  return {
    menuContextEntry,
    isContextMenuOpen,
    handleGridContextMenuCapture,
    handleContextMenuOpenChange,
    withMenuSelectGuard,
    clearContextTargetIfClosed,
    resetContextMenu,
  };
}
