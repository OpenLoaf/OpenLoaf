"use client";

import {
  memo,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import { type FileSystemEntry } from "../utils/file-system-utils";
import { FolderIcon } from "./FileSystemEntryVisual";

type FileSystemParentEntryCardProps = {
  parentEntry: FileSystemEntry;
  isSelected?: boolean;
  isDragOver?: boolean;
  onNavigate?: (nextUri: string) => void;
  onEntryDrop?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  setDragOverFolderUri: Dispatch<SetStateAction<string | null>>;
  shouldBlockPointerEvent: (event: { button?: number } | null | undefined) => boolean;
};

/** Render the parent folder entry inside the grid list. */
const FileSystemParentEntryCard = memo(function FileSystemParentEntryCard({
  parentEntry,
  isSelected = false,
  isDragOver = false,
  onNavigate,
  onEntryDrop,
  setDragOverFolderUri,
  shouldBlockPointerEvent,
}: FileSystemParentEntryCardProps) {
  return (
    <button
      type="button"
      data-flip-id={parentEntry.uri}
      className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/80 ${
        isSelected
          ? "bg-muted/70 ring-1 ring-border"
          : isDragOver
            ? "bg-muted/80 ring-1 ring-border"
            : ""
      }`}
      onDoubleClick={(event) => {
        if (shouldBlockPointerEvent(event)) return;
        if (event.button !== 0) return;
        if (event.nativeEvent.which !== 1) return;
        onNavigate?.(parentEntry.uri);
      }}
      onDragOver={(event) => {
        setDragOverFolderUri(parentEntry.uri);
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={() => {
        setDragOverFolderUri(parentEntry.uri);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setDragOverFolderUri((current) =>
          current === parentEntry.uri ? null : current
        );
      }}
      onDrop={(event) => {
        setDragOverFolderUri(null);
        onEntryDrop?.(parentEntry, event);
      }}
    >
      <FolderIcon className="h-11 w-11" showArrow />
      <span className="line-clamp-2 min-h-[2rem] w-full break-words leading-4">
        上一级
      </span>
    </button>
  );
});
FileSystemParentEntryCard.displayName = "FileSystemParentEntryCard";

export { FileSystemParentEntryCard };
