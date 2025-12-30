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
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FileSystemGrid } from "./FileSystemGrid";
import ProjectFileSystemCopyDialog from "./ProjectFileSystemCopyDialog";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import {
  IGNORE_NAMES,
  buildChildUri,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  formatSize,
  formatTimestamp,
  getDisplayPathFromUri,
  getRelativePathFromUri,
  getUniqueName,
  type FileSystemEntry,
} from "./file-system-utils";

// 用于“复制/粘贴”的内存剪贴板。
let fileClipboard: FileSystemEntry[] | null = null;

type ProjectFileSystemProps = {
  projectId?: string;
  rootUri?: string;
  currentUri?: string | null;
  onNavigate?: (nextUri: string) => void;
};

type ProjectBreadcrumbInfo = {
  title: string;
};

type ProjectBreadcrumbItem = {
  label: string;
  uri: string;
};

type ProjectFileSystemHeaderProps = {
  isLoading: boolean;
  rootUri?: string;
  currentUri?: string | null;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
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
  rootUri,
  currentUri,
  projectLookup,
  onNavigate,
}: ProjectFileSystemHeaderProps) {
  if (isLoading) return null;
  const items = buildFileBreadcrumbs(rootUri, currentUri, projectLookup);
  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">文件</span>
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
  );
});

const ProjectFileSystem = memo(function ProjectFileSystem({
  projectId,
  rootUri,
  currentUri,
  onNavigate,
}: ProjectFileSystemProps) {
  const activeUri = currentUri ?? rootUri ?? null;
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );
  const queryClient = useQueryClient();
  const dragCounterRef = useRef(0);
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(activeUri ? { uri: activeUri } : skipToken)
  );
  const entries = listQuery.data?.entries ?? [];
  const visibleEntries = entries.filter((entry) => !IGNORE_NAMES.has(entry.name));
  const fileEntries = useMemo(() => visibleEntries as FileSystemEntry[], [visibleEntries]);
  const parentUri = getParentUri(rootUri, activeUri);
  const existingNames = useMemo(
    () => new Set(fileEntries.map((entry) => entry.name)),
    [fileEntries]
  );
  const [clipboardSize, setClipboardSize] = useState(fileClipboard?.length ?? 0);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyEntry, setCopyEntry] = useState<FileSystemEntry | null>(null);
  const [renameEntry, setRenameEntry] = useState<FileSystemEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const renameMutation = useMutation(trpc.fs.rename.mutationOptions());
  const deleteMutation = useMutation(trpc.fs.delete.mutationOptions());
  const copyMutation = useMutation(trpc.fs.copy.mutationOptions());
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());

  /** Refresh the current folder list. */
  const refreshList = useCallback(() => {
    if (!activeUri) return;
    queryClient.invalidateQueries({
      queryKey: trpc.fs.list.queryOptions({ uri: activeUri }).queryKey,
    });
  }, [activeUri, queryClient]);

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
    setSelectedUri(entry.uri);
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
    setSelectedUri(entry.uri);
    await copyText(getDisplayPathFromUri(entry.uri));
    toast.success("已复制路径");
  };

  /** Open file/folder using platform integration. */
  const handleOpen = async (entry: FileSystemEntry) => {
    setSelectedUri(entry.uri);
    if (entry.kind === "folder") {
      onNavigate?.(entry.uri);
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
    setSelectedUri(entry.uri);
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

  /** Open rename dialog. */
  const handleRename = (entry: FileSystemEntry) => {
    setSelectedUri(entry.uri);
    setRenameEntry(entry);
    setRenameValue(entry.name);
  };

  /** Submit rename action. */
  const handleRenameSubmit = async () => {
    if (!activeUri || !renameEntry) return;
    const nextName = renameValue.trim();
    if (!nextName || nextName === renameEntry.name) {
      setRenameEntry(null);
      return;
    }
    const targetUri = buildChildUri(activeUri, nextName);
    await renameMutation.mutateAsync({ from: renameEntry.uri, to: targetUri });
    refreshList();
    setRenameEntry(null);
  };

  /** Delete file or folder. */
  const handleDelete = async (entry: FileSystemEntry) => {
    setSelectedUri(entry.uri);
    const ok = window.confirm(`确认删除「${entry.name}」？`);
    if (!ok) return;
    await deleteMutation.mutateAsync({ uri: entry.uri, recursive: true });
    refreshList();
  };

  /** Show basic metadata for the entry. */
  const handleShowInfo = (entry: FileSystemEntry) => {
    setSelectedUri(entry.uri);
    const detail = [
      `类型：${entry.kind === "folder" ? "文件夹" : "文件"}`,
      `大小：${formatSize(entry.size)}`,
      `更新时间：${formatTimestamp(entry.updatedAt)}`,
      `路径：${getDisplayPathFromUri(entry.uri)}`,
    ].join("\n");
    toast.message("基本信息", { description: detail });
  };

  /** Paste copied files into the current directory. */
  const handlePaste = async () => {
    if (!activeUri) return;
    if (!fileClipboard || fileClipboard.length === 0) {
      toast.error("剪贴板为空");
      return;
    }
    const names = new Set(existingNames);
    for (const entry of fileClipboard) {
      const targetName = getUniqueName(entry.name, names);
      names.add(targetName);
      const targetUri = buildChildUri(activeUri, targetName);
      await copyMutation.mutateAsync({ from: entry.uri, to: targetUri });
    }
    refreshList();
    setClipboardSize(fileClipboard?.length ?? 0);
    toast.success("已粘贴");
  };

  /** Handle file drops from the OS. */
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    if (event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)) {
      return;
    }
    if (!activeUri) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
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
      (targetList.entries ?? []).map((entry: FileSystemEntry) => entry.name)
    );
    const targetName = getUniqueName(source.name, targetNames);
    const targetUri = buildChildUri(target.uri, targetName);
    await renameMutation.mutateAsync({ from: source.uri, to: targetUri });
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
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="flex-1 min-h-0 overflow-auto p-4"
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div
                key={activeUri ?? "root"}
                className="animate-in fade-in slide-in-from-bottom-2 duration-200"
              >
                <FileSystemGrid
                  entries={fileEntries}
                  isLoading={listQuery.isLoading}
                  parentUri={parentUri}
                  onNavigate={onNavigate}
                selectedUri={selectedUri}
                onEntryContextMenu={(entry, event) => {
                  event.stopPropagation();
                  setSelectedUri(entry.uri);
                }}
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
                  const sourceUri = event.dataTransfer.getData(FILE_DRAG_URI_MIME);
                  if (!sourceUri) return;
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
                renderEntry={(entry, card) => (
                  <ContextMenu key={entry.uri}>
                      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
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
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => handleShowInfo(entry)}>
                          基本信息
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )}
                />
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
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
      <Dialog
        open={Boolean(renameEntry)}
        onOpenChange={(open) => {
          if (open) return;
          setRenameEntry(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>请输入新的名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="filesystem-rename" className="text-right text-sm">
                名称
              </label>
              <Input
                id="filesystem-rename"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRenameSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleRenameSubmit}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export type { ProjectBreadcrumbInfo };
export { ProjectFileSystemHeader };
export default ProjectFileSystem;
