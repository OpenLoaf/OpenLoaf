"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Input } from "@tenas-ai/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import {
  getBoardDisplayName,
  getDocDisplayName,
  getDisplayFileName,
  isBoardFolderName,
  isDocFolderName,
} from "@/lib/file-name";
import {
  IGNORE_NAMES,
  buildChildUri,
  getEntryExt,
  getRelativePathFromUri,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import { sortEntriesByType } from "../utils/entry-sort";
import { getEntryVisual } from "./FileSystemEntryVisual";
import { useFileSystemDrag } from "../hooks/use-file-system-drag";
import { useFolderThumbnails } from "../hooks/use-folder-thumbnails";
import { useWorkspace } from "@/components/workspace/workspaceContext";

type FileSystemGitTreeProps = {
  /** Project root uri. */
  rootUri: string;
  /** Project id for scoped file system queries. */
  projectId?: string;
  /** Optional project title for root display. */
  projectTitle?: string;
  /** Current folder uri used for auto expansion. */
  currentUri?: string | null;
  /** Selected entry uris. */
  selectedUris: Set<string>;
  /** Whether to show hidden entries. */
  showHidden: boolean;
  /** Sort field for list queries. */
  sortField: "name" | "mtime" | null;
  /** Sort order for list queries. */
  sortOrder: "asc" | "desc" | null;
  /** Current entry uri in rename mode. */
  renamingUri?: string | null;
  /** Current rename input value. */
  renamingValue?: string;
  /** Update rename input value. */
  onRenamingChange?: (value: string) => void;
  /** Submit rename changes. */
  onRenamingSubmit?: () => void;
  /** Cancel rename mode. */
  onRenamingCancel?: () => void;
  /** Select an entry in the tree. */
  onSelectEntry: (entry: FileSystemEntry) => void;
  /** Open an entry in embedded preview. */
  onOpenEntry?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Open an entry in stack preview. */
  onOpenEntryStack?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Capture context menu target before opening. */
  onContextMenuCapture?: (
    event: ReactMouseEvent<HTMLDivElement>,
    payload: { uri: string | null; entry?: FileSystemEntry | null }
  ) => void;
  /** Drag project id used for external payloads. */
  dragProjectId?: string;
  /** Drag root uri used for external payloads. */
  dragRootUri?: string;
  /** Triggered when a drag starts. */
  onEntryDragStart?: (
    entries: FileSystemEntry[],
    event: ReactDragEvent<HTMLElement>
  ) => void;
  /** Triggered when dropping onto a folder. */
  onEntryDrop?: (
    entry: FileSystemEntry,
    event: ReactDragEvent<HTMLElement>
  ) => void;
};

type GitTreeNode = {
  /** Raw filesystem entry. */
  entry: FileSystemEntry;
  /** Display label for the node. */
  label: string;
  /** Thumbnail data url for image entries. */
  thumbnailSrc?: string;
  /** Whether the node can expand. */
  isFolder: boolean;
  /** Whether the node is a board folder. */
  isBoardFolder: boolean;
  /** Whether this node is the root. */
  isRoot?: boolean;
};

type FileSystemGitTreeNodeProps = {
  /** Node data. */
  node: GitTreeNode;
  /** Project id for scoped file system queries. */
  projectId?: string;
  /** Root uri for local integrations. */
  rootUri?: string;
  /** Depth in the tree. */
  depth: number;
  /** Expanded state map. */
  expandedNodes: Record<string, boolean>;
  /** Drag-over target uri. */
  dragOverFolderUri: string | null;
  /** Toggle expansion. */
  onToggle: (uri: string, nextOpen: boolean) => void;
  /** Select entry callback. */
  onSelectEntry: (entry: FileSystemEntry) => void;
  /** Open entry in embedded preview. */
  onOpenEntry?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Open entry in stack preview. */
  onOpenEntryStack?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Selected entry set. */
  selectedUris: Set<string>;
  /** Whether to include hidden entries. */
  showHidden: boolean;
  /** Sort field for list queries. */
  sortField: "name" | "mtime" | null;
  /** Sort order for list queries. */
  sortOrder: "asc" | "desc" | null;
  /** Entry uri under rename. */
  renamingUri?: string | null;
  /** Rename input value. */
  renamingValue?: string;
  /** Rename input change handler. */
  onRenamingChange?: (value: string) => void;
  /** Rename submit handler. */
  onRenamingSubmit?: () => void;
  /** Rename cancel handler. */
  onRenamingCancel?: () => void;
  /** Register entry for drag operations. */
  registerEntry: (entry: FileSystemEntry) => () => void;
  /** Drag start handler. */
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  /** Drag over handler. */
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  /** Drag enter handler. */
  onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  /** Drag leave handler. */
  onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  /** Drop handler. */
  onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  /** Block pointer events after a context menu trigger. */
  shouldBlockPointerEvent: (
    event: { button?: number } | null | undefined
  ) => boolean;
  /** Context menu capture handler. */
  onContextMenuCapture?: (
    event: ReactMouseEvent<HTMLDivElement>,
    payload: { uri: string | null; entry?: FileSystemEntry | null }
  ) => void;
};

/** Check whether the entry is a board folder. */
const isBoardFolderEntry = (entry: FileSystemEntry) =>
  entry.kind === "folder" && isBoardFolderName(entry.name);
/** Resolve the display label for a filesystem entry. */
function resolveEntryLabel(entry: FileSystemEntry): string {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "folder" && isDocFolderName(entry.name)) {
    return getDocDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Resolve the display label for the root node. */
function resolveRootLabel(rootUri: string, projectTitle?: string): string {
  const trimmedTitle = projectTitle?.trim();
  if (trimmedTitle) return trimmedTitle;
  const trimmedRoot = rootUri.trim();
  if (!trimmedRoot) return "Project";
  if (!trimmedRoot.startsWith("file://")) {
    const parts = trimmedRoot.split("/").filter(Boolean);
    return decodeURIComponent(parts.at(-1) ?? "Project");
  }
  try {
    const url = new URL(trimmedRoot);
    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts.at(-1) ?? "Project");
  } catch {
    return "Project";
  }
}

/** Build a tree node from a filesystem entry. */
function buildTreeNode(entry: FileSystemEntry, thumbnailSrc?: string): GitTreeNode {
  const isBoardFolder = entry.kind === "folder" && isBoardFolderName(entry.name);
  return {
    entry,
    label: resolveEntryLabel(entry),
    thumbnailSrc,
    isFolder: entry.kind === "folder" && !isBoardFolder,
    isBoardFolder,
  };
}

/** Build ancestor uris from root to target. */
function buildAncestorUris(rootUri: string, targetUri: string): string[] {
  const rootRelative = getRelativePathFromUri(rootUri, rootUri);
  const targetRelative = getRelativePathFromUri(rootUri, targetUri);
  if (!targetRelative) return [];
  const rootParts = rootRelative ? rootRelative.split("/").filter(Boolean) : [];
  const targetParts = targetRelative.split("/").filter(Boolean);
  const relativeParts = targetParts.slice(rootParts.length);
  const uris: string[] = [];
  let cursor = rootRelative;
  // 逻辑：逐级拼接路径，保证树节点能按层级展开。
  for (const part of relativeParts) {
    cursor = buildChildUri(cursor, part);
    uris.push(cursor);
  }
  return uris;
}

/** Render a single tree node with lazy-loaded children. */
const FileSystemGitTreeNode = memo(function FileSystemGitTreeNode({
  node,
  depth,
  expandedNodes,
  dragOverFolderUri,
  onToggle,
  onSelectEntry,
  onOpenEntry,
  onOpenEntryStack,
  selectedUris,
  showHidden,
  sortField,
  sortOrder,
  projectId,
  rootUri,
  renamingUri,
  renamingValue,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
  registerEntry,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  shouldBlockPointerEvent,
  onContextMenuCapture,
}: FileSystemGitTreeNodeProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const isExpanded = expandedNodes[node.entry.uri] ?? false;
  const isSelected = selectedUris.has(node.entry.uri);
  const canExpand = node.isFolder && node.entry.isEmpty !== true;
  const isRenaming = renamingUri === node.entry.uri;
  const isDragOver = node.isFolder && dragOverFolderUri === node.entry.uri;
  const shouldFetchChildren = node.isFolder && isExpanded && canExpand;
  // 逻辑：根目录节点不渲染行，只展示其子项。
  const shouldRenderRow = !node.isRoot;
  // 逻辑：仅在展开时拉取子目录，避免深层目录导致请求爆炸。
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      shouldFetchChildren && workspaceId
        ? {
            workspaceId,
            projectId,
            uri: node.entry.uri,
            includeHidden: showHidden,
            sort:
              sortField && sortOrder
                ? { field: sortField, order: sortOrder }
                : undefined,
          }
        : skipToken
    )
  );
  const { thumbnailByUri } = useFolderThumbnails({
    currentUri: shouldFetchChildren ? node.entry.uri : null,
    includeHidden: showHidden,
    projectId,
  });
  const childNodes = useMemo(() => {
    const entries = listQuery.data?.entries ?? [];
    const visibleEntries = showHidden
      ? entries
      : entries.filter((entry) => !IGNORE_NAMES.has(entry.name));
    const sortedEntries = sortEntriesByType(visibleEntries as FileSystemEntry[]);
    // 逻辑：子节点缩略图来自当前目录的缩略图映射。
    return sortedEntries.map((entry) =>
      buildTreeNode(entry, thumbnailByUri.get(entry.uri))
    );
  }, [listQuery.data?.entries, showHidden, thumbnailByUri]);
  const childDepth = node.isRoot ? depth : depth + 1;

  const visual = useMemo(
    () =>
      getEntryVisual({
        kind: node.entry.kind,
        name: node.entry.name,
        ext: node.entry.ext,
        isEmpty: node.entry.isEmpty,
        thumbnailSrc: node.thumbnailSrc,
        sizeClassName: "h-4 w-4",
        thumbnailIconClassName: "h-full w-full p-0.5 text-muted-foreground",
      }),
    [
      node.entry.ext,
      node.entry.isEmpty,
      node.entry.kind,
      node.entry.name,
      node.thumbnailSrc,
    ]
  );

  useEffect(() => {
    return registerEntry(node.entry);
  }, [node.entry, registerEntry]);

  /** Handle selection and expand/collapse for a tree row. */
  const handleRowClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      onSelectEntry(node.entry);
      onOpenEntry?.(node.entry, node.thumbnailSrc);
      if (!node.isFolder) return;
      if (!canExpand) return;
      onToggle(node.entry.uri, !isExpanded);
    },
    [
      canExpand,
      isExpanded,
      node.entry,
      node.isFolder,
      node.thumbnailSrc,
      onOpenEntry,
      onSelectEntry,
      onToggle,
      shouldBlockPointerEvent,
    ]
  );

  /** Handle double click for stack preview. */
  const handleRowDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (shouldBlockPointerEvent(event)) return;
      if (event.button !== 0) return;
      if (event.nativeEvent?.which && event.nativeEvent.which !== 1) return;
      onOpenEntryStack?.(node.entry, node.thumbnailSrc);
    },
    [node.entry, node.thumbnailSrc, onOpenEntryStack, shouldBlockPointerEvent]
  );

  /** Handle drag start for a tree row. */
  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (node.isRoot || isRenaming) {
        event.preventDefault();
        return;
      }
      onDragStart(event);
    },
    [isRenaming, node.isRoot, onDragStart]
  );

  /** Capture context menu target for a tree row. */
  const handleContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      onSelectEntry(node.entry);
      onContextMenuCapture?.(event, { uri: node.entry.uri, entry: node.entry });
    },
    [node.entry, onContextMenuCapture, onSelectEntry]
  );

  return (
    <div className="select-none">
      {shouldRenderRow ? (
        <div
          role="button"
          tabIndex={-1}
          className={cn(
            "group relative flex w-full items-center gap-2 rounded-md px-2 py-1 text-left",
            "transition-all duration-200 ease-out",
            isSelected ? "bg-muted/70 ring-1 ring-border/70" : "hover:bg-muted/40",
            isDragOver ? "bg-muted/80 ring-1 ring-border" : null
          )}
          data-entry-uri={node.entry.uri}
          draggable={!node.isRoot && !isRenaming}
          onClick={handleRowClick}
          onDoubleClick={handleRowDoubleClick}
          onContextMenuCapture={handleContextMenuCapture}
          onDragStart={handleDragStart}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div
            className={cn(
              "flex h-4 w-4 items-center justify-center transition-transform duration-200 ease-out",
              node.isFolder && isExpanded && "rotate-90",
              !canExpand && "opacity-40"
            )}
          >
            {node.isFolder ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : null}
          </div>
          <div className="flex h-5 w-5 items-center justify-center">{visual}</div>
          {isRenaming ? (
            <Input
              autoFocus
              value={renamingValue ?? node.label}
              onChange={(event) => onRenamingChange?.(event.target.value)}
              className="h-6 w-full rounded-sm border border-border/60 bg-background px-2 py-0 text-left text-xs leading-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="truncate text-sm text-foreground/90">{node.label}</span>
          )}
        </div>
      ) : null}
      {node.isFolder && isExpanded ? (
        <div className="overflow-hidden transition-all duration-300 ease-out">
          {listQuery.isLoading ? (
            <div
              className="py-1 pl-8 text-xs text-muted-foreground"
              style={{ paddingLeft: `${childDepth * 12 + 8}px` }}
            >
              加载中...
            </div>
          ) : listQuery.isError ? (
            <div
              className="py-1 pl-8 text-xs text-destructive"
              style={{ paddingLeft: `${childDepth * 12 + 8}px` }}
            >
              加载失败
            </div>
          ) : childNodes.length === 0 ? (
            <div
              className="py-1 pl-8 text-xs text-muted-foreground"
              style={{ paddingLeft: `${childDepth * 12 + 8}px` }}
            >
              （空）
            </div>
          ) : (
            childNodes.map((child) => (
              <FileSystemGitTreeNode
                key={child.entry.uri}
                node={child}
                projectId={projectId}
                rootUri={rootUri}
                depth={childDepth}
                expandedNodes={expandedNodes}
                dragOverFolderUri={dragOverFolderUri}
                onToggle={onToggle}
                onSelectEntry={onSelectEntry}
                onOpenEntry={onOpenEntry}
                onOpenEntryStack={onOpenEntryStack}
                selectedUris={selectedUris}
                showHidden={showHidden}
                sortField={sortField}
                sortOrder={sortOrder}
                renamingUri={renamingUri}
                renamingValue={renamingValue}
                onRenamingChange={onRenamingChange}
                onRenamingSubmit={onRenamingSubmit}
                onRenamingCancel={onRenamingCancel}
                registerEntry={registerEntry}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                shouldBlockPointerEvent={shouldBlockPointerEvent}
                onContextMenuCapture={onContextMenuCapture}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
});
FileSystemGitTreeNode.displayName = "FileSystemGitTreeNode";

/** Render a git-aware file tree with lazy loading. */
export default function FileSystemGitTree({
  rootUri,
  projectId,
  projectTitle,
  currentUri,
  selectedUris,
  showHidden,
  sortField,
  sortOrder,
  dragProjectId,
  dragRootUri,
  renamingUri,
  renamingValue,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
  onSelectEntry,
  onOpenEntry,
  onOpenEntryStack,
  onContextMenuCapture,
  onEntryDragStart,
  onEntryDrop,
}: FileSystemGitTreeProps) {
  /** Entry registry for drag operations. */
  const entryByUriRef = useRef<Map<string, FileSystemEntry>>(new Map());
  /** Visible entry list for drag payload. */
  const entriesRef = useRef<FileSystemEntry[]>([]);
  /** Cache selected uris for drag payload. */
  const selectedUrisRef = useRef(selectedUris);
  selectedUrisRef.current = selectedUris;
  /** Cache drag project id. */
  const dragProjectIdRef = useRef(dragProjectId);
  dragProjectIdRef.current = dragProjectId;
  /** Cache drag root uri. */
  const dragRootUriRef = useRef(dragRootUri);
  dragRootUriRef.current = dragRootUri;
  /** Cache drag start callback. */
  const onEntryDragStartRef = useRef(onEntryDragStart);
  onEntryDragStartRef.current = onEntryDragStart;
  /** Cache drop callback. */
  const onEntryDropRef = useRef(onEntryDrop);
  onEntryDropRef.current = onEntryDrop;
  /** Track last context menu trigger time. */
  const lastContextMenuRef = useRef<{ uri: string; at: number } | null>(null);
  const rootLabel = useMemo(
    () => resolveRootLabel(rootUri, projectTitle),
    [projectTitle, rootUri]
  );
  const rootRelative = useMemo(() => {
    const relative = getRelativePathFromUri(rootUri, rootUri);
    // file:// URI 的自身相对路径为空，但空字符串会被服务端解析为工作空间根目录。
    // 直接使用 file:// URI 作为根节点 URI，服务端 resolveScopedPath 支持 file: 协议。
    if (!relative && rootUri.startsWith("file://")) return rootUri;
    return relative;
  }, [rootUri]);
  const rootNode = useMemo<GitTreeNode>(
    () => ({
      entry: {
        uri: rootRelative,
        name: rootLabel,
        kind: "folder",
      },
      label: rootLabel,
      isFolder: true,
      isBoardFolder: false,
      isRoot: true,
    }),
    [rootLabel, rootRelative]
  );
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(() => ({
    [rootRelative]: true,
  }));

  /** Register a node entry for drag resolution. */
  const registerEntry = useCallback((entry: FileSystemEntry) => {
    entryByUriRef.current.set(entry.uri, entry);
    entriesRef.current = Array.from(entryByUriRef.current.values());
    return () => {
      entryByUriRef.current.delete(entry.uri);
      entriesRef.current = Array.from(entryByUriRef.current.values());
    };
  }, []);

  /** Resolve entry data from a drag event. */
  const resolveEntryFromEvent = useCallback(
    (event: { currentTarget: HTMLElement }) => {
      const uri = event.currentTarget.getAttribute("data-entry-uri") ?? "";
      if (!uri) return null;
      return entryByUriRef.current.get(uri) ?? null;
    },
    []
  );

  /** Block pointer events shortly after a context menu trigger. */
  const shouldBlockPointerEvent = useCallback(
    (event: { button?: number } | null | undefined) => {
      const button = event?.button;
      if (button !== 0 && button !== 2) return false;
      const last = lastContextMenuRef.current;
      if (!last) return false;
      if (Date.now() - last.at > 500) {
        lastContextMenuRef.current = null;
        return false;
      }
      // 右键后 0.5 秒内屏蔽左右键事件，避免误触。
      return true;
    },
    []
  );

  const {
    dragOverFolderUri,
    handleEntryDragStart,
    handleEntryDragOver,
    handleEntryDragEnter,
    handleEntryDragLeave,
    handleEntryDrop,
  } = useFileSystemDrag({
    entriesRef,
    selectedUrisRef,
    dragProjectIdRef,
    dragRootUriRef,
    onEntryDragStartRef,
    onEntryDropRef,
    resolveEntryFromEvent,
    isBoardFolderEntry,
    shouldBlockPointerEvent,
  });
  /** Target uri used to auto-expand the tree. */
  const revealUri = useMemo(() => {
    if (selectedUris.size > 0) {
      return selectedUris.values().next().value ?? null;
    }
    return currentUri ?? null;
  }, [currentUri, selectedUris]);

  useEffect(() => {
    setExpandedNodes({ [rootRelative]: true });
  }, [rootRelative]);

  useEffect(() => {
    if (!revealUri) return;
    const targets = buildAncestorUris(rootUri, revealUri);
    if (targets.length === 0) return;
    setExpandedNodes((prev) => {
      let hasChange = false;
      const next = { ...prev };
      // 逻辑：仅补齐缺失的展开状态，避免频繁触发渲染。
      for (const uri of targets) {
        if (next[uri]) continue;
        next[uri] = true;
        hasChange = true;
      }
      return hasChange ? next : prev;
    });
  }, [revealUri, rootUri]);

  /** Toggle expansion state for a tree node. */
  const handleToggle = useCallback((uri: string, nextOpen: boolean) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [uri]: nextOpen,
    }));
  }, []);

  /** Handle context menu capture for tree rows. */
  const handleNodeContextMenuCapture = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement>,
      payload: { uri: string | null; entry?: FileSystemEntry | null }
    ) => {
      lastContextMenuRef.current = { uri: payload.uri ?? "", at: Date.now() };
      onContextMenuCapture?.(event, payload);
    },
    [onContextMenuCapture]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <FileSystemGitTreeNode
        node={rootNode}
        projectId={projectId}
        rootUri={rootUri}
        depth={0}
        expandedNodes={expandedNodes}
        dragOverFolderUri={dragOverFolderUri}
        onToggle={handleToggle}
        onSelectEntry={onSelectEntry}
        onOpenEntry={onOpenEntry}
        onOpenEntryStack={onOpenEntryStack}
        selectedUris={selectedUris}
        showHidden={showHidden}
        sortField={sortField}
        sortOrder={sortOrder}
        renamingUri={renamingUri}
        renamingValue={renamingValue}
        onRenamingChange={onRenamingChange}
        onRenamingSubmit={onRenamingSubmit}
        onRenamingCancel={onRenamingCancel}
        registerEntry={registerEntry}
        onDragStart={handleEntryDragStart}
        onDragOver={handleEntryDragOver}
        onDragEnter={handleEntryDragEnter}
        onDragLeave={handleEntryDragLeave}
        onDrop={handleEntryDrop}
        shouldBlockPointerEvent={shouldBlockPointerEvent}
        onContextMenuCapture={handleNodeContextMenuCapture}
      />
    </div>
  );
}
