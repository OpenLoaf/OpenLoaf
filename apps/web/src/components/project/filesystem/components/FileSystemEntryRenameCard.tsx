/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { memo, useMemo } from "react";
import { Input } from "@openloaf/ui/input";
import {
  getBoardDisplayName,
  getDocDisplayName,
  getDisplayFileName,
  isBoardFolderName,
  isDocFolderName,
} from "@/lib/file-name";
import { getEntryVisual } from "./FileSystemEntryVisual";
import { type FileSystemEntry } from "../utils/file-system-utils";

type FileSystemEntryRenameCardProps = {
  entry: FileSystemEntry;
  thumbnailSrc?: string;
  isSelected?: boolean;
  entryRef?: (node: HTMLDivElement | null) => void;
  renamingValue?: string;
  onRenamingChange?: (value: string) => void;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
};

/** Render a rename card for a file system entry. */
const FileSystemEntryRenameCard = memo(function FileSystemEntryRenameCard({
  entry,
  thumbnailSrc,
  isSelected = false,
  entryRef,
  renamingValue,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
}: FileSystemEntryRenameCardProps) {
  const displayName = useMemo(() => {
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
  }, [entry.ext, entry.kind, entry.name]);
  const visual = getEntryVisual({
    kind: entry.kind,
    name: entry.name,
    ext: entry.ext,
    isEmpty: entry.isEmpty,
    thumbnailSrc,
  });

  return (
    <div
      data-entry-card="true"
      data-entry-uri={entry.uri}
      data-flip-id={entry.uri}
      ref={entryRef}
      className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground ${
        isSelected ? "bg-muted/70 ring-1 ring-border" : ""
      }`}
    >
      {visual}
      <Input
        value={renamingValue ?? displayName}
        onChange={(event) => onRenamingChange?.(event.target.value)}
        className="h-6 px-2 py-0 text-center text-xs leading-4 shadow-none md:text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.stopPropagation();
            return;
          }
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
  );
});
FileSystemEntryRenameCard.displayName = "FileSystemEntryRenameCard";

export { FileSystemEntryRenameCard };
