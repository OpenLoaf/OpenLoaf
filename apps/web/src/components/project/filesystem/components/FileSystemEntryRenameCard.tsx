"use client";

import { memo, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
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
      className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground transition-colors ring-1 ring-border/40 bg-muted/30 shadow-sm ${
        isSelected ? "bg-muted/60 ring-border/70" : ""
      }`}
    >
      {visual}
      <Input
        value={renamingValue ?? displayName}
        onChange={(event) => onRenamingChange?.(event.target.value)}
        className="h-6 px-2 py-0 text-center text-[11px] leading-4 bg-background/80 shadow-none md:text-[11px]"
        autoFocus
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
