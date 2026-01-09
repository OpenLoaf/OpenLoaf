"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getDisplayFileName } from "@/lib/file-name";
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

  /** Request rename for an existing entry. */
  const requestRename = useCallback(
    (entry: FileSystemEntry) => {
      if (!allowRename(entry)) return;
      // 中文注释：重命名时同步选中当前条目。
      onSelectionReplace?.([entry.uri]);
      const displayName = getDisplayFileName(entry.name, entry.ext);
      setRenamingUri(entry.uri);
      setRenamingValue(displayName);
    },
    [allowRename, onSelectionReplace]
  );

  /** Request rename by uri/name pair, typically after creation. */
  const requestRenameByInfo = useCallback(
    (payload: { uri: string; name: string }) => {
      // 中文注释：新建后立刻进入重命名状态。
      onSelectionReplace?.([payload.uri]);
      setRenamingUri(payload.uri);
      setRenamingValue(payload.name);
    },
    [onSelectionReplace]
  );

  /** Submit rename changes with validation. */
  const handleRenamingSubmit = useCallback(async () => {
    if (!renamingUri) return;
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
    if (nextName === targetEntry.name) {
      setRenamingUri(null);
      return;
    }
    const existingNames = new Set(
      entries.filter((item) => item.uri !== targetEntry.uri).map((item) => item.name)
    );
    if (existingNames.has(nextName)) {
      toast.error("已存在同名文件或文件夹");
      return;
    }
    if (!onRename) {
      setRenamingUri(null);
      return;
    }
    const nextUri = await onRename(targetEntry, nextName);
    if (nextUri) {
      onSelectionReplace?.([nextUri]);
    }
    setRenamingUri(null);
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
