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

import {
  forwardRef,
  memo,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { getEntryVisual } from "./FileSystemEntryVisual";
import { FileSystemEntryName } from "./FileSystemEntryName";
import { type FileSystemEntry } from "../utils/file-system-utils";

type FileSystemEntryCardProps = {
  uri: string;
  name: string;
  kind: FileSystemEntry["kind"];
  ext?: string;
  isEmpty?: boolean;
  /** Thumbnail data url for image entries. */
  thumbnailSrc?: string;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isSelected?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragEnter?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  /** Whether the entry is disabled for selection. */
  isDisabled?: boolean;
};

/** Render a single file system entry card. */
const FileSystemEntryCard = memo(
  forwardRef<HTMLButtonElement, FileSystemEntryCardProps>(
    function FileSystemEntryCard(
      {
        uri,
        name,
        kind,
        ext,
        isEmpty,
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
        isDisabled = false,
      },
      ref
    ) {
      const visual = getEntryVisual({ kind, name, ext, isEmpty, thumbnailSrc });
      return (
        <button
          ref={ref}
          type="button"
          data-entry-card="true"
          data-entry-uri={uri}
          data-flip-id={uri}
          className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground ${
            isDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/80"
          } ${isSelected ? "bg-muted/70 ring-1 ring-border" : ""} ${
            isDragOver ? "bg-muted/80 ring-1 ring-border" : ""
          }`}
          draggable={!isDisabled}
          aria-disabled={isDisabled}
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
          <FileSystemEntryName name={name} kind={kind} ext={ext} />
        </button>
      );
    }
  )
);
FileSystemEntryCard.displayName = "FileSystemEntryCard";

export { FileSystemEntryCard };
