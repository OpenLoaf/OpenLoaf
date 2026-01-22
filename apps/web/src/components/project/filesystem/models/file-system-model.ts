"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateId } from "ai";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
} from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { resolveServerUrl } from "@/utils/server-url";
import { openFile } from "@/components/file/lib/open-file";
import {
  BOARD_ASSETS_DIR_NAME,
  BOARD_INDEX_FILE_NAME,
  ensureBoardFolderName,
  getBoardDisplayName,
  isBoardFolderName,
} from "@/lib/file-name";
import { readImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import {
  IGNORE_NAMES,
  buildChildUri,
  buildUriFromRoot,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  FILE_DRAG_URIS_MIME,
  formatScopedProjectPath,
  formatSize,
  formatTimestamp,
  getDisplayPathFromUri,
  getParentRelativePath,
  getRelativePathFromUri,
  getUniqueName,
  normalizeRelativePath,
  parseScopedProjectPath,
  resolveBoardFolderEntryFromIndexFile,
  resolveFileUriFromRoot,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import { useFileSystemHistory, type HistoryAction } from "./file-system-history";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { useDebounce } from "@/hooks/use-debounce";
import { useWorkspace } from "@/components/workspace/workspaceContext";

// 用于“复制/粘贴”的内存剪贴板。
let fileClipboard: FileSystemEntry[] | null = null;
/** Default template for new markdown documents. */
const DEFAULT_MARKDOWN_TEMPLATE = [
  "---",
  'title: "New Document"',
  "status: draft",
  "tags:",
  "  - markdown",
  "  - mdx",
  "categories: [notes, demo]",
  "summary: |",
  "  A starter MDX document with common markdown features.",
  "  Replace this template when ready.",
  "---",
  "",
  "# New Document",
  "",
  "> Tip: This file is `.mdx`, so MDX syntax is allowed.",
  "",
  "## Formatting",
  "- **bold**, *italic*, ~~strikethrough~~, `inline code`",
  "- [link](https://example.com)",
  "",
  "## Lists",
  "1. Ordered item",
  "2. Another item",
  "   - Nested item",
  "",
  "## Task List",
  "- [x] Setup",
  "- [ ] Write",
  "",
  "## Table",
  "| Feature | Status |",
  "| --- | --- |",
  "| Front matter | OK |",
  "| Markdown | OK |",
  "| MDX | OK |",
  "",
  "## Code",
  "~~~ts",
  "export function greet(name: string) {",
  "  return `Hello, ${name}!`;",
  "}",
  "~~~",
  "",
  "## Quote",
  "> A short quote to highlight a key idea.",
  "",
  "## MDX",
  '<Note tone="info">',
  "  You can embed components in MDX files.",
  "</Note>",
  "",
  "{1 + 1}",
  "",
  "---",
  "",
  "## Next",
  "- Replace this template with your content.",
].join("\n");

export type ProjectFileSystemModelArgs = {
  projectId?: string;
  rootUri?: string;
  currentUri?: string | null;
  onNavigate?: (nextUri: string) => void;
  /** Initial sort field restored from tab params. */
  initialSortField?: "name" | "mtime" | null;
  /** Initial sort order restored from tab params. */
  initialSortOrder?: "asc" | "desc" | null;
};

export type ProjectFileSystemModel = {
  projectId?: string;
  rootUri?: string;
  activeUri: string | null;
  /** Folder uri that matches the rendered list. */
  displayUri: string | null;
  /** Whether terminal feature is enabled. */
  isTerminalEnabled: boolean;
  listQuery: ReturnType<typeof useQuery>;
  /** Whether search query is fetching results. */
  isSearchLoading: boolean;
  fileEntries: FileSystemEntry[];
  displayEntries: FileSystemEntry[];
  parentUri: string | null;
  sortField: "name" | "mtime" | null;
  sortOrder: "asc" | "desc" | null;
  searchValue: string;
  isSearchOpen: boolean;
  showHidden: boolean;
  clipboardSize: number;
  /** Whether the transfer dialog is open. */
  transferDialogOpen: boolean;
  /** Entries pending for transfer. */
  transferEntries: FileSystemEntry[];
  /** Active transfer mode. */
  transferMode: "copy" | "move" | "select";
  isDragActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  searchContainerRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  handleNavigate: (nextUri: string) => void;
  setSearchValue: (value: string) => void;
  setIsSearchOpen: (value: boolean) => void;
  setShowHidden: Dispatch<SetStateAction<boolean>>;
  handleSortByName: () => void;
  handleSortByTime: () => void;
  /** Toggle transfer dialog open state. */
  handleTransferDialogOpenChange: (open: boolean) => void;
  /** Open transfer dialog with entries and mode. */
  handleOpenTransferDialog: (
    entries: FileSystemEntry | FileSystemEntry[],
    mode: "copy" | "move" | "select"
  ) => void;
  handleCopyPath: (entry: FileSystemEntry) => Promise<void>;
  handleOpen: (entry: FileSystemEntry) => Promise<void>;
  handleOpenInFileManager: (entry: FileSystemEntry) => Promise<void>;
  /** Copy current directory path to clipboard. */
  handleCopyPathAtCurrent: () => Promise<void>;
  handleOpenInFileManagerAtCurrent: () => Promise<void>;
  handleOpenImage: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  handleOpenMarkdown: (entry: FileSystemEntry) => void;
  handleOpenCode: (entry: FileSystemEntry) => void;
  handleOpenPdf: (entry: FileSystemEntry) => void;
  handleOpenDoc: (entry: FileSystemEntry) => void;
  handleOpenSpreadsheet: (entry: FileSystemEntry) => void;
  handleOpenVideo: (entry: FileSystemEntry) => void;
  handleOpenBoard: (entry: FileSystemEntry, options?: { pendingRename?: boolean }) => void;
  handleOpenTerminal: (entry: FileSystemEntry) => void;
  handleOpenTerminalAtCurrent: () => void;
  renameEntry: (entry: FileSystemEntry, nextName: string) => Promise<string | null>;
  handleDelete: (entry: FileSystemEntry) => Promise<void>;
  handleDeleteBatch: (entries: FileSystemEntry[]) => Promise<void>;
  handleDeletePermanent: (entry: FileSystemEntry) => Promise<void>;
  handleDeletePermanentBatch: (entries: FileSystemEntry[]) => Promise<void>;
  handleShowInfo: (entry: FileSystemEntry) => void;
  handleCreateFolder: () => Promise<{ uri: string; name: string } | null>;
  handleCreateMarkdown: () => Promise<{ uri: string; name: string } | null>;
  handleCreateBoard: () => Promise<void>;
  handlePaste: () => Promise<void>;
  handleUploadFiles: (files: File[], targetUri?: string | null) => Promise<void>;
  handleDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  handleDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleMoveToFolder: (
    source: FileSystemEntry,
    target: FileSystemEntry
  ) => Promise<void>;
  handleEntryDragStart: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ) => void;
  handleEntryDrop: (
    target: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ) => Promise<number>;
  undo: () => void;
  redo: () => void;
  /** Refresh a folder list and thumbnails. */
  refreshList: (targetUri?: string | null) => void;
};

/** Resolve parent uri for the current folder. */
function getParentUri(rootUri?: string, currentUri?: string | null): string | null {
  if (!currentUri) return null;
  const normalizedRoot = rootUri ? normalizeRelativePath(rootUri) : "";
  const normalizedCurrent = normalizeRelativePath(currentUri);
  const rootParts = normalizedRoot ? normalizedRoot.split("/").filter(Boolean) : [];
  const currentParts = normalizedCurrent ? normalizedCurrent.split("/").filter(Boolean) : [];
  // 已到根目录时不再返回上级。
  if (currentParts.length <= rootParts.length) return null;
  return currentParts.slice(0, -1).join("/");
}

/** Resolve the parent directory uri for an entry. */
function getEntryParentUri(entry: FileSystemEntry): string | null {
  const parent = getParentRelativePath(entry.uri);
  // 中文注释：文件条目使用父目录作为终端工作目录。
  return parent;
}

/** Check if target uri is inside source uri. */
function isSubPath(sourceUri: string, targetUri: string) {
  const normalizedSource = normalizeRelativePath(sourceUri);
  const normalizedTarget = normalizeRelativePath(targetUri);
  if (!normalizedSource || !normalizedTarget) return false;
  return (
    normalizedTarget === normalizedSource ||
    normalizedTarget.startsWith(`${normalizedSource}/`)
  );
}

/** Build project file system state and actions. */
export function useProjectFileSystemModel({
  projectId,
  rootUri,
  currentUri,
  onNavigate,
  initialSortField = null,
  initialSortOrder = null,
}: ProjectFileSystemModelArgs): ProjectFileSystemModel {
  const normalizedRootUri = rootUri ? getRelativePathFromUri(rootUri, rootUri) : "";
  const normalizedCurrentUri = currentUri
    ? getRelativePathFromUri(rootUri ?? "", currentUri)
    : null;
  const activeUri = normalizedCurrentUri ?? (rootUri ? normalizedRootUri : null);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );
  const terminalStatus = useTerminalStatus();
  const isTerminalEnabled = terminalStatus.enabled;
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const dragCounterRef = useRef(0);
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const [sortField, setSortField] = useState<"name" | "mtime" | null>(initialSortField);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(initialSortOrder);
  const [searchValue, setSearchValue] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const trimmedSearchValue = searchValue.trim();
  const debouncedSearchValue = useDebounce(trimmedSearchValue, 200);
  // 记录上一次稳定渲染的目录，用于占位数据期间维持「上一级」的一致性。
  const stableUriRef = useRef(activeUri);
  const listQuery = useQuery({
    ...trpc.fs.list.queryOptions(
      activeUri !== null && workspaceId
        ? {
            workspaceId,
            projectId,
            uri: activeUri,
            includeHidden: showHidden,
            sort:
              sortField && sortOrder
                ? { field: sortField, order: sortOrder }
                : undefined,
          }
        : skipToken
    ),
    // 排序切换时沿用旧列表，避免闪烁与空白过渡。
    placeholderData: (previous) => previous,
  });
  const isPlaceholderData = Boolean(listQuery.isPlaceholderData);
  useEffect(() => {
    if (isPlaceholderData) return;
    stableUriRef.current = activeUri;
  }, [activeUri, isPlaceholderData]);
  const searchQuery = useQuery({
    ...trpc.fs.search.queryOptions(
      activeUri !== null && debouncedSearchValue && workspaceId
        ? {
            workspaceId,
            projectId,
            rootUri: activeUri,
            query: debouncedSearchValue,
            includeHidden: showHidden,
            limit: 500,
            maxDepth: 12,
          }
        : skipToken
    ),
    placeholderData: (previous) => previous,
  });
  const isSearchLoading =
    Boolean(trimmedSearchValue) &&
    (debouncedSearchValue !== trimmedSearchValue ||
      searchQuery.isLoading ||
      searchQuery.isFetching);
  const entries = listQuery.data?.entries ?? [];
  const searchResults = searchQuery.data?.results ?? [];
  const visibleEntries = showHidden
    ? entries
    : entries.filter((entry) => !IGNORE_NAMES.has(entry.name));
  const fileEntries = useMemo(() => visibleEntries as FileSystemEntry[], [visibleEntries]);
  const displayEntries = useMemo(() => {
    if (!trimmedSearchValue) return fileEntries;
    if (!debouncedSearchValue) return fileEntries;
    return searchResults;
  }, [debouncedSearchValue, fileEntries, searchResults, trimmedSearchValue]);
  const displayUri = isPlaceholderData ? stableUriRef.current : activeUri;
  const parentUri = getParentUri(normalizedRootUri, displayUri);
  const existingNames = useMemo(
    () => new Set(fileEntries.map((entry) => entry.name)),
    [fileEntries]
  );
  const [clipboardSize, setClipboardSize] = useState(fileClipboard?.length ?? 0);
  /** Whether the transfer dialog is open. */
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  /** Entries selected for transfer dialog. */
  const [transferEntries, setTransferEntries] = useState<FileSystemEntry[]>([]);
  /** Current transfer mode (copy/move/select). */
  const [transferMode, setTransferMode] = useState<"copy" | "move" | "select">(
    "copy"
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const trashRootUri = useMemo(
    () => (rootUri ? buildChildUri(normalizedRootUri, ".tenas-trash") : null),
    [normalizedRootUri, rootUri]
  );
  const historyKey = useMemo(
    () => projectId ?? rootUri ?? "project-files",
    [projectId, rootUri]
  );

  const renameMutation = useMutation(trpc.fs.rename.mutationOptions());
  const deleteMutation = useMutation(trpc.fs.delete.mutationOptions());
  const copyMutation = useMutation(trpc.fs.copy.mutationOptions());
  const writeFileMutation = useMutation(trpc.fs.writeFile.mutationOptions());
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());

  /** Navigate to a target uri with trace logging. */
  const handleNavigate = useCallback(
    (nextUri: string) => {
      console.debug("[ProjectFileSystem] navigate", {
        at: new Date().toISOString(),
        nextUri,
      });
      onNavigate?.(nextUri);
    },
    [onNavigate]
  );

  /** Refresh the current folder list and thumbnails. */
  const refreshList = useCallback((targetUri = activeUri) => {
    if (targetUri === null || targetUri === undefined) return;
    if (!workspaceId) return;
    queryClient.invalidateQueries({
      queryKey: trpc.fs.list.queryOptions({
        workspaceId,
        projectId,
        uri: targetUri,
        includeHidden: showHidden,
      }).queryKey,
    });
    queryClient.invalidateQueries({
      queryKey: trpc.fs.folderThumbnails.queryOptions({
        workspaceId,
        projectId,
        uri: targetUri,
        includeHidden: showHidden,
      }).queryKey,
    });
  }, [activeUri, projectId, queryClient, showHidden, workspaceId]);

  const {
    canUndo,
    canRedo,
    push: pushHistory,
    undo,
    redo,
    clear: clearHistory,
  } = useFileSystemHistory(
    {
      rename: async (from, to) => {
        await renameMutation.mutateAsync({ workspaceId, projectId, from, to });
      },
      copy: async (from, to) => {
        await copyMutation.mutateAsync({ workspaceId, projectId, from, to });
      },
      mkdir: async (uri) => {
        await mkdirMutation.mutateAsync({
          workspaceId,
          projectId,
          uri,
          recursive: true,
        });
      },
      delete: async (uri) => {
        await deleteMutation.mutateAsync({
          workspaceId,
          projectId,
          uri,
          recursive: true,
        });
      },
      writeFile: async (uri, content) => {
        await writeFileMutation.mutateAsync({
          workspaceId,
          projectId,
          uri,
          content,
        });
      },
      writeBinary: async (uri, contentBase64) => {
        await writeBinaryMutation.mutateAsync({
          workspaceId,
          projectId,
          uri,
          contentBase64,
        });
      },
      trash: async (uri) => {
        const fileUri = resolveFileUriFromRoot(rootUri, uri);
        const res = await window.tenasElectron?.trashItem?.({ uri: fileUri });
        if (!res?.ok) {
          throw new Error(res?.reason ?? "无法移动到回收站");
        }
      },
      refresh: refreshList,
    },
    historyKey
  );

  useEffect(() => {
    if (!projectId || !workspaceId || activeUri === null) return;
    const baseUrl = resolveServerUrl();
    const url = `${baseUrl}/fs/watch?projectId=${encodeURIComponent(
      projectId
    )}&workspaceId=${encodeURIComponent(
      workspaceId
    )}&dirUri=${encodeURIComponent(activeUri)}`;
    const eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data) as { type?: string; projectId?: string };
        if (payload.projectId !== projectId) return;
        if (payload.type === "fs-change") {
          refreshList();
        }
      } catch {
        // ignore
      }
    };
    return () => {
      eventSource.close();
    };
  }, [projectId, activeUri, refreshList, workspaceId]);

  useEffect(() => {
    clearHistory();
  }, [activeUri, clearHistory]);

  useEffect(() => {
    if (!isSearchOpen) return;
    searchInputRef.current?.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!searchContainerRef.current) return;
      if (searchContainerRef.current.contains(event.target as Node)) return;
      if (trimmedSearchValue) return;
      setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isSearchOpen, trimmedSearchValue]);

  useEffect(() => {
    if (!trimmedSearchValue) return;
    if (isSearchOpen) return;
    setIsSearchOpen(true);
  }, [isSearchOpen, trimmedSearchValue]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tagName = target.tagName;
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!isCmdOrCtrl) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        if (!isSearchOpen) {
          setIsSearchOpen(true);
          return;
        }
        searchInputRef.current?.focus();
        return;
      }
      if (key === "z" && event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
        return;
      }
      if (key === "z") {
        if (!canUndo) return;
        event.preventDefault();
        undo();
        return;
      }
      if (key === "y") {
        if (!canRedo) return;
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canRedo, canUndo, isSearchOpen, redo, setIsSearchOpen, undo]);

  /** Copy text to system clipboard with a fallback. */
  const copyText = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  /** Read a local file as base64 for upload. */
  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  /** Open transfer dialog for one or more entries. */
  const handleOpenTransferDialog = (
    entries: FileSystemEntry | FileSystemEntry[],
    mode: "copy" | "move" | "select"
  ) => {
    const normalized = Array.isArray(entries) ? entries : [entries];
    if (mode !== "select" && normalized.length === 0) return;
    if (mode === "copy") {
      // 中文注释：复制模式同步剪贴板，保持粘贴入口一致。
      fileClipboard = normalized;
      setClipboardSize(fileClipboard.length);
    }
    setTransferEntries(normalized);
    setTransferMode(mode);
    setTransferDialogOpen(true);
  };

  /** Reset transfer dialog state on close. */
  const handleTransferDialogOpenChange = (open: boolean) => {
    setTransferDialogOpen(open);
    if (!open) {
      setTransferEntries([]);
    }
  };

  /** Copy file or folder path to clipboard. */
  const handleCopyPath = async (entry: FileSystemEntry) => {
    const targetUri = resolveFileUriFromRoot(rootUri, entry.uri);
    await copyText(getDisplayPathFromUri(targetUri));
    toast.success("已复制路径");
  };

  /** Open file/folder using platform integration. */
  const handleOpen = async (entry: FileSystemEntry) => {
    // 逻辑：index.tnboard 与画布目录统一打开画布栈。
    const boardFolderEntry = resolveBoardFolderEntryFromIndexFile(entry);
    if (boardFolderEntry) {
      handleOpenBoard(boardFolderEntry);
      return;
    }
    if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
      handleOpenBoard(entry);
      return;
    }
    if (entry.kind === "folder") {
      handleNavigate(entry.uri);
      return;
    }
    if (!isElectron) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
    const res = await window.tenasElectron?.openPath?.({ uri: fileUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  };

  /** Open item in system file manager. */
  const handleOpenInFileManager = async (entry: FileSystemEntry) => {
    if (!isElectron) {
      toast.error("网页版不支持打开文件管理器");
      return;
    }
    const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
    const res =
      entry.kind === "folder"
        ? await window.tenasElectron?.openPath?.({ uri: fileUri })
        : await window.tenasElectron?.showItemInFolder?.({ uri: fileUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件管理器");
    }
  };

  /** Copy current directory path to clipboard. */
  const handleCopyPathAtCurrent = async () => {
    const targetUri = activeUri ?? normalizedRootUri ?? "";
    await copyText(getDisplayPathFromUri(targetUri));
    toast.success("已复制路径");
  };

  /** Open the current folder in the system file manager. */
  const handleOpenInFileManagerAtCurrent = async () => {
    if (!isElectron) {
      toast.error("网页版不支持打开文件管理器");
      return;
    }
    const fallbackUri = activeUri ?? normalizedRootUri;
    const targetUri = fallbackUri
      ? resolveFileUriFromRoot(rootUri, fallbackUri)
      : rootUri ?? "";
    if (!targetUri) {
      toast.error("未找到工作区目录");
      return;
    }
    const res = await window.tenasElectron?.openPath?.({ uri: targetUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件管理器");
    }
  };

  /** Open an image file inside the current tab stack. */
  const handleOpenImage = useCallback(
    (entry: FileSystemEntry, thumbnailSrc?: string) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
        thumbnailSrc,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a markdown file inside the current tab stack. */
  const handleOpenMarkdown = useCallback(
    (entry: FileSystemEntry) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a code file inside the current tab stack. */
  const handleOpenCode = useCallback(
    (entry: FileSystemEntry) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a PDF file inside the current tab stack. */
  const handleOpenPdf = useCallback(
    (entry: FileSystemEntry) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a DOC file inside the current tab stack. */
  const handleOpenDoc = useCallback(
    (entry: FileSystemEntry) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a spreadsheet file inside the current tab stack. */
  const handleOpenSpreadsheet = useCallback(
    (entry: FileSystemEntry) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a video file inside the current tab stack. */
  const handleOpenVideo = useCallback(
    (entry: FileSystemEntry) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a board folder inside the current tab stack. */
  const handleOpenBoard = useCallback(
    (entry: FileSystemEntry, options?: { pendingRename?: boolean }) => {
      openFile({
        entry,
        tabId: activeTabId,
        projectId,
        rootUri,
        board: {
          pendingRename: options?.pendingRename,
        },
      });
    },
    [activeTabId, projectId, rootUri]
  );

  /** Open a terminal inside the current tab stack. */
  const handleOpenTerminal = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      if (terminalStatus.isLoading) {
        toast.message("正在获取终端状态");
        return;
      }
      if (!isTerminalEnabled) {
        toast.error("终端功能未开启");
        return;
      }
      const pwdRelative =
        entry.kind === "folder" ? entry.uri : getEntryParentUri(entry);
      const pwdUri =
        pwdRelative === null || pwdRelative === undefined
          ? ""
          : pwdRelative
            ? resolveFileUriFromRoot(rootUri, pwdRelative)
            : rootUri ?? "";
      if (!pwdUri) {
        toast.error("无法解析终端目录");
        return;
      }
      pushStackItem(activeTabId, {
        id: TERMINAL_WINDOW_PANEL_ID,
        sourceKey: TERMINAL_WINDOW_PANEL_ID,
        component: TERMINAL_WINDOW_COMPONENT,
        title: "Terminal",
        params: {
          __customHeader: true,
          __open: { pwdUri },
        },
      });
    },
    [activeTabId, isTerminalEnabled, pushStackItem, rootUri, terminalStatus.isLoading]
  );

  /** Open a terminal at the current directory. */
  const handleOpenTerminalAtCurrent = useCallback(() => {
    if (!activeTabId) {
      toast.error("未找到当前标签页");
      return;
    }
    if (terminalStatus.isLoading) {
      toast.message("正在获取终端状态");
      return;
    }
    if (!isTerminalEnabled) {
      toast.error("终端功能未开启");
      return;
    }
    const fallbackUri = activeUri ?? normalizedRootUri;
    const pwdUri = fallbackUri
      ? resolveFileUriFromRoot(rootUri, fallbackUri)
      : rootUri ?? "";
    if (!pwdUri) {
      toast.error("未找到工作区目录");
      return;
    }
    pushStackItem(activeTabId, {
      id: TERMINAL_WINDOW_PANEL_ID,
      sourceKey: TERMINAL_WINDOW_PANEL_ID,
      component: TERMINAL_WINDOW_COMPONENT,
      title: "Terminal",
      params: {
        __customHeader: true,
        __open: { pwdUri },
      },
    });
  }, [
    activeTabId,
    activeUri,
    isTerminalEnabled,
    normalizedRootUri,
    pushStackItem,
    rootUri,
    terminalStatus.isLoading,
  ]);

  /** Rename a file or folder with validation and history tracking. */
  const renameEntry = async (entry: FileSystemEntry, nextName: string) => {
    if (activeUri === null || !workspaceId) return null;
    const normalizedName =
      entry.kind === "folder" && isBoardFolderName(entry.name)
        ? ensureBoardFolderName(nextName)
        : nextName;
    if (!normalizedName) return null;
    if (normalizedName === entry.name) return null;
    const existingNames = new Set(
      fileEntries
        .filter((item) => item.uri !== entry.uri)
        .map((item) => item.name)
    );
    if (existingNames.has(normalizedName)) {
      toast.error("已存在同名文件或文件夹");
      return null;
    }
    const targetUri = buildChildUri(activeUri, normalizedName);
    await renameMutation.mutateAsync({
      workspaceId,
      projectId,
      from: entry.uri,
      to: targetUri,
    });
    pushHistory({ kind: "rename", from: entry.uri, to: targetUri });
    refreshList();
    return targetUri;
  };

  /** Delete file or folder. */
  const handleDelete = async (entry: FileSystemEntry) => {
    if (!workspaceId) return;
    const ok = window.confirm(`确认删除「${entry.name}」？`);
    if (!ok) return;
    if (!trashRootUri) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 6);
    const trashName = `${stamp}-${suffix}-${entry.name}`;
    const trashUri = buildChildUri(trashRootUri, trashName);
    // 中文注释：非 Electron 端先挪进隐藏回收站，便于撤回。
    await mkdirMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: trashRootUri,
      recursive: true,
    });
    await renameMutation.mutateAsync({
      workspaceId,
      projectId,
      from: entry.uri,
      to: trashUri,
    });
    pushHistory({ kind: "delete", uri: entry.uri, trashUri });
    refreshList();
  };

  /** Delete multiple files or folders with a single confirmation. */
  const handleDeleteBatch = async (entries: FileSystemEntry[]) => {
    if (entries.length === 0) return;
    if (!workspaceId) return;
    const ok = window.confirm(`确认删除已选择的 ${entries.length} 项？`);
    if (!ok) return;
    if (!trashRootUri) return;
    await mkdirMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: trashRootUri,
      recursive: true,
    });
    const actions: HistoryAction[] = [];
    for (const entry of entries) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const suffix = Math.random().toString(36).slice(2, 6);
      const trashName = `${stamp}-${suffix}-${entry.name}`;
      const trashUri = buildChildUri(trashRootUri, trashName);
      await renameMutation.mutateAsync({
        workspaceId,
        projectId,
        from: entry.uri,
        to: trashUri,
      });
      actions.push({ kind: "delete", uri: entry.uri, trashUri });
    }
    if (actions.length === 1) {
      pushHistory(actions[0]);
    } else if (actions.length > 1) {
      pushHistory({ kind: "batch", actions });
    }
    refreshList();
  };

  /** Permanently delete (system trash if available). */
  const handleDeletePermanent = async (entry: FileSystemEntry) => {
    if (!workspaceId) return;
    const ok = window.confirm(`彻底删除「${entry.name}」？此操作不可撤回。`);
    if (!ok) return;
    if (isElectron && window.tenasElectron?.trashItem) {
      try {
        const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
        const res = await window.tenasElectron.trashItem({ uri: fileUri });
        if (!res?.ok) {
          toast.error(res?.reason ?? "无法移动到系统回收站");
          return;
        }
        refreshList();
        return;
      } catch (error) {
        console.warn("[ProjectFileSystem] trash item failed", error);
        toast.error("无法移动到系统回收站");
        return;
      }
    }
    await deleteMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: entry.uri,
      recursive: true,
    });
    refreshList();
  };

  /** Permanently delete multiple entries with a single confirmation. */
  const handleDeletePermanentBatch = async (entries: FileSystemEntry[]) => {
    if (entries.length === 0) return;
    if (!workspaceId) return;
    const ok = window.confirm(
      `彻底删除已选择的 ${entries.length} 项？此操作不可撤回。`
    );
    if (!ok) return;
    for (const entry of entries) {
      if (isElectron && window.tenasElectron?.trashItem) {
        try {
          const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
          const res = await window.tenasElectron.trashItem({ uri: fileUri });
          if (!res?.ok) {
            toast.error(res?.reason ?? "无法移动到系统回收站");
          }
          continue;
        } catch (error) {
          console.warn("[ProjectFileSystem] trash item failed", error);
          toast.error("无法移动到系统回收站");
          continue;
        }
      }
      await deleteMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: entry.uri,
        recursive: true,
      });
    }
    refreshList();
  };

  /** Show basic metadata for the entry. */
  const handleShowInfo = (entry: FileSystemEntry) => {
    const detail = [
      `类型：${entry.kind === "folder" ? "文件夹" : "文件"}`,
      `大小：${formatSize(entry.size)}`,
      `更新时间：${formatTimestamp(entry.updatedAt)}`,
      `路径：${getDisplayPathFromUri(entry.uri)}`,
    ].join("\n");
    toast.message("基本信息", { description: detail });
  };

  /** Create a new folder in the current directory. */
  const handleCreateFolder = async () => {
    if (activeUri === null || !workspaceId) return null;
    // 以默认名称创建并做唯一性处理，避免覆盖已有目录。
    const targetName = getUniqueName("新建文件夹", new Set(existingNames));
    const targetUri = buildChildUri(activeUri, targetName);
    await mkdirMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: targetUri,
      recursive: true,
    });
    pushHistory({ kind: "mkdir", uri: targetUri });
    refreshList();
    return { uri: targetUri, name: targetName };
  };

  /** Create a new markdown document in the current directory. */
  const handleCreateMarkdown = async () => {
    if (activeUri === null || !workspaceId) return null;
    const targetName = getUniqueName("新建文稿.mdx", new Set(existingNames));
    const targetUri = buildChildUri(activeUri, targetName);
    // 逻辑：使用默认模板生成可直接预览的 MDX 文稿。
    await writeFileMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: targetUri,
      content: DEFAULT_MARKDOWN_TEMPLATE,
    });
    pushHistory({
      kind: "create",
      uri: targetUri,
      content: DEFAULT_MARKDOWN_TEMPLATE,
    });
    refreshList();
    handleOpenMarkdown({
      uri: targetUri,
      name: targetName,
      kind: "file",
      ext: "mdx",
    });
    return { uri: targetUri, name: targetName };
  };

  /** Create a new board folder in the current directory. */
  const handleCreateBoard = async () => {
    if (activeUri === null || !workspaceId) return;
    const baseName = ensureBoardFolderName("新建画布");
    const targetName = getUniqueName(baseName, new Set(existingNames));
    const boardFolderUri = buildChildUri(activeUri, targetName);
    const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
    const assetsUri = buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME);
    // 逻辑：画布采用文件夹结构，包含 index.tnboard 与 .asset 子目录。
    await mkdirMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: boardFolderUri,
      recursive: true,
    });
    await mkdirMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: assetsUri,
      recursive: true,
    });
    await writeBinaryMutation.mutateAsync({
      workspaceId,
      projectId,
      uri: boardFileUri,
      contentBase64: "",
    });
    pushHistory({
      kind: "batch",
      actions: [
        { kind: "mkdir", uri: boardFolderUri },
        { kind: "mkdir", uri: assetsUri },
        { kind: "create", uri: boardFileUri, contentBase64: "" },
      ],
    });
    refreshList();
    handleOpenBoard(
      {
        uri: boardFolderUri,
        name: targetName,
        kind: "folder",
      },
      { pendingRename: true }
    );
  };

  /** Paste copied files into the current directory. */
  const handlePaste = async () => {
    if (activeUri === null) return;
    if (!fileClipboard || fileClipboard.length === 0) {
      toast.error("剪贴板为空");
      return;
    }
    const names = new Set(existingNames);
    const actions: HistoryAction[] = [];
    for (const entry of fileClipboard) {
      const targetName = getUniqueName(entry.name, names);
      names.add(targetName);
      const targetUri = buildChildUri(activeUri, targetName);
      await copyMutation.mutateAsync({
        workspaceId,
        projectId,
        from: entry.uri,
        to: targetUri,
      });
      actions.push({ kind: "copy", from: entry.uri, to: targetUri } as const);
    }
    if (actions.length === 1) {
      pushHistory(actions[0]);
    } else if (actions.length > 1) {
      pushHistory({ kind: "batch", actions });
    }
    refreshList();
    setClipboardSize(fileClipboard?.length ?? 0);
    toast.success("已粘贴");
  };

  /** Upload files into the target directory. */
  const handleUploadFiles = async (files: File[], targetUri = activeUri) => {
    if (targetUri === null || files.length === 0) return;
    const targetEntries =
      activeUri !== null && targetUri === activeUri
        ? new Map(fileEntries.map((entry) => [entry.name, entry.kind]))
        : new Map(
            (
              await queryClient.fetchQuery(
                trpc.fs.list.queryOptions({
                  workspaceId,
                  projectId,
                  uri: targetUri,
                  includeHidden: showHidden,
                })
              )
            ).entries?.map((entry) => [entry.name, entry.kind]) ?? []
          );
    let uploadedCount = 0;
    for (const file of files) {
      const existingKind = targetEntries.get(file.name);
      if (existingKind === "folder") {
        toast.error(`已存在同名文件夹：${file.name}`);
        continue;
      }
      if (existingKind === "file") {
        // 中文注释：存在同名文件时弹窗确认是否覆盖。
        const ok = window.confirm(`"${file.name}" 已存在，是否覆盖？`);
        if (!ok) {
          continue;
        }
      }
      const nextUri = buildChildUri(targetUri, file.name);
      const base64 = await readFileAsBase64(file);
      await writeBinaryMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: nextUri,
        contentBase64: base64,
      });
      targetEntries.set(file.name, "file");
      uploadedCount += 1;
    }
    if (uploadedCount > 0) {
      refreshList(targetUri);
      toast.success("已添加文件");
    }
  };

  /** Import an image drag payload into the target folder. */
  const handleImportImagePayload = async (
    targetUri: string | null,
    payload: ReturnType<typeof readImageDragPayload>
  ): Promise<boolean> => {
    if (targetUri === null || !payload) return false;
    try {
      const blob = await fetchBlobFromUri(payload.baseUri, { projectId });
      const fileName = payload.fileName || resolveFileName(payload.baseUri);
      const file = new File([blob], fileName, {
        type: blob.type || "application/octet-stream",
      });
      await handleUploadFiles([file], targetUri);
      return true;
    } catch {
      toast.error("导入图片失败");
    }
    return false;
  };

  /** Handle file drops from the OS. */
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const hasInternalRef = event.dataTransfer.types.includes(FILE_DRAG_REF_MIME);
    const imagePayload = readImageDragPayload(event.dataTransfer);
    if (imagePayload && !hasInternalRef) {
      await handleImportImagePayload(activeUri, imagePayload);
      return;
    }
    if (hasInternalRef) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    await handleUploadFiles(files);
  };

  /** Toggle sort by name. */
  const handleSortByName = () => {
    if (sortField !== "name") {
      setSortField("name");
      setSortOrder("asc");
      return;
    }
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  /** Toggle sort by time. */
  const handleSortByTime = () => {
    if (sortField !== "mtime") {
      setSortField("mtime");
      setSortOrder("desc");
      return;
    }
    setSortOrder(sortOrder === "desc" ? "asc" : "desc");
  };

  /** Move an entry into another folder and return the history action. */
  const moveEntryToFolder = async (
    source: FileSystemEntry,
    target: FileSystemEntry,
    options?: { targetNames?: Set<string> }
  ): Promise<HistoryAction | null> => {
    if (source.kind === "folder" && source.uri === target.uri) return null;
    if (source.uri === target.uri) return null;
    if (isSubPath(source.uri, target.uri)) {
      toast.error("无法移动到自身目录");
      return null;
    }
    let targetNames = options?.targetNames;
    if (!targetNames) {
      const targetList = await queryClient.fetchQuery(
        trpc.fs.list.queryOptions({
          workspaceId,
          projectId,
          uri: target.uri,
          includeHidden: showHidden,
        })
      );
      targetNames = new Set((targetList.entries ?? []).map((entry) => entry.name));
    }
    const targetName = getUniqueName(source.name, targetNames);
    targetNames.add(targetName);
    const targetUri = buildChildUri(target.uri, targetName);
    await renameMutation.mutateAsync({
      workspaceId,
      projectId,
      from: source.uri,
      to: targetUri,
    });
    return { kind: "rename", from: source.uri, to: targetUri };
  };

  /** Move a file/folder into another folder. */
  const handleMoveToFolder = async (
    source: FileSystemEntry,
    target: FileSystemEntry
  ) => {
    const action = await moveEntryToFolder(source, target);
    if (!action) return;
    pushHistory(action);
    refreshList();
  };

  /** Track drag enter for upload overlay. */
  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_REF_MIME)) return;
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  /** Track drag over for upload overlay. */
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_REF_MIME)) return;
  };

  /** Track drag leave for upload overlay. */
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_REF_MIME)) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  /** Prepare drag payload for entry moves. */
  const handleEntryDragStart = (
    entry: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ) => {
    if (!rootUri || !projectId) return;
    const relativePath = getRelativePathFromUri(rootUri ?? "", entry.uri);
    if (!relativePath) return;
    event.dataTransfer.setData(
      FILE_DRAG_REF_MIME,
      formatScopedProjectPath({ projectId, relativePath, includeAt: true })
    );
  };

  /** Handle drop onto a target entry. */
  const handleEntryDrop = async (
    target: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ): Promise<number> => {
    event.preventDefault();
    event.stopPropagation();
    const hasInternalRef = event.dataTransfer.types.includes(FILE_DRAG_REF_MIME);
    if (!hasInternalRef) {
      const imagePayload = readImageDragPayload(event.dataTransfer);
      if (imagePayload) {
        if (target.kind !== "folder") return 0;
        const ok = await handleImportImagePayload(target.uri, imagePayload);
        return ok ? 1 : 0;
      }
      return 0;
    }
    // 中文注释：支持多选拖拽，优先读取 uri 列表。
    const rawSourceUris = (() => {
      const payload = event.dataTransfer.getData(FILE_DRAG_URIS_MIME);
      if (payload) {
        try {
          const parsed = JSON.parse(payload);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (item): item is string => typeof item === "string" && item.length > 0
            );
          }
        } catch {
          return [];
        }
      }
      const rawSourceUri = event.dataTransfer.getData(FILE_DRAG_URI_MIME);
      return rawSourceUri ? [rawSourceUri] : [];
    })();
    if (rawSourceUris.length === 0) return 0;
    const uniqueSourceUris = Array.from(new Set(rawSourceUris));
    const targetList = await queryClient.fetchQuery(
      trpc.fs.list.queryOptions({
        workspaceId,
        projectId,
        uri: target.uri,
        includeHidden: showHidden,
      })
    );
    const targetNames = new Set(
      (targetList.entries ?? []).map((entry) => entry.name)
    );
    const actions: HistoryAction[] = [];
    for (const rawSourceUri of uniqueSourceUris) {
      let sourceUri = rawSourceUri;
      const parsed = parseScopedProjectPath(rawSourceUri);
      if (parsed) {
        const sourceProjectId = parsed.projectId ?? projectId;
        if (!sourceProjectId || !projectId || sourceProjectId !== projectId || !rootUri) {
          toast.error("无法移动跨项目文件");
          return 0;
        }
        sourceUri = buildUriFromRoot(rootUri, parsed.relativePath);
      }
      let source = fileEntries.find((item) => item.uri === sourceUri);
      if (!source) {
        const stat = await queryClient.fetchQuery(
          trpc.fs.stat.queryOptions({ workspaceId, projectId, uri: sourceUri })
        );
        source = {
          uri: stat.uri,
          name: stat.name,
          kind: stat.kind,
          ext: stat.ext,
          size: stat.size,
          updatedAt: stat.updatedAt,
        } as FileSystemEntry;
      }
      const action = await moveEntryToFolder(source, target, { targetNames });
      if (action) actions.push(action);
    }
    if (actions.length === 0) return 0;
    // 中文注释：多选拖拽合并历史记录，撤回时一次恢复。
    if (actions.length === 1) {
      pushHistory(actions[0]);
    } else {
      pushHistory({ kind: "batch", actions });
    }
    refreshList();
    return actions.length;
  };

  return {
    projectId,
    rootUri,
    activeUri,
    displayUri,
    isTerminalEnabled,
    listQuery,
    isSearchLoading,
    fileEntries,
    displayEntries,
    parentUri,
    sortField,
    sortOrder,
    searchValue,
    isSearchOpen,
    showHidden,
    clipboardSize,
    transferDialogOpen,
    transferEntries,
    transferMode,
    isDragActive,
    canUndo,
    canRedo,
    searchContainerRef,
    searchInputRef,
    uploadInputRef,
    handleNavigate,
    setSearchValue,
    setIsSearchOpen,
    setShowHidden,
    handleSortByName,
    handleSortByTime,
    handleTransferDialogOpenChange,
    handleOpenTransferDialog,
    handleCopyPath,
    handleOpen,
    handleOpenInFileManager,
    handleCopyPathAtCurrent,
    handleOpenInFileManagerAtCurrent,
    handleOpenImage,
    handleOpenMarkdown,
    handleOpenCode,
    handleOpenPdf,
    handleOpenDoc,
    handleOpenSpreadsheet,
    handleOpenVideo,
    handleOpenBoard,
    handleOpenTerminal,
    handleOpenTerminalAtCurrent,
    renameEntry,
    handleDelete,
    handleDeleteBatch,
    handleDeletePermanent,
    handleDeletePermanentBatch,
    handleShowInfo,
    handleCreateFolder,
    handleCreateMarkdown,
    handleCreateBoard,
    handlePaste,
    handleUploadFiles,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleMoveToFolder,
    handleEntryDragStart,
    handleEntryDrop,
    undo,
    redo,
    refreshList,
  };
}
