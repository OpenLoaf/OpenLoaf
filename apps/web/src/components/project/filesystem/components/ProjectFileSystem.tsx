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
import {
  buildChildUri,
  getEntryExt,
  getParentRelativePath,
  getRelativePathFromUri,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import { sortEntriesByType } from "../utils/entry-sort";
import FileSystemContextMenu from "./FileSystemContextMenu";
import { FileSystemColumns } from "./FileSystemColumns";
import { FileSystemGrid } from "./FileSystemGrid";
import { FileSystemList } from "./FileSystemList";
import ProjectFileSystemTransferDialog from "./ProjectFileSystemTransferDialog";
import ProjectFileSystemTransferBar from "./ProjectFileSystemTransferBar";
import FileSystemGitTree from "./FileSystemGitTree";
import {
  ProjectFileSystemHeader,
  type ProjectBreadcrumbInfo,
} from "./ProjectFileSystemHeader";
import { DragDropOverlay } from "@/components/ui/tenas/drag-drop-overlay";
import { useProjectFileSystemModel } from "../models/file-system-model";
import { useFileSystemContextMenu } from "@/hooks/use-file-system-context-menu";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useFileRename } from "@/hooks/use-file-rename";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "./FileSystemEntryVisual";
import {
  BOARD_INDEX_FILE_NAME,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import BoardFileViewer from "@/components/board/BoardFileViewer";
import CodeViewer from "@/components/file/CodeViewer";
import DocViewer from "@/components/file/DocViewer";
import FileViewer from "@/components/file/FileViewer";
import ImageViewer from "@/components/file/ImageViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import PdfViewer from "@/components/file/PdfViewer";
import SheetViewer from "@/components/file/SheetViewer";

type ProjectFileSystemProps = {
  projectId?: string;
  rootUri?: string;
  currentUri?: string | null;
  /** Whether the file system data is loading. */
  isLoading?: boolean;
  /** Whether the current project is a git repository. */
  isGitProject?: boolean;
  projectLookup?: Map<string, ProjectBreadcrumbInfo>;
  onNavigate?: (nextUri: string) => void;
};

/** Persisted toolbar state for the file system view. */
type FileSystemToolbarState = {
  viewMode: "grid" | "list" | "columns" | "tree";
  sortField: "name" | "mtime" | null;
  sortOrder: "asc" | "desc" | null;
};

/** Default toolbar state for file system view. */
const DEFAULT_TOOLBAR_STATE: FileSystemToolbarState = {
  viewMode: "grid",
  sortField: "name",
  sortOrder: "asc",
};

/** Storage key prefix for file system toolbar settings. */
const FILE_SYSTEM_TOOLBAR_STORAGE_KEY = "tenas:fs:toolbar";

/** Resolve a parent uri from a file or folder uri. */
function resolveParentUriFromEntry(entry: FileSystemEntry): string | null {
  const parent = getParentRelativePath(entry.uri);
  // 逻辑：回退到父目录，保证工具栏操作落在可写目录。
  return parent;
}

/** Resolve a display label for the tree viewer. */
function resolveTreeViewerLabel(entry: FileSystemEntry): string {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Resolve sort priority for file system entries. */
/** Build storage key for the file system toolbar state. */
function buildFileSystemToolbarStorageKey(projectId?: string, rootUri?: string) {
  if (projectId) return `${FILE_SYSTEM_TOOLBAR_STORAGE_KEY}:${projectId}`;
  if (rootUri) return `${FILE_SYSTEM_TOOLBAR_STORAGE_KEY}:${encodeURIComponent(rootUri)}`;
  return `${FILE_SYSTEM_TOOLBAR_STORAGE_KEY}:global`;
}

/** Normalize persisted toolbar state payload. */
function normalizeFileSystemToolbarState(
  raw: Partial<FileSystemToolbarState> | null
): FileSystemToolbarState {
  if (!raw) return DEFAULT_TOOLBAR_STATE;
  const hasSortField = Object.prototype.hasOwnProperty.call(raw, "sortField");
  const hasSortOrder = Object.prototype.hasOwnProperty.call(raw, "sortOrder");
  const viewMode =
    raw.viewMode === "list" || raw.viewMode === "columns" || raw.viewMode === "tree"
      ? raw.viewMode
      : "grid";
  if (!hasSortField && !hasSortOrder) {
    return {
      viewMode,
      sortField: DEFAULT_TOOLBAR_STATE.sortField,
      sortOrder: DEFAULT_TOOLBAR_STATE.sortOrder,
    };
  }
  const sortField = raw.sortField === "name" || raw.sortField === "mtime" ? raw.sortField : null;
  const sortOrder = raw.sortOrder === "asc" || raw.sortOrder === "desc" ? raw.sortOrder : null;
  if (!sortField || !sortOrder) {
    return {
      viewMode,
      sortField: DEFAULT_TOOLBAR_STATE.sortField,
      sortOrder: DEFAULT_TOOLBAR_STATE.sortOrder,
    };
  }
  return { viewMode, sortField, sortOrder };
}

/** Read toolbar state from local storage. */
function readFileSystemToolbarState(key: string): FileSystemToolbarState {
  if (typeof window === "undefined") return DEFAULT_TOOLBAR_STATE;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_TOOLBAR_STATE;
    return normalizeFileSystemToolbarState(JSON.parse(raw) as Partial<FileSystemToolbarState>);
  } catch {
    return DEFAULT_TOOLBAR_STATE;
  }
}

/** Write toolbar state to local storage. */
function writeFileSystemToolbarState(
  key: string,
  state: FileSystemToolbarState
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore
  }
}


const ProjectFileSystem = memo(function ProjectFileSystem({
  projectId,
  rootUri,
  currentUri,
  isLoading,
  isGitProject,
  projectLookup,
  onNavigate,
}: ProjectFileSystemProps) {
  // 从本地缓存恢复文件系统工具栏状态。
  const toolbarStorageKey = useMemo(
    () => buildFileSystemToolbarStorageKey(projectId, rootUri),
    [projectId, rootUri]
  );
  const toolbarStateFromStorage = useMemo<FileSystemToolbarState>(
    () => readFileSystemToolbarState(toolbarStorageKey),
    [toolbarStorageKey]
  );
  const model = useProjectFileSystemModel({
    projectId,
    rootUri,
    currentUri,
    onNavigate,
    initialSortField: toolbarStateFromStorage.sortField,
    initialSortOrder: toolbarStateFromStorage.sortOrder,
  });
  const isTreeViewEnabled = isGitProject === true;
  const shouldDisableTreeView = isGitProject === false;
  /** Initial view mode based on storage and git availability. */
  const initialViewMode = useMemo(() => {
    if (toolbarStateFromStorage.viewMode === "tree" && shouldDisableTreeView) {
      return "grid";
    }
    return toolbarStateFromStorage.viewMode;
  }, [shouldDisableTreeView, toolbarStateFromStorage.viewMode]);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "columns" | "tree">(
    initialViewMode
  );
  const isListView = viewMode === "list";
  const isColumnsView = viewMode === "columns";
  const isTreeView = viewMode === "tree";
  // 当前工具栏状态快照，保持引用稳定以减少无效写入。
  const toolbarSnapshot = useMemo<FileSystemToolbarState>(
    () => ({
      viewMode,
      sortField: model.sortField,
      sortOrder: model.sortOrder,
    }),
    [model.sortField, model.sortOrder, viewMode]
  );
  const sortedDisplayEntries = useMemo(() => {
    return sortEntriesByType(model.displayEntries);
  }, [model.displayEntries]);
  /** Track current grid selection. */
  const {
    selectedUris,
    replaceSelection,
    toggleSelection,
    ensureSelected,
    clearSelection,
    applySelectionChange,
  } = useFileSelection();
  /** Track active entry in tree view. */
  const [treeSelectedEntry, setTreeSelectedEntry] = useState<FileSystemEntry | null>(
    null
  );
  /** Tree root display title. */
  const treeProjectTitle = rootUri ? projectLookup?.get(rootUri)?.title : undefined;
  /** Manage context menu state for the grid. */
  const {
    menuContextEntry,
    handleGridContextMenuCapture,
    handleContextMenuOpenChange,
    withMenuSelectGuard,
    clearContextTargetIfClosed,
    resetContextMenu,
  } = useFileSystemContextMenu({
    entries: isTreeView ? [] : sortedDisplayEntries,
    selectedUris,
    onReplaceSelection: replaceSelection,
  });
  /** Resolve macOS-specific modifier behavior. */
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    []
  );
  const searchShortcutLabel = isMac ? "⌘F" : "Ctrl F";
  const searchQuery = model.searchValue.trim();
  const isSearchVisible = model.isSearchOpen || searchQuery.length > 0;
  /** Manage rename state for file entries. */
  const {
    renamingUri,
    renamingValue,
    setRenamingValue,
    requestRename,
    requestRenameByInfo,
    handleRenamingSubmit,
    handleRenamingCancel,
  } = useFileRename({
    entries: model.fileEntries,
    allowRename: (entry) => model.fileEntries.some((item) => item.uri === entry.uri),
    onRename: model.renameEntry,
    onSelectionReplace: replaceSelection,
  });

  /** Resolve whether a click should toggle selection. */
  const shouldToggleSelection = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      // macOS 只使用 Command 键，避免 Ctrl 右键误触切换。
      return isMac ? event.metaKey : event.metaKey || event.ctrlKey;
    },
    [isMac]
  );

  /** Resolve selection mode for drag selection. */
  const resolveSelectionMode = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const toggle = isMac ? event.metaKey : event.metaKey || event.ctrlKey;
      // macOS 下忽略 Ctrl，避免右键菜单触发框选切换。
      return toggle ? "toggle" : "replace";
    },
    [isMac]
  );

  /** Handle name sorting. */
  const handleSortByNameClick = useCallback(() => {
    model.handleSortByName();
  }, [model]);

  /** Handle time sorting. */
  const handleSortByTimeClick = useCallback(() => {
    model.handleSortByTime();
  }, [model]);

  /** Switch between file system view modes. */
  const handleViewModeChange = useCallback(
    (nextMode: "grid" | "list" | "columns" | "tree") => {
      setViewMode(nextMode);
    },
    []
  );

  /** Select an entry inside the tree view. */
  const handleTreeEntrySelect = useCallback(
    (entry: FileSystemEntry) => {
      setTreeSelectedEntry(entry);
      replaceSelection([entry.uri]);
      clearContextTargetIfClosed();
      if (!onNavigate || !rootUri) return;
      // 逻辑：文件/画布定位到父目录，文件夹直接进入该目录。
      if (entry.kind === "folder" && !isBoardFolderName(entry.name)) {
        onNavigate(entry.uri);
        return;
      }
      const parentUri = resolveParentUriFromEntry(entry);
      if (parentUri) {
        onNavigate(parentUri);
      } else {
        onNavigate(rootUri);
      }
    },
    [clearContextTargetIfClosed, onNavigate, replaceSelection, rootUri]
  );

  /** Resolve selected entries from the current file list. */
  const resolveSelectedEntries = useCallback(
    (uris: Set<string>) => {
      if (uris.size === 0) return [];
      const index = new Map(sortedDisplayEntries.map((entry) => [entry.uri, entry]));
      const results: typeof sortedDisplayEntries = [];
      uris.forEach((uri) => {
        const entry = index.get(uri);
        if (entry) results.push(entry);
      });
      return results;
    },
    [sortedDisplayEntries]
  );

  /** Cache selected entries for context menu actions. */
  const selectedEntries = useMemo(
    () => {
      if (!isTreeView) return resolveSelectedEntries(selectedUris);
      if (!treeSelectedEntry) return [];
      if (!selectedUris.has(treeSelectedEntry.uri)) return [];
      return [treeSelectedEntry];
    },
    [isTreeView, resolveSelectedEntries, selectedUris, treeSelectedEntry]
  );
  /** Track preview visibility for fade transition. */
  const [isTreeViewerVisible, setIsTreeViewerVisible] = useState(true);
  const treeViewerInitRef = useRef(true);

  /** Resolve the viewer content for tree view selection. */
  const treeViewer = useMemo(() => {
    if (!treeSelectedEntry) {
      return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
    }
    const entry = treeSelectedEntry;
    const displayName = resolveTreeViewerLabel(entry);
    if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
      const boardFolderUri = entry.uri;
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      return (
        <BoardFileViewer
          boardFolderUri={boardFolderUri}
          boardFileUri={boardFileUri}
          projectId={projectId}
          rootUri={rootUri}
        />
      );
    }
    if (entry.kind === "folder") {
      return (
        <div className="h-full w-full p-4 text-muted-foreground">
          请选择文件以预览
        </div>
      );
    }
    const ext = getEntryExt(entry);
    // 逻辑：先匹配二进制类型，再回退到文本/默认预览。
    if (IMAGE_EXTS.has(ext)) {
      return (
        <ImageViewer
          uri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
        />
      );
    }
    if (MARKDOWN_EXTS.has(ext)) {
      return (
        <MarkdownViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          rootUri={rootUri}
          projectId={projectId}
        />
      );
    }
    if (CODE_EXTS.has(ext) || isTextFallbackExt(ext)) {
      return (
        <CodeViewer
          uri={entry.uri}
          name={displayName}
          ext={ext}
          rootUri={rootUri}
          projectId={projectId}
        />
      );
    }
    if (PDF_EXTS.has(ext)) {
      if (!projectId || !rootUri) {
        return <div className="h-full w-full p-4 text-destructive">未找到项目路径</div>;
      }
      const relativePath = getRelativePathFromUri(rootUri, entry.uri);
      if (!relativePath) {
        return <div className="h-full w-full p-4 text-destructive">无法解析PDF路径</div>;
      }
      const pdfUri = relativePath;
      return (
        <PdfViewer
          uri={pdfUri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
          rootUri={rootUri}
        />
      );
    }
    if (DOC_EXTS.has(ext)) {
      return (
        <DocViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
          rootUri={rootUri}
          readOnly
        />
      );
    }
    if (SPREADSHEET_EXTS.has(ext)) {
      return (
        <SheetViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
          rootUri={rootUri}
          readOnly
        />
      );
    }
    return (
      <FileViewer
        uri={entry.uri}
        name={displayName}
        ext={ext}
        projectId={projectId}
      />
    );
  }, [projectId, rootUri, treeSelectedEntry]);
  const treeViewerKey = treeSelectedEntry?.uri ?? "empty";

  useEffect(() => {
    if (!isTreeView) return;
    if (treeViewerInitRef.current) {
      treeViewerInitRef.current = false;
      return;
    }
    // 逻辑：切换预览内容时先淡出再淡入，降低视觉跳变。
    setIsTreeViewerVisible(false);
    const timer = window.setTimeout(() => {
      setIsTreeViewerVisible(true);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [isTreeView, treeViewerKey]);

  /** Handle left-click selection updates. */
  const handleEntryClick = useCallback(
    (entry: FileSystemEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (event.nativeEvent?.which && event.nativeEvent.which !== 1) return;
      if (isMac && event.ctrlKey) return;
      if (shouldToggleSelection(event)) {
        toggleSelection(entry.uri);
        clearContextTargetIfClosed();
        return;
      }
      replaceSelection([entry.uri]);
      clearContextTargetIfClosed();
    },
    [
      clearContextTargetIfClosed,
      isMac,
      replaceSelection,
      shouldToggleSelection,
      toggleSelection,
    ]
  );

  /** Handle selection updates from drag selection. */
  const handleSelectionChange = useCallback(
    (uris: string[], mode: "replace" | "toggle") => {
      applySelectionChange(uris, mode);
      clearContextTargetIfClosed();
    },
    [applySelectionChange, clearContextTargetIfClosed]
  );

  /** Preserve selection when starting a drag action. */
  const handleEntryDragStart = useCallback(
    (entry: FileSystemEntry, event: ReactDragEvent<HTMLElement>) => {
      ensureSelected(entry.uri);
      model.handleEntryDragStart(entry, event);
    },
    [ensureSelected, model]
  );

  /** Sync selection to the drop target after a successful move. */
  const handleEntryDrop = useCallback(
    async (entry: FileSystemEntry, event: ReactDragEvent<HTMLElement>) => {
      const movedCount = await model.handleEntryDrop(entry, event);
      if (movedCount > 0) {
        replaceSelection([entry.uri]);
      }
    },
    [model, replaceSelection]
  );

  /** Create a folder and enter rename mode. */
  const handleCreateFolder = async () => {
    const created = await model.handleCreateFolder();
    if (created) {
      requestRenameByInfo(created);
    }
  };

  /** Create a markdown document and enter rename mode. */
  const handleCreateDocument = async () => {
    const created = await model.handleCreateMarkdown();
    if (created) {
      requestRenameByInfo(created);
    }
  };

  useEffect(() => {
    if (!shouldDisableTreeView) return;
    if (!isTreeView) return;
    // 逻辑：非 Git 项目禁用树视图时，自动回退到网格视图。
    setViewMode("grid");
  }, [isTreeView, shouldDisableTreeView]);

  useEffect(() => {
    // 逻辑：切换项目时清空树选中状态，避免展示旧文件内容。
    setTreeSelectedEntry(null);
  }, [projectId, rootUri]);

  useEffect(() => {
    if (isTreeView) return;
    // 目录切换时重置选择与重命名状态，避免沿用旧目录的引用。
    clearSelection();
    handleRenamingCancel();
    resetContextMenu();
  }, [clearSelection, handleRenamingCancel, isTreeView, model.activeUri, resetContextMenu]);

  useEffect(() => {
    // 逻辑：切换项目根目录时重置选择与菜单状态。
    clearSelection();
    handleRenamingCancel();
    resetContextMenu();
  }, [clearSelection, handleRenamingCancel, resetContextMenu, rootUri]);

  useEffect(() => {
    writeFileSystemToolbarState(toolbarStorageKey, toolbarSnapshot);
  }, [toolbarSnapshot, toolbarStorageKey]);

  if (!rootUri) {
    return <div className="p-4 text-sm text-muted-foreground">未绑定项目目录</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* 文件系统面包屑与工具栏在面板上方渲染。 */}
      <ProjectFileSystemHeader
        isLoading={isLoading ?? false}
        rootUri={rootUri}
        currentUri={model.displayUri}
        projectLookup={projectLookup}
        onNavigate={model.handleNavigate}
        canUndo={model.canUndo}
        canRedo={model.canRedo}
        onUndo={model.undo}
        onRedo={model.redo}
        viewMode={viewMode}
        isTreeViewEnabled={isTreeViewEnabled}
        onViewModeChange={handleViewModeChange}
        sortField={model.sortField}
        sortOrder={model.sortOrder}
        onSortByName={handleSortByNameClick}
        onSortByTime={handleSortByTimeClick}
        onCreateFolder={handleCreateFolder}
        onCreateDocument={handleCreateDocument}
        onUploadFiles={model.handleUploadFiles}
        uploadInputRef={model.uploadInputRef}
        searchContainerRef={model.searchContainerRef}
        searchInputRef={model.searchInputRef}
        searchValue={model.searchValue}
        isSearchVisible={isSearchVisible}
        onSearchValueChange={model.setSearchValue}
        onSearchOpenChange={model.setIsSearchOpen}
        searchShortcutLabel={searchShortcutLabel}
      />
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <ProjectFileSystemTransferBar
          transfer={model.transferProgress}
          onRetry={model.handleRetryTransfer}
        />
        <FileSystemContextMenu
          menuContextEntry={menuContextEntry}
          selectedEntries={selectedEntries}
          showHidden={model.showHidden}
          clipboardSize={model.clipboardSize}
          showTerminal={model.isTerminalEnabled}
          onOpenChange={handleContextMenuOpenChange}
          withMenuSelectGuard={withMenuSelectGuard}
          actions={{
            openEntry: model.handleOpen,
            openInFileManager: model.handleOpenInFileManager,
            openInFileManagerAtCurrent: model.handleOpenInFileManagerAtCurrent,
            enterBoardFolder: (entry) => model.handleNavigate(entry.uri),
            openTerminal: model.handleOpenTerminal,
            openTransferDialog: model.handleOpenTransferDialog,
            copyPath: model.handleCopyPath,
            requestRename,
            deleteEntry: model.handleDelete,
            deleteEntries: model.handleDeleteBatch,
            deleteEntryPermanent: model.handleDeletePermanent,
            deleteEntriesPermanent: model.handleDeletePermanentBatch,
            showInfo: model.handleShowInfo,
            refreshList: model.refreshList,
            toggleHidden: () => model.setShowHidden((prev) => !prev),
            copyPathAtCurrent: model.handleCopyPathAtCurrent,
            createFolder: handleCreateFolder,
            createDocument: handleCreateDocument,
            createBoard: model.handleCreateBoard,
            openTerminalAtCurrent: model.handleOpenTerminalAtCurrent,
            paste: model.handlePaste,
          }}
        >
          {isTreeView ? (
            <div
              className="flex-1 min-h-0 h-full overflow-hidden bg-background"
              onDragEnter={model.handleDragEnter}
              onDragOver={model.handleDragOver}
              onDragLeave={model.handleDragLeave}
              onDrop={model.handleDrop}
            >
              <div className="flex h-full min-h-0">
                <div className="flex w-72 min-w-[220px] flex-col border-r border-border/70 bg-background">
                  <div className="flex-1 min-h-0 overflow-auto p-3">
                    <FileSystemGitTree
                      rootUri={rootUri}
                      projectId={model.projectId}
                      projectTitle={treeProjectTitle}
                      currentUri={model.displayUri}
                      selectedUris={selectedUris}
                      showHidden={model.showHidden}
                      sortField={model.sortField}
                      sortOrder={model.sortOrder}
                      dragProjectId={model.projectId}
                      dragRootUri={model.rootUri}
                      renamingUri={renamingUri}
                      renamingValue={renamingValue}
                      onRenamingChange={setRenamingValue}
                      onRenamingSubmit={handleRenamingSubmit}
                      onRenamingCancel={handleRenamingCancel}
                      onSelectEntry={handleTreeEntrySelect}
                      onContextMenuCapture={handleGridContextMenuCapture}
                      onEntryDragStart={handleEntryDragStart}
                      onEntryDrop={handleEntryDrop}
                    />
                  </div>
                </div>
                <div
                  className={`flex-1 min-h-0 overflow-hidden bg-background transition-opacity duration-200 ease-out ${
                    isTreeViewerVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  }`}
                >
                  <div key={treeViewerKey} className="h-full w-full">
                    {treeViewer}
                  </div>
                </div>
              </div>
            </div>
          ) : isListView ? (
            <div className="flex-1 min-h-0 h-full flex flex-col @container/fs-list">
              <div
                className="flex-1 min-h-0 overflow-hidden bg-background"
                onDragEnter={model.handleDragEnter}
                onDragOver={model.handleDragOver}
                onDragLeave={model.handleDragLeave}
                onDrop={model.handleDrop}
              >
                <div
                  key={model.activeUri ?? "root"}
                  className="min-h-full h-full"
                >
                  <FileSystemList
                    entries={sortedDisplayEntries}
                    isLoading={model.listQuery.isLoading}
                    isSearchLoading={model.isSearchLoading}
                    searchQuery={searchQuery}
                    projectId={model.projectId}
                    rootUri={rootUri}
                    parentUri={model.parentUri}
                    currentUri={model.displayUri}
                    includeHidden={model.showHidden}
                    dragProjectId={model.projectId}
                    dragRootUri={model.rootUri}
                    onNavigate={model.handleNavigate}
                    onOpenEntry={model.handleOpenEntry}
                    onOpenImage={model.handleOpenImage}
                    onOpenMarkdown={model.handleOpenMarkdown}
                    onOpenCode={model.handleOpenCode}
                    onOpenPdf={model.handleOpenPdf}
                    onOpenDoc={model.handleOpenDoc}
                    onOpenSpreadsheet={model.handleOpenSpreadsheet}
                    onOpenBoard={model.handleOpenBoard}
                    onCreateDocument={handleCreateDocument}
                    onCreateBoard={model.handleCreateBoard}
                    selectedUris={selectedUris}
                    onEntryClick={handleEntryClick}
                    onSelectionChange={handleSelectionChange}
                    resolveSelectionMode={resolveSelectionMode}
                    onGridContextMenuCapture={handleGridContextMenuCapture}
                    renamingUri={renamingUri}
                    renamingValue={renamingValue}
                    onRenamingChange={setRenamingValue}
                    onRenamingSubmit={handleRenamingSubmit}
                    onRenamingCancel={handleRenamingCancel}
                    onEntryDragStart={handleEntryDragStart}
                    onEntryDrop={handleEntryDrop}
                  />
                </div>
              </div>
            </div>
          ) : isColumnsView ? (
            <div
              className="flex-1 min-h-0 h-full overflow-hidden bg-background"
              onDragEnter={model.handleDragEnter}
              onDragOver={model.handleDragOver}
              onDragLeave={model.handleDragLeave}
              onDrop={model.handleDrop}
            >
              <div
                key={model.displayUri ?? "root"}
                className="min-h-full h-full"
              >
                <FileSystemColumns
                  entries={sortedDisplayEntries}
                  isLoading={model.listQuery.isLoading}
                  isSearchLoading={model.isSearchLoading}
                  searchQuery={searchQuery}
                  projectId={model.projectId}
                  rootUri={rootUri}
                  currentUri={model.displayUri}
                  includeHidden={model.showHidden}
                  sortField={model.sortField}
                  sortOrder={model.sortOrder}
                  dragProjectId={model.projectId}
                  dragRootUri={model.rootUri}
                  onNavigate={model.handleNavigate}
                  onOpenEntry={model.handleOpenEntry}
                  onOpenImage={model.handleOpenImage}
                  onOpenMarkdown={model.handleOpenMarkdown}
                  onOpenCode={model.handleOpenCode}
                  onOpenPdf={model.handleOpenPdf}
                  onOpenDoc={model.handleOpenDoc}
                  onOpenSpreadsheet={model.handleOpenSpreadsheet}
                  onOpenVideo={model.handleOpenVideo}
                  onOpenBoard={model.handleOpenBoard}
                  selectedUris={selectedUris}
                  onEntryClick={handleEntryClick}
                  onSelectionChange={handleSelectionChange}
                  resolveSelectionMode={resolveSelectionMode}
                  onGridContextMenuCapture={handleGridContextMenuCapture}
                  renamingUri={renamingUri}
                  renamingValue={renamingValue}
                  onRenamingChange={setRenamingValue}
                  onRenamingSubmit={handleRenamingSubmit}
                  onRenamingCancel={handleRenamingCancel}
                  onEntryDragStart={handleEntryDragStart}
                  onEntryDrop={handleEntryDrop}
                />
              </div>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 h-full overflow-auto bg-background p-4"
              onDragEnter={model.handleDragEnter}
              onDragOver={model.handleDragOver}
              onDragLeave={model.handleDragLeave}
              onDrop={model.handleDrop}
            >
              <div
                key={model.activeUri ?? "root"}
                className="min-h-full h-full"
              >
                <FileSystemGrid
                  entries={sortedDisplayEntries}
                  isLoading={model.listQuery.isLoading}
                  isSearchLoading={model.isSearchLoading}
                  searchQuery={searchQuery}
                  projectId={model.projectId}
                  rootUri={rootUri}
                  parentUri={model.parentUri}
                  currentUri={model.displayUri}
                  includeHidden={model.showHidden}
                  dragProjectId={model.projectId}
                  dragRootUri={model.rootUri}
                  onNavigate={model.handleNavigate}
                  onOpenEntry={model.handleOpenEntry}
                  onOpenImage={model.handleOpenImage}
                  onOpenMarkdown={model.handleOpenMarkdown}
                  onOpenCode={model.handleOpenCode}
                  onOpenPdf={model.handleOpenPdf}
                  onOpenDoc={model.handleOpenDoc}
                  onOpenSpreadsheet={model.handleOpenSpreadsheet}
                  onOpenVideo={model.handleOpenVideo}
                  onOpenBoard={model.handleOpenBoard}
                  onCreateDocument={handleCreateDocument}
                  onCreateBoard={model.handleCreateBoard}
                  selectedUris={selectedUris}
                  onEntryClick={handleEntryClick}
                  onSelectionChange={handleSelectionChange}
                  resolveSelectionMode={resolveSelectionMode}
                  onGridContextMenuCapture={handleGridContextMenuCapture}
                  renamingUri={renamingUri}
                  renamingValue={renamingValue}
                  onRenamingChange={setRenamingValue}
                  onRenamingSubmit={handleRenamingSubmit}
                  onRenamingCancel={handleRenamingCancel}
                  onEntryDragStart={handleEntryDragStart}
                  onEntryDrop={handleEntryDrop}
                />
              </div>
            </div>
          )}
        </FileSystemContextMenu>
        <DragDropOverlay
          open={model.isDragActive}
          title="松开鼠标即可添加文件"
          radiusClassName="rounded-2xl"
        />
      </section>
      <ProjectFileSystemTransferDialog
        open={model.transferDialogOpen}
        onOpenChange={model.handleTransferDialogOpenChange}
        entries={model.transferEntries}
        mode={model.transferMode}
        defaultRootUri={rootUri}
      />
    </div>
  );
});

export type { ProjectBreadcrumbInfo } from "./ProjectFileSystemHeader";
export default ProjectFileSystem;
