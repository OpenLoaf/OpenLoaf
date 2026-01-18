# File System Preview Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make list view preview behavior match columns view and share preview logic/UI across both.

**Architecture:** Extract shared preview state into a hook and shared preview UI into a panel/stack component. Columns and list views both consume the hook and render the shared preview panel; list view manages its own scroll area so the preview panel stays fixed.

**Tech Stack:** React 19, TanStack Query, Next.js, tRPC.

> Note: User requested no automated tests. Test steps are included but marked SKIPPED.

### Task 1: Shared preview hook

**Files:**
- Create: `apps/web/src/components/project/filesystem/hooks/use-file-system-preview.ts`

**Step 1: Write the failing test**

SKIPPED (user requested no tests).

**Step 2: Run test to verify it fails**

SKIPPED (user requested no tests).

**Step 3: Write minimal implementation**

```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  type FileSystemEntry,
  formatSize,
  formatTimestamp,
  getEntryExt,
} from "../utils/file-system-utils";
import { IMAGE_EXTS, PDF_EXTS, getEntryVisual } from "../components/FileSystemEntryVisual";

export type FileSystemPreviewState = {
  previewEntry: FileSystemEntry | null;
  previewUri: string | null;
  setPreviewUri: (uri: string | null) => void;
  isPreviewImage: boolean;
  isPreviewPdf: boolean;
  isPreviewLoading: boolean;
  previewSrc: string;
  previewDisplayName: string;
  previewTypeLabel: string;
  previewSizeLabel: string;
  previewCreatedLabel: string;
  previewUpdatedLabel: string;
  previewVisual: React.ReactNode | null;
};

export type UseFileSystemPreviewOptions = {
  entries: FileSystemEntry[];
  selectedUris?: Set<string>;
  projectId?: string;
  resolveDisplayName: (entry: FileSystemEntry) => string;
  resolveTypeLabel: (entry: FileSystemEntry) => string;
};

/** Build preview state for file system views. */
export function useFileSystemPreview({
  entries,
  selectedUris,
  projectId,
  resolveDisplayName,
  resolveTypeLabel,
}: UseFileSystemPreviewOptions): FileSystemPreviewState {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const entryByUri = useMemo(
    () => new Map(entries.map((entry) => [entry.uri, entry])),
    [entries]
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const fallbackPreviewUri = useMemo(() => {
    if (!selectedUris || selectedUris.size !== 1) return null;
    const uri = selectedUris.values().next().value;
    if (!uri) return null;
    const entry = entryByUri.get(uri);
    if (!entry || entry.kind !== "file") return null;
    return entry.uri;
  }, [entryByUri, selectedUris]);

  const previewEntry = useMemo(() => {
    const uri = previewUri ?? fallbackPreviewUri;
    if (!uri) return null;
    const entry = entryByUri.get(uri);
    if (!entry || entry.kind !== "file") return null;
    return entry;
  }, [entryByUri, fallbackPreviewUri, previewUri]);

  useEffect(() => {
    if (!previewUri) return;
    if (entryByUri.has(previewUri)) return;
    setPreviewUri(null);
  }, [entryByUri, previewUri]);

  const previewExt = useMemo(
    () => (previewEntry ? getEntryExt(previewEntry) : ""),
    [previewEntry]
  );
  const isPreviewImage = previewEntry ? IMAGE_EXTS.has(previewExt) : false;
  const isPreviewPdf = previewEntry ? PDF_EXTS.has(previewExt) : false;
  const shouldLoadPreview = Boolean(previewEntry) && (isPreviewImage || isPreviewPdf);

  const previewQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({
      workspaceId,
      projectId,
      uri: previewEntry?.uri ?? "",
    }),
    enabled: shouldLoadPreview && Boolean(workspaceId),
  });

  const previewSrc = useMemo(() => {
    if (!previewEntry) return "";
    const payload = previewQuery.data;
    if (!payload?.contentBase64) return "";
    if (isPreviewImage) {
      const mime = payload.mime || "image/*";
      return `data:${mime};base64,${payload.contentBase64}`;
    }
    if (isPreviewPdf) {
      return `data:application/pdf;base64,${payload.contentBase64}`;
    }
    return "";
  }, [isPreviewImage, isPreviewPdf, previewEntry, previewQuery.data]);

  const previewDisplayName = useMemo(
    () => (previewEntry ? resolveDisplayName(previewEntry) : ""),
    [previewEntry, resolveDisplayName]
  );
  const previewTypeLabel = useMemo(
    () => (previewEntry ? resolveTypeLabel(previewEntry) : ""),
    [previewEntry, resolveTypeLabel]
  );
  const previewSizeLabel = useMemo(
    () => (previewEntry ? formatSize(previewEntry.size) : "--"),
    [previewEntry]
  );
  const previewCreatedLabel = useMemo(
    () => (previewEntry ? formatTimestamp(previewEntry.createdAt) : "--"),
    [previewEntry]
  );
  const previewUpdatedLabel = useMemo(
    () => (previewEntry ? formatTimestamp(previewEntry.updatedAt) : "--"),
    [previewEntry]
  );
  const previewVisual = useMemo(() => {
    if (!previewEntry) return null;
    return getEntryVisual({
      kind: previewEntry.kind,
      name: previewEntry.name,
      ext: previewEntry.ext,
      isEmpty: previewEntry.isEmpty,
      sizeClassName: "h-16 w-16",
      thumbnailIconClassName: "h-full w-full p-3 text-muted-foreground",
    });
  }, [previewEntry]);

  return {
    previewEntry,
    previewUri,
    setPreviewUri,
    isPreviewImage,
    isPreviewPdf,
    isPreviewLoading: previewQuery.isLoading,
    previewSrc,
    previewDisplayName,
    previewTypeLabel,
    previewSizeLabel,
    previewCreatedLabel,
    previewUpdatedLabel,
    previewVisual,
  };
}
```

**Step 4: Run test to verify it passes**

SKIPPED (user requested no tests).

**Step 5: Commit**

SKIPPED.

### Task 2: Shared preview UI components

**Files:**
- Create: `apps/web/src/components/project/filesystem/components/FileSystemPreviewPanel.tsx`
- Create: `apps/web/src/components/project/filesystem/components/FileSystemPreviewStack.tsx`

**Step 1: Write the failing test**

SKIPPED (user requested no tests).

**Step 2: Run test to verify it fails**

SKIPPED (user requested no tests).

**Step 3: Write minimal implementation**

```tsx
"use client";

import { memo, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import type { FileSystemEntry } from "../utils/file-system-utils";

export type FileSystemPreviewPanelProps = {
  previewEntry: FileSystemEntry | null;
  isPreviewImage: boolean;
  isPreviewPdf: boolean;
  isLoading: boolean;
  previewSrc: string;
  previewDisplayName: string;
  previewTypeLabel: string;
  previewSizeLabel: string;
  previewCreatedLabel: string;
  previewUpdatedLabel: string;
  previewVisual: ReactNode | null;
  onContextMenuCapture?: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

/** Render the shared file preview panel. */
const FileSystemPreviewPanel = memo(function FileSystemPreviewPanel({
  previewEntry,
  isPreviewImage,
  isPreviewPdf,
  isLoading,
  previewSrc,
  previewDisplayName,
  previewTypeLabel,
  previewSizeLabel,
  previewCreatedLabel,
  previewUpdatedLabel,
  previewVisual,
  onContextMenuCapture,
}: FileSystemPreviewPanelProps) {
  if (!previewEntry) return null;

  return (
    <div
      className="flex h-full min-w-[320px] flex-1 flex-col border-l border-border/70 bg-background/95"
      onContextMenuCapture={onContextMenuCapture}
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30">
          {isPreviewImage || isPreviewPdf ? (
            isLoading ? (
              <div className="text-xs text-muted-foreground">预览加载中...</div>
            ) : previewSrc ? (
              isPreviewImage ? (
                <img
                  src={previewSrc}
                  alt={previewDisplayName}
                  className="h-full w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <iframe
                  title={previewDisplayName}
                  src={previewSrc}
                  className="h-full w-full"
                />
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                {previewVisual}
                <span>预览失败</span>
              </div>
            )
          ) : (
            previewVisual
          )}
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
```

```tsx
"use client";

import { memo, type CSSProperties, type ReactNode } from "react";

export type FileSystemPreviewStackProps = {
  content: ReactNode;
  preview: ReactNode | null;
  overlay?: ReactNode;
  className?: string;
  contentClassName?: string;
  contentStyle?: CSSProperties;
};

/** Layout container for list/column preview stacks. */
const FileSystemPreviewStack = memo(function FileSystemPreviewStack({
  content,
  preview,
  overlay,
  className,
  contentClassName,
  contentStyle,
}: FileSystemPreviewStackProps) {
  return (
    <div className={`relative flex min-h-full h-full overflow-hidden ${className ?? ""}`}>
      {overlay}
      <div
        className={`min-h-full h-full min-w-0 ${contentClassName ?? ""}`}
        style={contentStyle}
      >
        {content}
      </div>
      {preview}
    </div>
  );
});

FileSystemPreviewStack.displayName = "FileSystemPreviewStack";

export { FileSystemPreviewStack };
```

**Step 4: Run test to verify it passes**

SKIPPED (user requested no tests).

**Step 5: Commit**

SKIPPED.

### Task 3: Update columns view to use shared preview

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemColumns.tsx`

**Step 1: Write the failing test**

SKIPPED (user requested no tests).

**Step 2: Run test to verify it fails**

SKIPPED (user requested no tests).

**Step 3: Write minimal implementation**

- Replace local preview state/query with `useFileSystemPreview`.
- Render `FileSystemPreviewPanel` and wrap layout with `FileSystemPreviewStack`.
- Keep preview context menu behavior intact.

**Step 4: Run test to verify it passes**

SKIPPED (user requested no tests).

**Step 5: Commit**

SKIPPED.

### Task 4: Update list view to use shared preview

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemList.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx`

**Step 1: Write the failing test**

SKIPPED (user requested no tests).

**Step 2: Run test to verify it fails**

SKIPPED (user requested no tests).

**Step 3: Write minimal implementation**

- Add `useFileSystemPreview` and `FileSystemPreviewPanel` to list view.
- Set preview on primary click without modifiers, clear on folder selection.
- Add preview context menu capture.
- Wrap list layout with `FileSystemPreviewStack` and move scroll into list component.
- Update `ProjectFileSystem` list container to `overflow-hidden` and remove padding so preview stays fixed.

**Step 4: Run test to verify it passes**

SKIPPED (user requested no tests).

**Step 5: Commit**

SKIPPED.
