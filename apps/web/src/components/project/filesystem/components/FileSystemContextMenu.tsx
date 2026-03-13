/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { memo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { isBoardFolderName } from "@/lib/file-name";
import {
  ArrowRightLeft,
  ArrowUpRight,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Info,
  LayoutGrid,
  PencilLine,
  RotateCw,
  Terminal,
  Trash,
  Trash2,
} from "lucide-react";
import type { FileSystemEntry } from "../utils/file-system-utils";

/** Actions for file system context menu items. */
/** Generic menu action signature. */
type MenuAction = () => void | Promise<void>;
/** Menu action with optional target uri. */
type MenuTargetAction = (targetUri?: string | null) => void | Promise<void>;
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
  /** Convert a folder into a child project. */
  convertFolderToSubproject: MenuEntryAction;
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
  /** Refresh the grid list and thumbnails. */
  refreshList: MenuTargetAction;
  /** Toggle hidden files visibility. */
  toggleHidden: MenuAction;
  /** Copy current directory path to clipboard. */
  copyPathAtCurrent: MenuAction;
  /** Create a new folder. */
  createFolder: MenuAction;
  /** Create a new markdown document. */
  createDocument: MenuAction;
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
  /** Whether current scope can convert folders into child projects. */
  canConvertToSubproject: boolean;
  /** Context menu open change handler. */
  onOpenChange: (open: boolean) => void;
  /** Guarded menu item action wrapper. */
  withMenuSelectGuard: (handler: () => void | Promise<void>) => (event: Event) => void;
  /** Context menu actions. */
  actions: FileSystemContextMenuActions;
};

const FILESYSTEM_MENU_ICON_CLASS = {
  info: "text-ol-blue",
  success: "text-ol-green",
  warning: "text-ol-amber",
  danger: "text-ol-red",
  accent: "text-ol-purple",
  neutral: "text-ol-text-auxiliary",
} as const;

/** Render context menu content for the file system grid. */
const FileSystemContextMenu = memo(function FileSystemContextMenu({
  children,
  menuContextEntry,
  selectedEntries,
  showHidden,
  clipboardSize,
  showTerminal,
  canConvertToSubproject,
  onOpenChange,
  withMenuSelectGuard,
  actions,
}: FileSystemContextMenuProps) {
  const { t } = useTranslation(['project']);
  const isMultiSelection = selectedEntries.length > 1;
  const toggleHiddenLabel = showHidden ? t('project:filesystem.showHiddenActive') : t('project:filesystem.showHidden');
  const shouldShowEnterBoardFolder =
    menuContextEntry?.kind === "folder" && isBoardFolderName(menuContextEntry.name);
  const shouldShowEntryFileManager =
    menuContextEntry?.kind === "folder";
  const shouldShowEntryTerminal =
    showTerminal && menuContextEntry?.kind === "folder";
  const shouldShowConvertToSubproject =
    canConvertToSubproject && menuContextEntry?.kind === "folder";

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={menuContextEntry ? "w-52" : "w-44"}>
        {menuContextEntry ? (
          isMultiSelection ? (
            <>
              <ContextMenuItem
                icon={Copy}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.accent}
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(selectedEntries, "copy")
                )}
              >
                {t('project:filesystem.copyTo')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={ArrowRightLeft}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.accent}
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(selectedEntries, "move")
                )}
              >
                {t('project:filesystem.moveTo')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={Trash2}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.danger}
                onSelect={withMenuSelectGuard(() => actions.deleteEntries(selectedEntries))}
              >
                {t('project:filesystem.delete')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={Trash}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.danger}
                onSelect={withMenuSelectGuard(() =>
                  actions.deleteEntriesPermanent(selectedEntries)
                )}
              >
                {t('project:filesystem.permanentDelete')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={RotateCw}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.success}
                onSelect={withMenuSelectGuard(() =>
                  actions.refreshList(
                    menuContextEntry?.kind === "folder" ? menuContextEntry.uri : undefined
                  )
                )}
              >
                {t('project:filesystem.refresh')}
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem
                icon={ArrowUpRight}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
                onSelect={withMenuSelectGuard(() => actions.openEntry(menuContextEntry))}
              >
                {t('project:filesystem.open')}
              </ContextMenuItem>
              {shouldShowEnterBoardFolder ? (
                <ContextMenuItem
                  icon={LayoutGrid}
                  iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
                  onSelect={withMenuSelectGuard(() =>
                    actions.enterBoardFolder(menuContextEntry)
                  )}
                >
                  {t('project:filesystem.enterBoardFolder')}
                </ContextMenuItem>
              ) : null}
              {shouldShowEntryFileManager ? (
                <ContextMenuItem
                  icon={FolderOpen}
                  iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
                  onSelect={withMenuSelectGuard(() =>
                    actions.openInFileManager(menuContextEntry)
                  )}
                >
                  {t('project:filesystem.openInFileManager')}
                </ContextMenuItem>
              ) : null}
              {shouldShowEntryTerminal ? (
                <ContextMenuItem
                  icon={Terminal}
                  iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
                  onSelect={withMenuSelectGuard(() => actions.openTerminal(menuContextEntry))}
                >
                  {t('project:filesystem.openInTerminal')}
                </ContextMenuItem>
              ) : null}
              {shouldShowConvertToSubproject ? (
                <ContextMenuItem
                  icon={FolderPlus}
                  iconClassName={FILESYSTEM_MENU_ICON_CLASS.success}
                  onSelect={withMenuSelectGuard(() =>
                    actions.convertFolderToSubproject(menuContextEntry)
                  )}
                >
                  {t('project:filesystem.convertToSubproject')}
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                icon={RotateCw}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.success}
                onSelect={withMenuSelectGuard(() =>
                  actions.refreshList(
                    menuContextEntry.kind === "folder" ? menuContextEntry.uri : undefined
                  )
                )}
              >
                {t('project:filesystem.refresh')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={Copy}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.accent}
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(menuContextEntry, "copy")
                )}
              >
                {t('project:filesystem.copyTo')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={ArrowRightLeft}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.accent}
                onSelect={withMenuSelectGuard(() =>
                  actions.openTransferDialog(menuContextEntry, "move")
                )}
              >
                {t('project:filesystem.moveTo')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={ClipboardCopy}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.neutral}
                onSelect={withMenuSelectGuard(() => actions.copyPath(menuContextEntry))}
              >
                {t('project:filesystem.copyPath')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={PencilLine}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.warning}
                onSelect={withMenuSelectGuard(() => actions.requestRename(menuContextEntry))}
              >
                {t('project:filesystem.rename')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={Trash2}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.danger}
                onSelect={withMenuSelectGuard(() => actions.deleteEntry(menuContextEntry))}
              >
                {t('project:filesystem.delete')}
              </ContextMenuItem>
              <ContextMenuItem
                icon={Trash}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.danger}
                onSelect={withMenuSelectGuard(() =>
                  actions.deleteEntryPermanent(menuContextEntry)
                )}
              >
                {t('project:filesystem.permanentDelete')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={Info}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
                onSelect={withMenuSelectGuard(() => actions.showInfo(menuContextEntry))}
              >
                {t('project:filesystem.properties')}
              </ContextMenuItem>
            </>
          )
        ) : (
          <>
            <ContextMenuItem
              icon={RotateCw}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.success}
              onSelect={withMenuSelectGuard(() => actions.refreshList())}
            >
              {t('project:filesystem.refresh')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={showHidden ? Eye : EyeOff}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.warning}
              onSelect={withMenuSelectGuard(actions.toggleHidden)}
            >
              {toggleHiddenLabel}
            </ContextMenuItem>
            <ContextMenuItem
              icon={ClipboardCopy}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.neutral}
              onSelect={withMenuSelectGuard(actions.copyPathAtCurrent)}
            >
              {t('project:filesystem.copyPath')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={ClipboardPaste}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.accent}
              onSelect={withMenuSelectGuard(actions.paste)}
              disabled={clipboardSize === 0}
            >
              {t('project:filesystem.paste')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={FolderPlus}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.success}
              onSelect={withMenuSelectGuard(actions.createFolder)}
            >
              {t('project:filesystem.newFolder')}
            </ContextMenuItem>
            <ContextMenuItem
              icon={FilePlus}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.success}
              onSelect={withMenuSelectGuard(actions.createDocument)}
            >
              {t('project:filesystem.newDocument')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            {showTerminal ? (
              <ContextMenuItem
                icon={Terminal}
                iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
                onSelect={withMenuSelectGuard(actions.openTerminalAtCurrent)}
              >
                {t('project:filesystem.openInTerminal')}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem
              icon={FolderOpen}
              iconClassName={FILESYSTEM_MENU_ICON_CLASS.info}
              onSelect={withMenuSelectGuard(actions.openInFileManagerAtCurrent)}
            >
              {t('project:filesystem.openInFileManager')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});

FileSystemContextMenu.displayName = "FileSystemContextMenu";

export default FileSystemContextMenu;
