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

import { memo, type MouseEvent as ReactMouseEvent } from "react";
import type { FileSystemEntry } from "../utils/file-system-utils";
import { FileSystemEntryPreviewContent } from "./FileSystemEntryPreviewContent";

export type FileSystemPreviewPanelProps = {
  /** Preview entry to render. */
  previewEntry: FileSystemEntry | null;
  /** Project id for preview content. */
  projectId?: string;
  /** Root uri for preview content. */
  rootUri?: string;
  /** Display name for preview entry. */
  previewDisplayName: string;
  /** Type label for preview entry. */
  previewTypeLabel: string;
  /** Size label for preview entry. */
  previewSizeLabel: string;
  /** Created time label for preview entry. */
  previewCreatedLabel: string;
  /** Updated time label for preview entry. */
  previewUpdatedLabel: string;
  /** Context menu handler for preview panel. */
  onContextMenuCapture?: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

/** Render the shared file preview panel. */
const FileSystemPreviewPanel = memo(function FileSystemPreviewPanel({
  previewEntry,
  projectId,
  rootUri,
  previewDisplayName,
  previewTypeLabel,
  previewSizeLabel,
  previewCreatedLabel,
  previewUpdatedLabel,
  onContextMenuCapture,
}: FileSystemPreviewPanelProps) {
  if (!previewEntry) return null;

  return (
    <div
      className="flex h-full min-w-[320px] flex-1 flex-col border-l border-border/70 bg-background/95"
      onContextMenuCapture={onContextMenuCapture}
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 items-stretch justify-stretch overflow-hidden rounded-md border border-border/70 bg-muted/30">
          <FileSystemEntryPreviewContent
            entry={previewEntry}
            rootUri={rootUri}
            projectId={projectId}
            readOnly
          />
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-2 text-xs">
          <div className="text-muted-foreground">文件名</div>
          <div className="break-all text-foreground">{previewDisplayName}</div>
          <div className="text-muted-foreground">文件类型</div>
          <div className="break-all text-foreground">{previewTypeLabel}</div>
          <div className="text-muted-foreground">大小</div>
          <div className="break-all text-foreground">{previewSizeLabel}</div>
          <div className="text-muted-foreground">创建时间</div>
          <div className="break-all text-foreground">{previewCreatedLabel}</div>
          <div className="text-muted-foreground">修改时间</div>
          <div className="break-all text-foreground">{previewUpdatedLabel}</div>
        </div>
      </div>
    </div>
  );
});

FileSystemPreviewPanel.displayName = "FileSystemPreviewPanel";

export { FileSystemPreviewPanel };
