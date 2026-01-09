"use client";

import { memo, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileSystemEntry } from "./file-system-utils";

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
  /** Create a new folder. */
  createFolder: MenuAction;
  /** Create a new board. */
  createBoard: MenuAction;
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
  onOpenChange,
  withMenuSelectGuard,
  actions,
}: FileSystemContextMenuProps) {
  const isMultiSelection = selectedEntries.length > 1;
  const toggleHiddenLabel = showHidden ? "✓ 显示隐藏" : "显示隐藏";

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
              <ContextMenuItem
                onSelect={withMenuSelectGuard(() =>
                  actions.openInFileManager(menuContextEntry)
                )}
              >
                在文件管理器中打开
              </ContextMenuItem>
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
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.createFolder)}>
              新建文件夹
            </ContextMenuItem>
            <ContextMenuItem disabled>新建文稿</ContextMenuItem>
            <ContextMenuItem onSelect={withMenuSelectGuard(actions.createBoard)}>
              新建画布
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={withMenuSelectGuard(actions.paste)}
              disabled={clipboardSize === 0}
            >
              粘贴
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});

FileSystemContextMenu.displayName = "FileSystemContextMenu";

export default FileSystemContextMenu;
