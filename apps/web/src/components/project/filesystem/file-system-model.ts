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
import { useTabs } from "@/hooks/use-tabs";
import {
  BOARD_FILE_EXT,
  ensureBoardFileName,
  getDisplayFileName,
  isBoardFileExt,
} from "@/lib/file-name";
import { createEmptyBoardSnapshot } from "@/components/board/core/boardStorage";
import {
  IGNORE_NAMES,
  buildChildUri,
  buildTeatimeFileUrl,
  buildUriFromRoot,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  formatSize,
  formatTimestamp,
  getDisplayPathFromUri,
  getRelativePathFromUri,
  getUniqueName,
  parseTeatimeFileUrl,
  type FileSystemEntry,
} from "./file-system-utils";
import { useFileSystemHistory, type HistoryAction } from "./file-system-history";

// 用于“复制/粘贴”的内存剪贴板。
let fileClipboard: FileSystemEntry[] | null = null;

export type ProjectFileSystemModelArgs = {
  projectId?: string;
  rootUri?: string;
  currentUri?: string | null;
  onNavigate?: (nextUri: string) => void;
};

export type ProjectFileSystemModel = {
  projectId?: string;
  rootUri?: string;
  activeUri: string | null;
  listQuery: ReturnType<typeof useQuery>;
  fileEntries: FileSystemEntry[];
  displayEntries: FileSystemEntry[];
  parentUri: string | null;
  sortField: "name" | "mtime" | null;
  sortOrder: "asc" | "desc" | null;
  searchValue: string;
  isSearchOpen: boolean;
  showHidden: boolean;
  clipboardSize: number;
  copyDialogOpen: boolean;
  copyEntry: FileSystemEntry | null;
  renamingUri: string | null;
  renamingValue: string;
  selectedUri: string | null;
  selectedUris: Set<string>;
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
  setSelectedUris: Dispatch<SetStateAction<Set<string>>>;
  setSelectedUri: Dispatch<SetStateAction<string | null>>;
  setSingleSelection: (uri: string | null) => void;
  setRenamingValue: (value: string) => void;
  handleSortByName: () => void;
  handleSortByTime: () => void;
  handleCopyDialogOpenChange: (open: boolean) => void;
  handleOpenCopyDialog: (entry: FileSystemEntry) => void;
  handleCopyPath: (entry: FileSystemEntry) => Promise<void>;
  handleOpen: (entry: FileSystemEntry) => Promise<void>;
  handleOpenInFileManager: (entry: FileSystemEntry) => Promise<void>;
  handleOpenImage: (entry: FileSystemEntry) => void;
  handleOpenCode: (entry: FileSystemEntry) => void;
  handleOpenPdf: (entry: FileSystemEntry) => void;
  handleOpenDoc: (entry: FileSystemEntry) => void;
  handleOpenSpreadsheet: (entry: FileSystemEntry) => void;
  handleOpenBoard: (entry: FileSystemEntry, options?: { pendingRename?: boolean }) => void;
  handleRename: (entry: FileSystemEntry) => void;
  handleRenameSubmit: () => Promise<void>;
  handleRenameCancel: () => void;
  handleDelete: (entry: FileSystemEntry) => Promise<void>;
  handleDeletePermanent: (entry: FileSystemEntry) => Promise<void>;
  handleShowInfo: (entry: FileSystemEntry) => void;
  handleCreateFolder: () => Promise<void>;
  handleCreateBoard: () => Promise<void>;
  handlePaste: () => Promise<void>;
  handleUploadFiles: (files: File[]) => Promise<void>;
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
  ) => Promise<void>;
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

/** Build project file system state and actions. */
export function useProjectFileSystemModel({
  projectId,
  rootUri,
  currentUri,
  onNavigate,
}: ProjectFileSystemModelArgs): ProjectFileSystemModel {
  const activeUri = currentUri ?? rootUri ?? null;
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const dragCounterRef = useRef(0);
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const [sortField, setSortField] = useState<"name" | "mtime" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
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
    )
  );
  const entries = listQuery.data?.entries ?? [];
  const visibleEntries = showHidden
    ? entries
    : entries.filter((entry) => !IGNORE_NAMES.has(entry.name));
  const fileEntries = useMemo(() => visibleEntries as FileSystemEntry[], [visibleEntries]);
  const displayEntries = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return fileEntries;
    return fileEntries.filter((entry) => {
      const displayName = getDisplayFileName(entry.name, entry.ext).toLowerCase();
      return displayName.includes(query);
    });
  }, [fileEntries, searchValue]);
  const parentUri = getParentUri(rootUri, activeUri);
  const existingNames = useMemo(
    () => new Set(fileEntries.map((entry) => entry.name)),
    [fileEntries]
  );
  const [clipboardSize, setClipboardSize] = useState(fileClipboard?.length ?? 0);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyEntry, setCopyEntry] = useState<FileSystemEntry | null>(null);
  // Inline rename state.
  const [renamingUri, setRenamingUri] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  // 当前聚焦项，用于单选与重命名定位。
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  // 多选集合，用于多选高亮与菜单状态判断。
  const [selectedUris, setSelectedUris] = useState<Set<string>>(() => new Set());
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

  /** Update selection to a single entry. */
  const setSingleSelection = useCallback((uri: string | null) => {
    setSelectedUri(uri);
    setSelectedUris(uri ? new Set([uri]) : new Set());
  }, []);

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
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
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
      setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isSearchOpen]);

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
  }, [canRedo, canUndo, redo, undo]);

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

  /** Open copy-to dialog. */
  const handleOpenCopyDialog = (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
    fileClipboard = [entry];
    setClipboardSize(fileClipboard.length);
    setCopyEntry(entry);
    setCopyDialogOpen(true);
  };

  /** Reset copy dialog state on close. */
  const handleCopyDialogOpenChange = (open: boolean) => {
    setCopyDialogOpen(open);
    if (!open) {
      setCopyEntry(null);
    }
  };

  /** Copy file path to clipboard. */
  const handleCopyPath = async (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
    await copyText(getDisplayPathFromUri(entry.uri));
    toast.success("已复制路径");
  };

  /** Open file/folder using platform integration. */
  const handleOpen = async (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
    if (entry.kind === "file" && isBoardFileExt(entry.ext)) {
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
    setSingleSelection(entry.uri);
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
      setSingleSelection(entry.uri);
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(
        activeTabId,
        {
          id: generateId(),
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
    [activeTabId, pushStackItem, setSingleSelection]
  );

  /** Open a code file inside the current tab stack. */
  const handleOpenCode = useCallback(
    (entry: FileSystemEntry) => {
      setSingleSelection(entry.uri);
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: generateId(),
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
    [activeTabId, pushStackItem, projectId, rootUri, setSingleSelection]
  );

  /** Open a PDF file inside the current tab stack. */
  const handleOpenPdf = useCallback(
    (entry: FileSystemEntry) => {
      setSingleSelection(entry.uri);
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
        id: generateId(),
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
    [activeTabId, projectId, pushStackItem, rootUri, setSingleSelection]
  );

  /** Open a DOC file inside the current tab stack. */
  const handleOpenDoc = useCallback(
    (entry: FileSystemEntry) => {
      setSingleSelection(entry.uri);
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: generateId(),
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
    [activeTabId, pushStackItem, setSingleSelection]
  );

  /** Open a spreadsheet file inside the current tab stack. */
  const handleOpenSpreadsheet = useCallback(
    (entry: FileSystemEntry) => {
      setSingleSelection(entry.uri);
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: generateId(),
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
    [activeTabId, pushStackItem, setSingleSelection]
  );

  /** Open a board file inside the current tab stack. */
  const handleOpenBoard = useCallback(
    (entry: FileSystemEntry, options?: { pendingRename?: boolean }) => {
      setSingleSelection(entry.uri);
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      pushStackItem(activeTabId, {
        id: generateId(),
        component: "board-viewer",
        title: getDisplayFileName(entry.name, entry.ext),
        params: {
          uri: entry.uri,
          name: entry.name,
          ext: entry.ext,
          __opaque: true,
          ...(options?.pendingRename ? { __pendingRename: true } : {}),
        },
      });
    },
    [activeTabId, pushStackItem, setSingleSelection]
  );

  /** Start inline rename for a file or folder. */
  const handleRename = (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
    const displayName = getDisplayFileName(entry.name, entry.ext);
    setRenamingUri(entry.uri);
    setRenamingValue(displayName);
  };

  /** Submit inline rename changes. */
  const handleRenameSubmit = async () => {
    if (!activeUri || !renamingUri) return;
    const targetEntry = fileEntries.find((entry) => entry.uri === renamingUri);
    if (!targetEntry) {
      setRenamingUri(null);
      return;
    }
    const rawName = renamingValue.trim();
    if (!rawName) {
      setRenamingUri(null);
      return;
    }
    const nextName = isBoardFileExt(targetEntry.ext)
      ? ensureBoardFileName(rawName)
      : rawName;
    if (nextName === targetEntry.name) {
      setRenamingUri(null);
      return;
    }
    const targetUri = buildChildUri(activeUri, nextName);
    await renameMutation.mutateAsync({ from: targetEntry.uri, to: targetUri });
    pushHistory({ kind: "rename", from: targetEntry.uri, to: targetUri });
    setSelectedUri(targetUri);
    refreshList();
    setRenamingUri(null);
  };

  /** Cancel inline rename changes. */
  const handleRenameCancel = () => {
    setRenamingUri(null);
  };

  /** Delete file or folder. */
  const handleDelete = async (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
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

  /** Permanently delete (system trash if available). */
  const handleDeletePermanent = async (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
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

  /** Show basic metadata for the entry. */
  const handleShowInfo = (entry: FileSystemEntry) => {
    setSingleSelection(entry.uri);
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
    if (!activeUri) return;
    // 以默认名称创建并做唯一性处理，避免覆盖已有目录。
    const targetName = getUniqueName("新建文件夹", new Set(existingNames));
    const targetUri = buildChildUri(activeUri, targetName);
    await mkdirMutation.mutateAsync({ uri: targetUri, recursive: true });
    pushHistory({ kind: "mkdir", uri: targetUri });
    setSingleSelection(targetUri);
    setRenamingUri(targetUri);
    setRenamingValue(targetName);
    refreshList();
  };

  /** Create a new board file in the current directory. */
  const handleCreateBoard = async () => {
    if (!activeUri) return;
    const targetName = getUniqueName(`新建画布.${BOARD_FILE_EXT}`, new Set(existingNames));
    const targetUri = buildChildUri(activeUri, targetName);
    const snapshot = createEmptyBoardSnapshot();
    // 中文注释：初始画布直接写入文件，保证后续保存落盘同一位置。
    const content = JSON.stringify(snapshot, null, 2);
    await writeFileMutation.mutateAsync({ uri: targetUri, content });
    pushHistory({ kind: "create", uri: targetUri, content });
    setSingleSelection(targetUri);
    refreshList();
    handleOpenBoard(
      {
        uri: targetUri,
        name: targetName,
        kind: "file",
        ext: BOARD_FILE_EXT,
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

  /** Upload files into the current directory. */
  const handleUploadFiles = async (files: File[]) => {
    if (!activeUri || files.length === 0) return;
    for (const file of files) {
      const targetUri = buildChildUri(activeUri, file.name);
      const base64 = await readFileAsBase64(file);
      await writeBinaryMutation.mutateAsync({
        uri: targetUri,
        contentBase64: base64,
      });
    }
    refreshList();
    toast.success("已上传文件");
  };

  /** Handle file drops from the OS. */
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) {
      return;
    }
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
    if (sortOrder === "asc") {
      setSortOrder("desc");
      return;
    }
    setSortField(null);
    setSortOrder(null);
  };

  /** Toggle sort by time. */
  const handleSortByTime = () => {
    if (sortField !== "mtime") {
      setSortField("mtime");
      setSortOrder("desc");
      return;
    }
    if (sortOrder === "desc") {
      setSortOrder("asc");
      return;
    }
    setSortField(null);
    setSortOrder(null);
  };

  /** Move a file/folder into another folder. */
  const handleMoveToFolder = async (
    source: FileSystemEntry,
    target: FileSystemEntry
  ) => {
    if (source.kind === "folder" && source.uri === target.uri) return;
    if (source.uri === target.uri) return;
    const sourceUrl = new URL(source.uri);
    const targetUrl = new URL(target.uri);
    if (targetUrl.pathname.startsWith(sourceUrl.pathname)) {
      toast.error("无法移动到自身目录");
      return;
    }
    const targetList = await queryClient.fetchQuery(
      trpc.fs.list.queryOptions({ uri: target.uri, includeHidden: showHidden })
    );
    const targetNames = new Set(
      (targetList.entries ?? []).map((entry) => entry.name)
    );
    const targetName = getUniqueName(source.name, targetNames);
    const targetUri = buildChildUri(target.uri, targetName);
    await renameMutation.mutateAsync({ from: source.uri, to: targetUri });
    pushHistory({ kind: "rename", from: source.uri, to: targetUri });
    setSingleSelection(targetUri);
    refreshList();
  };

  /** Track drag enter for upload overlay. */
  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) return;
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  /** Track drag over for upload overlay. */
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) return;
  };

  /** Track drag leave for upload overlay. */
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) return;
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
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rawSourceUri = event.dataTransfer.getData(FILE_DRAG_URI_MIME);
    if (!rawSourceUri) return;
    let sourceUri = rawSourceUri;
    if (rawSourceUri.startsWith("teatime-file://")) {
      const parsed = parseTeatimeFileUrl(rawSourceUri);
      if (!parsed || !projectId || parsed.projectId !== projectId || !rootUri) {
        toast.error("无法移动跨项目文件");
        return;
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
    await handleMoveToFolder(source, target);
  };

  return {
    projectId,
    rootUri,
    activeUri,
    listQuery,
    fileEntries,
    displayEntries,
    parentUri,
    sortField,
    sortOrder,
    searchValue,
    isSearchOpen,
    showHidden,
    clipboardSize,
    copyDialogOpen,
    copyEntry,
    renamingUri,
    renamingValue,
    selectedUri,
    selectedUris,
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
    setSelectedUris,
    setSelectedUri,
    setSingleSelection,
    setRenamingValue,
    handleSortByName,
    handleSortByTime,
    handleCopyDialogOpenChange,
    handleOpenCopyDialog,
    handleCopyPath,
    handleOpen,
    handleOpenInFileManager,
    handleOpenImage,
    handleOpenCode,
    handleOpenPdf,
    handleOpenDoc,
    handleOpenSpreadsheet,
    handleOpenBoard,
    handleRename,
    handleRenameSubmit,
    handleRenameCancel,
    handleDelete,
    handleDeletePermanent,
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
