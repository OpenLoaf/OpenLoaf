"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FileSystemGitTree from "./components/FileSystemGitTree";
import type { FileSystemEntry } from "./utils/file-system-utils";
import { openFilePreview } from "@/components/file/lib/open-file";

interface FolderTreePreviewProps {
  rootUri?: string;
  /** Optional root uri for preview resolution. */
  viewerRootUri?: string;
  /** Optional kind for the initial entry. */
  currentEntryKind?: "file" | "folder";
  currentUri?: string | null;
  projectId?: string;
  projectTitle?: string;
}

/** Resolve the entry name from uri. */
function resolveEntryNameFromUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    const parts = trimmed.split("/").filter(Boolean);
    return parts.at(-1) ?? "";
  }
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts.at(-1) ?? "");
  } catch {
    return trimmed;
  }
}

/** Render a lightweight folder tree preview panel. */
export default function FolderTreePreview({
  rootUri,
  viewerRootUri,
  currentEntryKind,
  currentUri,
  projectId,
  projectTitle,
}: FolderTreePreviewProps) {
  const [selectedUris, setSelectedUris] = useState<Set<string>>(() => {
    const initial = currentUri?.trim();
    return initial ? new Set([initial]) : new Set();
  });
  const [selectedEntry, setSelectedEntry] = useState<FileSystemEntry | null>(() => {
    const initial = currentUri?.trim();
    if (!initial) return null;
    return {
      uri: initial,
      name: resolveEntryNameFromUri(initial),
      kind: currentEntryKind ?? "folder",
    };
  });

  useEffect(() => {
    const initial = currentUri?.trim();
    setSelectedUris(initial ? new Set([initial]) : new Set());
    setSelectedEntry(
      initial
        ? {
            uri: initial,
            name: resolveEntryNameFromUri(initial),
            kind: currentEntryKind ?? "folder",
          }
        : null
    );
  }, [currentEntryKind, currentUri, rootUri]);

  const handleSelectEntry = useCallback((entry: FileSystemEntry) => {
    // 中文注释：点击条目时更新高亮与预览内容。
    setSelectedUris(new Set([entry.uri]));
    setSelectedEntry(entry);
  }, []);

  const viewer = useMemo(() => {
    if (!selectedEntry) {
      return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
    }
    const effectiveViewerRootUri = viewerRootUri ?? rootUri;
    // 逻辑：文件树单击使用统一预览入口的嵌入模式。
    const content = openFilePreview({
      entry: selectedEntry,
      projectId,
      rootUri: effectiveViewerRootUri,
      readOnly: true,
      mode: "embed",
    });
    if (!content || typeof content === "boolean") {
      return <div className="h-full w-full p-4 text-muted-foreground">无法预览</div>;
    }
    return <>{content}</>;
  }, [projectId, rootUri, selectedEntry, viewerRootUri]);

  if (!rootUri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未找到目录</div>;
  }

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0">
        <div className="flex w-72 min-w-[220px] flex-col border-r border-border/70">
          <div className="flex-1 min-h-0 overflow-auto p-2">
            <FileSystemGitTree
              rootUri={rootUri}
              projectId={projectId}
              projectTitle={projectTitle}
              currentUri={currentUri}
              selectedUris={selectedUris}
              showHidden={false}
              sortField="name"
              sortOrder="asc"
              onSelectEntry={handleSelectEntry}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          <div className="h-full w-full">{viewer}</div>
        </div>
      </div>
    </div>
  );
}
