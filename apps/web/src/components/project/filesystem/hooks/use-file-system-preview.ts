/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type FileSystemEntry,
  formatSize,
  formatTimestamp,
} from "../utils/file-system-utils";

export type FileSystemPreviewState = {
  /** Resolved preview entry. */
  previewEntry: FileSystemEntry | null;
  /** Explicit preview uri set by click. */
  previewUri: string | null;
  /** Update preview uri; use null to clear. */
  setPreviewUri: (uri: string | null) => void;
  /** Display label for preview entry. */
  previewDisplayName: string;
  /** Type label for preview entry. */
  previewTypeLabel: string;
  /** Size label for preview entry. */
  previewSizeLabel: string;
  /** Created time label for preview entry. */
  previewCreatedLabel: string;
  /** Updated time label for preview entry. */
  previewUpdatedLabel: string;
};

export type UseFileSystemPreviewOptions = {
  /** Entries used to resolve preview. */
  entries: FileSystemEntry[];
  /** Selection for fallback preview. */
  selectedUris?: Set<string>;
  /** Resolve display name for preview entry. */
  resolveDisplayName: (entry: FileSystemEntry) => string;
  /** Resolve type label for preview entry. */
  resolveTypeLabel: (entry: FileSystemEntry) => string;
};

/** Build preview state for file system views. */
export function useFileSystemPreview({
  entries,
  selectedUris,
  resolveDisplayName,
  resolveTypeLabel,
}: UseFileSystemPreviewOptions): FileSystemPreviewState {
  const entryByUri = useMemo(
    () => new Map(entries.map((entry) => [entry.uri, entry])),
    [entries]
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const fallbackPreviewUri = useMemo(() => {
    // 逻辑：仅在单选且为文件时回退到选中项预览。
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
    // 逻辑：预览条目移除后清空，避免引用失效。
    if (!previewUri) return;
    if (entryByUri.has(previewUri)) return;
    setPreviewUri(null);
  }, [entryByUri, previewUri]);

  const previewDisplayName = useMemo(
    () => (previewEntry ? resolveDisplayName(previewEntry) : ""),
    [previewEntry, resolveDisplayName]
  );
  const previewTypeLabel = useMemo(
    () => (previewEntry ? resolveTypeLabel(previewEntry) : ""),
    [previewEntry, resolveTypeLabel]
  );
  const previewSizeLabel = useMemo(
    () =>
      previewEntry && previewEntry.kind === "file"
        ? formatSize(previewEntry.size)
        : "--",
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

  return {
    previewEntry,
    previewUri,
    setPreviewUri,
    previewDisplayName,
    previewTypeLabel,
    previewSizeLabel,
    previewCreatedLabel,
    previewUpdatedLabel,
  };
}
