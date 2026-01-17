"use client";

import { memo, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { isBoardFolderName } from "@/lib/file-name";
import type { FileSystemEntry } from "../utils/file-system-utils";

/** Actions for file system context menu items. */
/** Generic menu action signature. */
type MenuAction = () => void | Promise<void>;
/** Menu action for a single entry. */
type MenuEntryAction = (entry: FileSystemEntry) => void | Promise<void>;
/** Menu action for multiple entries. */
type MenuEntriesAction = (entries: FileSystemEntry[]) => void | Promise<void>;

export type FileSystemContextMenuActions = {
  /** Open the entry. */
  openEntry: MenuEntryAction;
  /** Open the entry in the OS file manager. */
  openInFileManager: MenuEntryAction;
  /** Enter the board folder in the file list. */
  enterBoardFolder: MenuEntryAction;
  /** Open a terminal at the entry path. */
  openTerminal: MenuEntryAction;
  /** Open the transfer dialog. */
  openTransferDialog: (
    entries: FileSystemEntry | FileSystemEntry[],
    mode: "copy" | "move"
  ) => void | Promise<void>;
  /** Copy entry path to clipboard. */
  copyPath: MenuEntryAction;
  /** Request entry rename. */
  requestRename: MenuEntryAction;
  /** Delete a single entry. */
  deleteEntry: MenuEntryAction;
  /** Delete multiple entries. */
  deleteEntries: MenuEntriesAction;
  /** Permanently delete a single entry. */
  deleteEntryPermanent: MenuEntryAction;
  /** Permanently delete multiple entries. */
  deleteEntriesPermanent: MenuEntriesAction;
  /** Show entry info. */
  showInfo: MenuEntryAction;
  /** Refresh the grid list. */
  refreshList: MenuAction;
  /** Toggle hidden files visibility. */
  toggleHidden: MenuAction;
  /** Copy current directory path to clipboard. */
  copyPathAtCurrent: MenuAction;
  /** Create a new folder. */
  createFolder: MenuAction;
  /** Create a new board. */
  createBoard: MenuAction;
  /** Open a terminal at the current directory. */
  openTerminalAtCurrent: MenuAction;
  /** Open the current directory in the OS file manager. */
  openInFileManagerAtCurrent: MenuAction;
  /** Paste from clipboard. */
  paste: MenuAction;
};

/** Props for FileSystemContextMenu. */
export type FileSystemContextMenuProps = {
  /** Trigger content for the context menu. */
  children: ReactNode;
  /** Snapshot entry for the current menu. */
  menuContextEntry: FileSystemEntry | null;
  /** Selected entries for multi actions. */
  selectedEntries: FileSystemEntry[];
  /** Whether hidden files are visible. */
  showHidden: boolean;
  /** Current clipboard size. */
  clipboardSize: number;
  /** Whether to show terminal actions. */
  showTerminal: boolean;
  /** Context menu open change handler. */
  onOpenChange: (open: boolean) => void;
  /** Guarded menu item action wrapper. */
  withMenuSelectGuard: (handler: () => void | Promise<void>) => (event: Event) => void;
  /** Context menu actions. */
  actions: FileSystemContextMenuActions;
};

/** Render context menu content for the file system grid. */
const FileSystemContextMenu = memo(function FileSystemContextMenu({
  children,
  menuContextEntry,
  selectedEntries,
  showHidden,
  clipboardSize,
  showTerminal,
  onOpenChange,
  withMenuSelectGuard,
  actions,
}: FileSystemContextMenuProps) {
  const isMultiSelection = selectedEntries.length > 1;
  const toggleHiddenLabel = showHidden ? "✓ 显示隐藏" : "显示隐藏";
  const shouldShowEnterBoardFolder =
    menuContextEntry?.kind === "folder" && isBoardFolderName(menuContextEntry.name);

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={menuContextEntry ? "w-52" : "w-44"}>
        {menuContextEntry ? (
          isMultiSelection ? (
            <>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(selectedEntries, "copy")
                )}
              >
                复制到
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(selectedEntries, "move")
                )}
              >
                移动到
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() => actions.deleteEntries(selectedEntries))}
              >
                删除
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.deleteEntriesPermanent(selectedEntries)
                )}
              >
                彻底删除
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() => actions.openEntry(menuContextEntry))}
              >
                打开
              </ContextMenuItem>
              {shouldShowEnterBoardFolder ? (
                <ContextMenuItem
                  onSelect={withMenuSelectGuard(() =>
                    actions.enterBoardFolder(menuContextEntry)
                  )}
                >
                  进入画布文件夹
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.openInFileManager(menuContextEntry)
                )}
              >
                在文件管理器中打开
              </ContextMenuItem>
              {showTerminal ? (
                <ContextMenuItem
                  onSelect={withMenuSelectGuard(() => actions.openTerminal(menuContextEntry))}
                >
                  在终端中打开
                </ContextMenuItem>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(menuContextEntry, "copy")
                )}
              >
                复制到
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(menuContextEntry, "move")
                )}
              >
                移动到
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() => actions.copyPath(menuContextEntry))}
              >
                复制路径
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() => actions.requestRename(menuContextEntry))}
              >
                重命名
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() => actions.deleteEntry(menuContextEntry))}
              >
                删除
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.deleteEntryPermanent(menuContextEntry)
                )}
              >
                彻底删除
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() => actions.showInfo(menuContextEntry))}
              >
                基本信息
              </ContextMenuItem>
            </>
          )
        ) : (
          <>
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.refreshList)}>
              刷新
            </ContextMenuItem>
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.toggleHidden)}>
              {toggleHiddenLabel}
            </ContextMenuItem>
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.copyPathAtCurrent)}>
              复制路径
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={withMenuSelectGuard(actions.paste)}
              disabled={clipboardSize === 0}
            >
              粘贴
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.createFolder)}>
              新建文件夹
            </ContextMenuItem>
            <ContextMenuItem disabled>新建文稿</ContextMenuItem>
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.createBoard)}>
              新建画布
            </ContextMenuItem>
            <ContextMenuSeparator />
            {showTerminal ? (
              <ContextMenuItem onSelect={withMenuSelectGuard(actions.openTerminalAtCurrent)}>
                在终端中打开
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem
              onSelect={withMenuSelectGuard(actions.openInFileManagerAtCurrent)}
            >
              在文件管理器中打开
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});

FileSystemContextMenu.displayName = "FileSystemContextMenu";

export default FileSystemContextMenu;
