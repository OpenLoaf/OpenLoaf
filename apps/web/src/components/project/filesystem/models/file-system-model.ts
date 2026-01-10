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
  useTabs,
} from "@/hooks/use-tabs";
import { resolveServerUrl } from "@/utils/server-url";
import {
  BOARD_ASSETS_DIR_NAME,
  BOARD_INDEX_FILE_NAME,
  ensureBoardFolderName,
  getBoardDisplayName,
  isBoardFolderName,
} from "@/lib/file-name";
import { createEmptyBoardSnapshot } from "@/components/board/core/boardStorage";
import { readImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import {
  IGNORE_NAMES,
  buildChildUri,
  buildTeatimeFileUrl,
  buildUriFromRoot,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  FILE_DRAG_URIS_MIME,
  formatSize,
  formatTimestamp,
  getDisplayPathFromUri,
  getRelativePathFromUri,
  getUniqueName,
  parseTeatimeFileUrl,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import { useFileSystemHistory, type HistoryAction } from "./file-system-history";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { useDebounce } from "@/hooks/use-debounce";

// 用于“复制/粘贴”的内存剪贴板。
let fileClipboard: FileSystemEntry[] | null = null;

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
  handleOpenImage: (entry: FileSystemEntry) => void;
  handleOpenCode: (entry: FileSystemEntry) => void;
  handleOpenPdf: (entry: FileSystemEntry) => void;
  handleOpenDoc: (entry: FileSystemEntry) => void;
  handleOpenSpreadsheet: (entry: FileSystemEntry) => void;
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
    event: DragEvent<HTMLButtonElement>
  ) => void;
  handleEntryDrop: (
    target: FileSystemEntry,
    event: DragEvent<HTMLButtonElement>
  ) => Promise<number>;
  undo: () => void;
  redo: () => void;
  refreshList: () => void;
};

/** Resolve parent uri for the current folder. */
function getParentUri(rootUri?: string, currentUri?: string | null): string | null {
  if (!rootUri || !currentUri) return null;
  const rootUrl = new URL(rootUri);
  const currentUrl = new URL(currentUri);
  const rootParts = rootUrl.pathname.split("/").filter(Boolean);
  const currentParts = currentUrl.pathname.split("/").filter(Boolean);
  // 已到根目录时不再返回上级。
  if (currentParts.length <= rootParts.length) return null;
  const parentParts = currentParts.slice(0, -1);
  const parentUrl = new URL(rootUri);
  parentUrl.pathname = `/${parentParts.join("/")}`;
  return parentUrl.toString();
}

/** Resolve the parent directory uri for an entry. */
function getEntryParentUri(entry: FileSystemEntry): string | null {
  try {
    const url = new URL(entry.uri);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    // 中文注释：文件条目使用父目录作为终端工作目录。
    parts.pop();
    url.pathname = `/${parts.map((part) => encodeURIComponent(decodeURIComponent(part))).join("/")}`;
    return url.toString();
  } catch {
    return null;
  }
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
  const activeUri = currentUri ?? rootUri ?? null;
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
      activeUri
        ? {
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
      activeUri && debouncedSearchValue
        ? {
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
  const parentUri = getParentUri(rootUri, displayUri);
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
    () => (rootUri ? buildChildUri(rootUri, ".teatime-trash") : null),
    [rootUri]
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

  /** Refresh the current folder list. */
  const refreshList = useCallback(() => {
    if (!activeUri) return;
    queryClient.invalidateQueries({
      queryKey: trpc.fs.list.queryOptions({ uri: activeUri, includeHidden: showHidden }).queryKey,
    });
  }, [activeUri, queryClient, showHidden]);

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
        await renameMutation.mutateAsync({ from, to });
      },
      copy: async (from, to) => {
        await copyMutation.mutateAsync({ from, to });
      },
      mkdir: async (uri) => {
        await mkdirMutation.mutateAsync({ uri, recursive: true });
      },
      delete: async (uri) => {
        await deleteMutation.mutateAsync({ uri, recursive: true });
      },
      writeFile: async (uri, content) => {
        await writeFileMutation.mutateAsync({ uri, content });
      },
      trash: async (uri) => {
        const res = await window.teatimeElectron?.trashItem?.({ uri });
        if (!res?.ok) {
          throw new Error(res?.reason ?? "无法移动到回收站");
        }
      },
      refresh: refreshList,
    },
    historyKey
  );

  useEffect(() => {
    if (!projectId || !activeUri) return;
    const baseUrl = resolveServerUrl();
    const url = `${baseUrl}/fs/watch?projectId=${encodeURIComponent(
      projectId
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
  }, [projectId, activeUri, refreshList]);

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

  /** Copy file path to clipboard. */
  const handleCopyPath = async (entry: FileSystemEntry) => {
    await copyText(getDisplayPathFromUri(entry.uri));
    toast.success("已复制路径");
  };

  /** Open file/folder using platform integration. */
  const handleOpen = async (entry: FileSystemEntry) => {
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
    const res = await window.teatimeElectron?.openPath?.({ uri: entry.uri });
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
    const res =
      entry.kind === "folder"
        ? await window.teatimeElectron?.openPath?.({ uri: entry.uri })
        : await window.teatimeElectron?.showItemInFolder?.({ uri: entry.uri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件管理器");
    }
  };

  /** Open an image file inside the current tab stack. */
  const handleOpenImage = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(
        activeTabId,
        {
          id: entry.uri,
          component: "image-viewer",
          title: entry.name,
          params: {
            uri: entry.uri,
            name: entry.name,
            ext: entry.ext,
          },
        }
      );
    },
    [activeTabId, pushStackItem]
  );

  /** Open a code file inside the current tab stack. */
  const handleOpenCode = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: entry.uri,
        component: "code-viewer",
        title: entry.name,
        params: {
          uri: entry.uri,
          name: entry.name,
          ext: entry.ext,
          rootUri,
          projectId,
        },
      });
    },
    [activeTabId, pushStackItem, projectId, rootUri]
  );

  /** Open a PDF file inside the current tab stack. */
  const handleOpenPdf = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      if (!projectId || !rootUri) {
        toast.error("未找到项目路径");
        return;
      }
      const relativePath = getRelativePathFromUri(rootUri, entry.uri);
      if (!relativePath) {
        toast.error("无法解析PDF路径");
        return;
      }
      pushStackItem(activeTabId, {
        id: entry.uri,
        component: "pdf-viewer",
        title: entry.name,
        params: {
          uri: buildTeatimeFileUrl(projectId, relativePath),
          name: entry.name,
          ext: entry.ext,
          __customHeader: true,
        },
      });
    },
    [activeTabId, projectId, pushStackItem, rootUri]
  );

  /** Open a DOC file inside the current tab stack. */
  const handleOpenDoc = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: entry.uri,
        component: "doc-viewer",
        title: entry.name,
        params: {
          uri: entry.uri,
          name: entry.name,
          ext: entry.ext,
          __customHeader: true,
        },
      });
    },
    [activeTabId, pushStackItem]
  );

  /** Open a spreadsheet file inside the current tab stack. */
  const handleOpenSpreadsheet = useCallback(
    (entry: FileSystemEntry) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: entry.uri,
        component: "sheet-viewer",
        title: entry.name,
        params: {
          uri: entry.uri,
          name: entry.name,
          ext: entry.ext,
          __customHeader: true,
        },
      });
    },
    [activeTabId, pushStackItem]
  );

  /** Open a board folder inside the current tab stack. */
  const handleOpenBoard = useCallback(
    (entry: FileSystemEntry, options?: { pendingRename?: boolean }) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      if (entry.kind !== "folder" || !isBoardFolderName(entry.name)) {
        toast.error("当前画布目录无效");
        return;
      }
      const boardFolderUri = entry.uri;
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      const displayName = getBoardDisplayName(entry.name);
      pushStackItem(activeTabId, {
        id: entry.uri,
        component: "board-viewer",
        title: displayName,
        params: {
          uri: boardFolderUri,
          boardFolderUri,
          boardFileUri,
          name: entry.name,
          projectId,
          rootUri,
          __opaque: true,
          ...(options?.pendingRename ? { __pendingRename: true } : {}),
        },
      });
    },
    [activeTabId, projectId, pushStackItem, rootUri]
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
      const pwdUri =
        entry.kind === "folder" ? entry.uri : getEntryParentUri(entry);
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
    [activeTabId, isTerminalEnabled, pushStackItem, terminalStatus.isLoading]
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
    const fallbackUri = activeUri || rootUri;
    if (!fallbackUri) {
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
        __open: { pwdUri: fallbackUri },
      },
    });
  }, [
    activeTabId,
    activeUri,
    isTerminalEnabled,
    pushStackItem,
    rootUri,
    terminalStatus.isLoading,
  ]);

  /** Rename a file or folder with validation and history tracking. */
  const renameEntry = async (entry: FileSystemEntry, nextName: string) => {
    if (!activeUri) return null;
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
    await renameMutation.mutateAsync({ from: entry.uri, to: targetUri });
    pushHistory({ kind: "rename", from: entry.uri, to: targetUri });
    refreshList();
    return targetUri;
  };

  /** Delete file or folder. */
  const handleDelete = async (entry: FileSystemEntry) => {
    const ok = window.confirm(`确认删除「${entry.name}」？`);
    if (!ok) return;
    if (!trashRootUri) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 6);
    const trashName = `${stamp}-${suffix}-${entry.name}`;
    const trashUri = buildChildUri(trashRootUri, trashName);
    // 中文注释：非 Electron 端先挪进隐藏回收站，便于撤回。
    await mkdirMutation.mutateAsync({ uri: trashRootUri, recursive: true });
    await renameMutation.mutateAsync({ from: entry.uri, to: trashUri });
    pushHistory({ kind: "delete", uri: entry.uri, trashUri });
    refreshList();
  };

  /** Delete multiple files or folders with a single confirmation. */
  const handleDeleteBatch = async (entries: FileSystemEntry[]) => {
    if (entries.length === 0) return;
    const ok = window.confirm(`确认删除已选择的 ${entries.length} 项？`);
    if (!ok) return;
    if (!trashRootUri) return;
    await mkdirMutation.mutateAsync({ uri: trashRootUri, recursive: true });
    const actions: HistoryAction[] = [];
    for (const entry of entries) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const suffix = Math.random().toString(36).slice(2, 6);
      const trashName = `${stamp}-${suffix}-${entry.name}`;
      const trashUri = buildChildUri(trashRootUri, trashName);
      await renameMutation.mutateAsync({ from: entry.uri, to: trashUri });
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
    const ok = window.confirm(`彻底删除「${entry.name}」？此操作不可撤回。`);
    if (!ok) return;
    if (isElectron && window.teatimeElectron?.trashItem) {
      try {
        const res = await window.teatimeElectron.trashItem({ uri: entry.uri });
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
    await deleteMutation.mutateAsync({ uri: entry.uri, recursive: true });
    refreshList();
  };

  /** Permanently delete multiple entries with a single confirmation. */
  const handleDeletePermanentBatch = async (entries: FileSystemEntry[]) => {
    if (entries.length === 0) return;
    const ok = window.confirm(
      `彻底删除已选择的 ${entries.length} 项？此操作不可撤回。`
    );
    if (!ok) return;
    for (const entry of entries) {
      if (isElectron && window.teatimeElectron?.trashItem) {
        try {
          const res = await window.teatimeElectron.trashItem({ uri: entry.uri });
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
      await deleteMutation.mutateAsync({ uri: entry.uri, recursive: true });
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
    if (!activeUri) return null;
    // 以默认名称创建并做唯一性处理，避免覆盖已有目录。
    const targetName = getUniqueName("新建文件夹", new Set(existingNames));
    const targetUri = buildChildUri(activeUri, targetName);
    await mkdirMutation.mutateAsync({ uri: targetUri, recursive: true });
    pushHistory({ kind: "mkdir", uri: targetUri });
    refreshList();
    return { uri: targetUri, name: targetName };
  };

  /** Create a new board folder in the current directory. */
  const handleCreateBoard = async () => {
    if (!activeUri) return;
    const baseName = ensureBoardFolderName("新建画布");
    const targetName = getUniqueName(baseName, new Set(existingNames));
    const boardFolderUri = buildChildUri(activeUri, targetName);
    const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
    const assetsUri = buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME);
    const snapshot = createEmptyBoardSnapshot();
    // 中文注释：初始画布直接写入文件，保证后续保存落盘同一位置。
    const content = JSON.stringify(snapshot, null, 2);
    // 中文注释：画布采用文件夹结构，包含 index.ttboard 与 assets 子目录。
    await mkdirMutation.mutateAsync({ uri: boardFolderUri, recursive: true });
    await mkdirMutation.mutateAsync({ uri: assetsUri, recursive: true });
    await writeFileMutation.mutateAsync({ uri: boardFileUri, content });
    pushHistory({
      kind: "batch",
      actions: [
        { kind: "mkdir", uri: boardFolderUri },
        { kind: "mkdir", uri: assetsUri },
        { kind: "create", uri: boardFileUri, content },
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
    if (!activeUri) return;
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
      await copyMutation.mutateAsync({ from: entry.uri, to: targetUri });
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
    if (!targetUri || files.length === 0) return;
    const targetEntries =
      activeUri && targetUri === activeUri
        ? new Map(fileEntries.map((entry) => [entry.name, entry.kind]))
        : new Map(
            (
              await queryClient.fetchQuery(
                trpc.fs.list.queryOptions({
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
        uri: nextUri,
        contentBase64: base64,
      });
      targetEntries.set(file.name, "file");
      uploadedCount += 1;
    }
    if (uploadedCount > 0) {
      refreshList();
      toast.success("已添加文件");
    }
  };

  /** Import an image drag payload into the target folder. */
  const handleImportImagePayload = async (
    targetUri: string | null,
    payload: ReturnType<typeof readImageDragPayload>
  ): Promise<boolean> => {
    if (!targetUri || !payload) return false;
    try {
      const blob = await fetchBlobFromUri(payload.baseUri);
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
    const sourceUrl = new URL(source.uri);
    const targetUrl = new URL(target.uri);
    if (targetUrl.pathname.startsWith(sourceUrl.pathname)) {
      toast.error("无法移动到自身目录");
      return null;
    }
    let targetNames = options?.targetNames;
    if (!targetNames) {
      const targetList = await queryClient.fetchQuery(
        trpc.fs.list.queryOptions({ uri: target.uri, includeHidden: showHidden })
      );
      targetNames = new Set((targetList.entries ?? []).map((entry) => entry.name));
    }
    const targetName = getUniqueName(source.name, targetNames);
    targetNames.add(targetName);
    const targetUri = buildChildUri(target.uri, targetName);
    await renameMutation.mutateAsync({ from: source.uri, to: targetUri });
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
    event: DragEvent<HTMLButtonElement>
  ) => {
    if (!rootUri || !projectId) return;
    const relativePath = getRelativePathFromUri(rootUri, entry.uri);
    if (!relativePath) return;
    event.dataTransfer.setData(
      FILE_DRAG_REF_MIME,
      `${projectId}/${relativePath}`
    );
  };

  /** Handle drop onto a target entry. */
  const handleEntryDrop = async (
    target: FileSystemEntry,
    event: DragEvent<HTMLButtonElement>
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
      trpc.fs.list.queryOptions({ uri: target.uri, includeHidden: showHidden })
    );
    const targetNames = new Set(
      (targetList.entries ?? []).map((entry) => entry.name)
    );
    const actions: HistoryAction[] = [];
    for (const rawSourceUri of uniqueSourceUris) {
      let sourceUri = rawSourceUri;
      if (rawSourceUri.startsWith("teatime-file://")) {
        const parsed = parseTeatimeFileUrl(rawSourceUri);
        if (!parsed || !projectId || parsed.projectId !== projectId || !rootUri) {
          toast.error("无法移动跨项目文件");
          return 0;
        }
        sourceUri = buildUriFromRoot(rootUri, parsed.relativePath);
      }
      let source = fileEntries.find((item) => item.uri === sourceUri);
      if (!source) {
        const stat = await queryClient.fetchQuery(
          trpc.fs.stat.queryOptions({ uri: sourceUri })
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
    handleOpenImage,
    handleOpenCode,
    handleOpenPdf,
    handleOpenDoc,
    handleOpenSpreadsheet,
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
