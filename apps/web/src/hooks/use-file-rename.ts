"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ensureBoardFolderName,
  ensureDocFolderName,
  getBoardDisplayName,
  getDocDisplayName,
  getDisplayFileName,
  isBoardFolderName,
  isDocFolderName,
} from "@/lib/file-name";
import type { FileSystemEntry } from "@/components/project/filesystem/utils/file-system-utils";

type UseFileRenameArgs = {
  /** Entries used for rename validation and lookup. */
  entries: FileSystemEntry[];
  /** Optional guard to allow rename for specific entries. */
  allowRename?: (entry: FileSystemEntry) => boolean;
  /** Rename handler that performs the actual rename operation. */
  onRename?: (entry: FileSystemEntry, nextName: string) => Promise<string | null | void>;
  /** Optional selection updater after rename. */
  onSelectionReplace?: (uris: string[]) => void;
};

/** Manage rename state for file system entries. */
export function useFileRename({
  entries,
  allowRename = () => true,
  onRename,
  onSelectionReplace,
}: UseFileRenameArgs) {
  /** Current uri being renamed. */
  const [renamingUri, setRenamingUri] = useState<string | null>(null);
  /** Current rename input value. */
  const [renamingValue, setRenamingValue] = useState("");
  /** 防止 blur 与 Enter 重复触发提交。 */
  const isSubmittingRef = useRef(false);

  /** Resolve display name for rename input. */
  const resolveRenameDisplayName = useCallback((entry: FileSystemEntry) => {
    if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
      return getBoardDisplayName(entry.name);
    }
    if (entry.kind === "folder" && isDocFolderName(entry.name)) {
      return getDocDisplayName(entry.name);
    }
    if (entry.kind === "file") {
      return getDisplayFileName(entry.name, entry.ext);
    }
    return entry.name;
  }, []);

  /** Request rename for an existing entry. */
  const requestRename = useCallback(
    (entry: FileSystemEntry) => {
      if (!allowRename(entry)) return;
      // 中文注释：重命名时同步选中当前条目。
      onSelectionReplace?.([entry.uri]);
      const displayName = resolveRenameDisplayName(entry);
      setRenamingUri(entry.uri);
      setRenamingValue(displayName);
    },
    [allowRename, onSelectionReplace, resolveRenameDisplayName]
  );

  /** Request rename by uri/name pair, typically after creation. */
  const requestRenameByInfo = useCallback(
    (payload: { uri: string; name: string }) => {
      // 中文注释：新建后立刻进入重命名状态。
      onSelectionReplace?.([payload.uri]);
      setRenamingUri(payload.uri);
      const displayName = isBoardFolderName(payload.name)
        ? getBoardDisplayName(payload.name)
        : isDocFolderName(payload.name)
          ? getDocDisplayName(payload.name)
          : payload.name;
      setRenamingValue(displayName);
    },
    [onSelectionReplace]
  );

  /** Submit rename changes with validation. */
  const handleRenamingSubmit = useCallback(async () => {
    if (!renamingUri) return;
    if (isSubmittingRef.current) return;
    const targetEntry = entries.find((item) => item.uri === renamingUri);
    if (!targetEntry) {
      setRenamingUri(null);
      return;
    }
    const nextName = renamingValue.trim();
    if (!nextName) {
      setRenamingUri(null);
      return;
    }
    const normalizedName =
      targetEntry.kind === "folder" && isBoardFolderName(targetEntry.name)
        ? ensureBoardFolderName(nextName)
        : targetEntry.kind === "folder" && isDocFolderName(targetEntry.name)
          ? ensureDocFolderName(nextName)
          : nextName;
    if (normalizedName === targetEntry.name) {
      setRenamingUri(null);
      return;
    }
    const existingNames = new Set(
      entries.filter((item) => item.uri !== targetEntry.uri).map((item) => item.name)
    );
    if (existingNames.has(normalizedName)) {
      toast.error("已存在同名文件或文件夹");
      return;
    }
    if (!onRename) {
      setRenamingUri(null);
      return;
    }
    isSubmittingRef.current = true;
    try {
      const nextUri = await onRename(targetEntry, normalizedName);
      if (nextUri) {
        onSelectionReplace?.([nextUri]);
      }
      setRenamingUri(null);
    } finally {
      // 中文注释：确保异常也释放提交锁，避免后续无法重命名。
      isSubmittingRef.current = false;
    }
  }, [entries, onRename, onSelectionReplace, renamingUri, renamingValue]);

  /** Cancel rename editing. */
  const handleRenamingCancel = useCallback(() => {
    setRenamingUri(null);
  }, []);

  return {
    renamingUri,
    renamingValue,
    setRenamingValue,
    requestRename,
    requestRenameByInfo,
    handleRenamingSubmit,
    handleRenamingCancel,
  };
}
