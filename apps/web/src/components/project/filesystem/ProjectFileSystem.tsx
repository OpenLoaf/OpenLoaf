"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateId } from "ai";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FolderPlus,
  LayoutGrid,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Redo2,
  Search,
  Undo2,
  Upload,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FileSystemGrid } from "./FileSystemGrid";
import ProjectFileSystemCopyDialog from "./ProjectFileSystemCopyDialog";
import { useFileSystemHistory, type HistoryAction } from "./file-system-history";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import {
  IGNORE_NAMES,
  buildUriFromRoot,
  buildChildUri,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  formatSize,
  formatTimestamp,
  getDisplayPathFromUri,
  getRelativePathFromUri,
  parseTeatimeFileUrl,
  getUniqueName,
  type FileSystemEntry,
} from "./file-system-utils";
import { useTabs } from "@/hooks/use-tabs";
import {
  BOARD_FILE_EXT,
  ensureBoardFileName,
  getDisplayFileName,
  isBoardFileExt,
} from "@/lib/file-name";
import { createEmptyBoardSnapshot } from "@/components/board/core/boardStorage";

// 用于“复制/粘贴”的内存剪贴板。
let fileClipboard: FileSystemEntry[] | null = null;

type ProjectFileSystemProps = {
  projectId?: string;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
};

type ProjectBreadcrumbInfo = {
  title: string;
  icon?: string;
};

type ProjectBreadcrumbItem = {
  label: string;
  uri: string;
};

type ProjectFileSystemBreadcrumbsProps = {
  isLoading: boolean;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
};

type ProjectFileSystemHeaderProps = {
  isLoading: boolean;
  pageTitle: string;
};

/** Build breadcrumb items for the project file system. */
function buildFileBreadcrumbs(
  rootUri?: string,
  currentUri?: string | null,
  projectLookup?: Map<string, ProjectBreadcrumbInfo>
): ProjectBreadcrumbItem[] {
  if (!rootUri || !currentUri) return [];
  const rootUrl = new URL(rootUri);
  const currentUrl = new URL(currentUri);
  const rootParts = rootUrl.pathname.split("/").filter(Boolean);
  const currentParts = currentUrl.pathname.split("/").filter(Boolean);
  const relativeParts = currentParts.slice(rootParts.length);
  const rootInfo = projectLookup?.get(rootUri);
  const rootName =
    rootInfo?.title ??
    decodePathSegment(rootParts[rootParts.length - 1] ?? rootUri);
  const items: ProjectBreadcrumbItem[] = [{ label: rootName, uri: rootUri }];
  let accumParts = [...rootParts];
  // 从 root 向下拼接，构建可点击的面包屑路径。
  for (const part of relativeParts) {
    accumParts = [...accumParts, part];
    const nextUrl = new URL(rootUri);
    nextUrl.pathname = `/${accumParts.join("/")}`;
    const nextUri = nextUrl.toString();
    const info = projectLookup?.get(nextUri);
    items.push({
      label: info?.title ?? decodePathSegment(part),
      uri: nextUri,
    });
  }
  return items;
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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

/** Project file system header. */
const ProjectFileSystemHeader = memo(function ProjectFileSystemHeader({
  isLoading,
  pageTitle,
}: ProjectFileSystemHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0 animate-in fade-in duration-200">
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

/** Project file system breadcrumbs. */
const ProjectFileSystemBreadcrumbs = memo(function ProjectFileSystemBreadcrumbs({
  isLoading,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
}: ProjectFileSystemBreadcrumbsProps) {
  const items = buildFileBreadcrumbs(rootUri, currentUri, projectLookup);
  const isVisible = !isLoading && items.length > 0;

  return (
    <div className="relative flex min-w-0 items-center">
      <div
        className={`flex items-center gap-2 min-w-0 transition-opacity duration-300 ease-out ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <Breadcrumb>
          <BreadcrumbList>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <Fragment key={item.uri}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>
                      <span>{item.label}</span>
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="cursor-pointer">
                      <button type="button" onClick={() => onNavigate?.(item.uri)}>
                        <span>{item.label}</span>
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div
        className={`absolute inset-y-0 left-0 flex items-center transition-opacity duration-300 ease-out ${
          isVisible ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <span className="h-5 w-36 rounded-md bg-muted/40" />
      </div>
    </div>
  );
});

const ProjectFileSystem = memo(function ProjectFileSystem({
  projectId,
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
}: ProjectFileSystemProps) {
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
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      activeUri
        ? {
            uri: activeUri,
            sort:
              sortField && sortOrder
                ? { field: sortField, order: sortOrder }
                : undefined,
          }
        : skipToken
    )
  );
  const entries = listQuery.data?.entries ?? [];
  const visibleEntries = entries.filter((entry) => !IGNORE_NAMES.has(entry.name));
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
      queryKey: trpc.fs.list.queryOptions({ uri: activeUri }).queryKey,
    });
  }, [activeUri, queryClient]);

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
      trpc.fs.list.queryOptions({ uri: target.uri })
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

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) return;
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) return;
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  if (!rootUri) {
    return <div className="p-4 text-sm text-muted-foreground">未绑定项目目录</div>;
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 ">
        {/* 顶部功能栏：路径导航 + 极简图标操作（仅 UI）。 */}
        <div className="flex items-center gap-3 border-b border-border/60 bg-secondary/30 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center">
            <ProjectFileSystemBreadcrumbs
              isLoading={listQuery.isLoading}
              rootUri={rootUri}
              currentUri={activeUri}
              projectLookup={projectLookup}
              onNavigate={handleNavigate}
            />
          </div>
        <div className="flex items-center gap-1">
            {canUndo || canRedo ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="撤回"
                  title="撤回"
                  disabled={!canUndo}
                  onClick={() => {
                    undo();
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="前进"
                  title="前进"
                  disabled={!canRedo}
                  onClick={() => {
                    redo();
                  }}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="切换排列方式"
              title="切换排列方式"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                sortField === "name" ? "bg-foreground/10 text-foreground" : ""
              }`}
              aria-label="按字母排序"
              title="按字母排序"
              onClick={handleSortByName}
            >
              {sortField === "name" && sortOrder === "desc" ? (
                <ArrowUpAZ className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownAZ className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                sortField === "mtime" ? "bg-foreground/10 text-foreground" : ""
              }`}
              aria-label="按时间排序"
              title="按时间排序"
              onClick={handleSortByTime}
            >
              {sortField === "mtime" && sortOrder === "asc" ? (
                <ArrowUpWideNarrow className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              )}
            </Button>
            <div className="mx-1 h-4 w-px bg-border/70" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="新建文件夹"
              title="新建文件夹"
              onClick={handleCreateFolder}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="添加文件"
              title="添加文件"
              onClick={() => {
                uploadInputRef.current?.click();
              }}
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length === 0) return;
                await handleUploadFiles(files);
                event.currentTarget.value = "";
              }}
            />
            <div ref={searchContainerRef} className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 transition-[width,opacity] duration-150 ${
                  isSearchOpen ? "w-0 opacity-0 pointer-events-none" : "opacity-100"
                }`}
                aria-label="搜索"
                title="搜索"
                onClick={() => setIsSearchOpen(true)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
              <div
                className={`relative overflow-hidden rounded-md ring-1 ring-border/60 bg-background/80 transition-[width,opacity,transform] duration-200 origin-right ${
                  isSearchOpen
                    ? "w-56 opacity-100 translate-x-0"
                    : "w-0 opacity-0 translate-x-2"
                }`}
              >
                <Input
                  ref={searchInputRef}
                  className="h-7 w-56 border-0 bg-transparent px-3 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="搜索文件或文件夹"
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsSearchOpen(false);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="flex-1 min-h-0 h-full overflow-auto p-4"
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div
                key={activeUri ?? "root"}
                className="min-h-full h-full animate-in fade-in slide-in-from-bottom-2 duration-200"
              >
                <FileSystemGrid
                  entries={displayEntries}
                  isLoading={listQuery.isLoading}
                  parentUri={parentUri}
                  dragProjectId={projectId}
                  dragRootUri={rootUri}
                  onNavigate={handleNavigate}
                  onOpenImage={handleOpenImage}
                  onOpenCode={handleOpenCode}
                  onOpenBoard={handleOpenBoard}
                  onCreateBoard={handleCreateBoard}
                  selectedUris={selectedUris}
                  onEntryClick={(entry, event) => {
                    // 中文注释：支持多选，按住 Command/Ctrl 可切换选择。
                    if (event.metaKey || event.ctrlKey) {
                      setSelectedUris((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.uri)) {
                          next.delete(entry.uri);
                        } else {
                          next.add(entry.uri);
                        }
                        setSelectedUri(next.size === 1 ? entry.uri : null);
                        return next;
                      });
                      return;
                    }
                    setSingleSelection(entry.uri);
                  }}
                  onEntryContextMenu={(entry, event) => {
                    event.stopPropagation();
                    // 中文注释：右键项未被选中时，先单选该项。
                    if (!selectedUris.has(entry.uri)) {
                      setSingleSelection(entry.uri);
                    }
                  }}
                  onSelectionChange={(uris, mode) => {
                    setSelectedUris((prev) => {
                      const next = mode === "toggle" ? new Set(prev) : new Set<string>();
                      for (const uri of uris) {
                        if (mode === "toggle") {
                          if (next.has(uri)) {
                            next.delete(uri);
                          } else {
                            next.add(uri);
                          }
                        } else {
                          next.add(uri);
                        }
                      }
                      setSelectedUri(next.size === 1 ? Array.from(next)[0] : null);
                      return next;
                    });
                  }}
                  renamingUri={renamingUri}
                  renamingValue={renamingValue}
                  onRenamingChange={setRenamingValue}
                  onRenamingSubmit={handleRenameSubmit}
                  onRenamingCancel={handleRenameCancel}
                onEntryDragStart={(entry, event) => {
                  if (!rootUri || !projectId) return;
                  const relativePath = getRelativePathFromUri(rootUri, entry.uri);
                  if (!relativePath) return;
                  event.dataTransfer.setData(
                    FILE_DRAG_REF_MIME,
                    `${projectId}/${relativePath}`
                  );
                }}
                  onEntryDrop={async (target, event) => {
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
                  }}
                renderEntry={(entry, card) => {
                  const isMultiSelect = selectedUris.size > 1;
                  return (
                    <ContextMenu key={entry.uri}>
                      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        {isMultiSelect ? (
                          <ContextMenuItem disabled>
                            已选择 {selectedUris.size} 项
                          </ContextMenuItem>
                        ) : (
                          <>
                            <ContextMenuItem onSelect={() => handleOpen(entry)}>
                              打开
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => handleOpenInFileManager(entry)}>
                              在文件管理器中打开
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => handleOpenCopyDialog(entry)}>
                              复制到
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => handleCopyPath(entry)}>
                              复制路径
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => handleRename(entry)}>
                              重命名
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => handleDelete(entry)}>
                              删除
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => handleDeletePermanent(entry)}
                            >
                              彻底删除
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => handleShowInfo(entry)}>
                              基本信息
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                }}
                />
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem onSelect={handleCreateFolder}>新建文件夹</ContextMenuItem>
            <ContextMenuItem disabled>新建文稿</ContextMenuItem>
            <ContextMenuItem onSelect={handleCreateBoard}>新建画布</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={refreshList}>刷新</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => {
                handlePaste();
              }}
              disabled={clipboardSize === 0}
            >
              粘贴
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <DragDropOverlay
          open={isDragActive}
          title="松开鼠标即可添加文件"
          radiusClassName="rounded-2xl"
        />
      </section>
      <ProjectFileSystemCopyDialog
        open={copyDialogOpen}
        onOpenChange={handleCopyDialogOpenChange}
        entry={copyEntry}
        defaultRootUri={rootUri}
      />
    </div>
  );
});

export type { ProjectBreadcrumbInfo };
export { ProjectFileSystemBreadcrumbs, ProjectFileSystemHeader };
export default ProjectFileSystem;
