"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getDisplayFileName } from "@/lib/file-name";
import { FileSystemGrid, type FileSystemEntry } from "./FileSystemGrid";

type FileSystemGridControllerProps = {
  entries: FileSystemEntry[];
  renameEntries?: FileSystemEntry[];
  canRenameEntry?: (entry: FileSystemEntry) => boolean;
  onRename?: (entry: FileSystemEntry, nextName: string) => Promise<string | null | void>;
  onRenamingSubmit?: () => void;
  onRenamingCancel?: () => void;
  renderContextMenu?: (
    entry: FileSystemEntry,
    ctx: {
      selectedUris: Set<string>;
      isMultiSelect: boolean;
      startRename: () => void;
    }
  ) => ReactNode;
  contextMenuClassName?: string;
} & Omit<
  ComponentProps<typeof FileSystemGrid>,
  | "entries"
  | "selectedUris"
  | "onEntryClick"
  | "onEntryContextMenu"
  | "renamingUri"
  | "renamingValue"
  | "onRenamingChange"
  | "onRenamingSubmit"
  | "onRenamingCancel"
  | "renderEntry"
  | "onSelectionChange"
>;

export type FileSystemGridControllerHandle = {
  requestRename: (payload: { uri: string; name: string }) => void;
};

/** Controller for selection, rename, and context menu around file system grid. */
const FileSystemGridController = memo(
  forwardRef<FileSystemGridControllerHandle, FileSystemGridControllerProps>(
    function FileSystemGridController(
      {
        entries,
        renameEntries,
        canRenameEntry,
        onRename,
        onRenamingSubmit,
        onRenamingCancel,
        renderContextMenu,
        contextMenuClassName = "w-52",
        onEntryDragStart,
        ...gridProps
      },
      ref
    ) {
      const [selectedUris, setSelectedUris] = useState<Set<string>>(() => new Set());
      const [renamingUri, setRenamingUri] = useState<string | null>(null);
      const [renamingValue, setRenamingValue] = useState("");

      const renameSourceEntries = renameEntries ?? entries;
      const allowRename = canRenameEntry ?? (() => true);

      const requestRename = useCallback((payload: { uri: string; name: string }) => {
        setSelectedUris(new Set([payload.uri]));
        setRenamingUri(payload.uri);
        setRenamingValue(payload.name);
      }, []);

      useImperativeHandle(ref, () => ({ requestRename }), [requestRename]);

      const handleSelectionChange = useCallback(
        (uris: string[], mode: "replace" | "toggle") => {
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
            return next;
          });
        },
        []
      );

      const startRename = useCallback(
        (entry: FileSystemEntry) => {
          if (!allowRename(entry)) return;
          setSelectedUris(new Set([entry.uri]));
          const displayName = getDisplayFileName(entry.name, entry.ext);
          setRenamingUri(entry.uri);
          setRenamingValue(displayName);
        },
        [allowRename]
      );

      const handleRenamingSubmit = useCallback(async () => {
        if (onRenamingSubmit) {
          onRenamingSubmit();
          return;
        }
        if (!renamingUri) return;
        const targetEntry = renameSourceEntries.find(
          (item) => item.uri === renamingUri
        );
        if (!targetEntry) {
          setRenamingUri(null);
          return;
        }
        const nextName = renamingValue.trim();
        if (!nextName) {
          setRenamingUri(null);
          return;
        }
        if (nextName === targetEntry.name) {
          setRenamingUri(null);
          return;
        }
        const existingNames = new Set(
          renameSourceEntries
            .filter((item) => item.uri !== targetEntry.uri)
            .map((item) => item.name)
        );
        if (existingNames.has(nextName)) {
          toast.error("已存在同名文件或文件夹");
          return;
        }
        if (!onRename) return;
        const nextUri = await onRename(targetEntry, nextName);
        if (nextUri) {
          setSelectedUris(new Set([nextUri]));
        }
        setRenamingUri(null);
      }, [
        onRenamingSubmit,
        onRename,
        renamingUri,
        renamingValue,
        renameSourceEntries,
      ]);

      const handleRenamingCancel = useCallback(() => {
        if (onRenamingCancel) {
          onRenamingCancel();
          return;
        }
        setRenamingUri(null);
      }, [onRenamingCancel]);

      return (
        <FileSystemGrid
          {...gridProps}
          entries={entries}
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
                return next;
              });
              return;
            }
            setSelectedUris(new Set([entry.uri]));
          }}
          onEntryContextMenu={(entry, event) => {
            event.stopPropagation();
            if (!selectedUris.has(entry.uri)) {
              setSelectedUris(new Set([entry.uri]));
            }
          }}
          onEntryDragStart={(entry, event) => {
            if (!selectedUris.has(entry.uri)) {
              setSelectedUris(new Set([entry.uri]));
            }
            onEntryDragStart?.(entry, event);
          }}
          renamingUri={renamingUri}
          renamingValue={renamingValue}
          onRenamingChange={setRenamingValue}
          onRenamingSubmit={handleRenamingSubmit}
          onRenamingCancel={handleRenamingCancel}
          onSelectionChange={handleSelectionChange}
          renderEntry={(entry, card) => {
            if (!renderContextMenu) return card;
            const menu = renderContextMenu(entry, {
              selectedUris,
              isMultiSelect: selectedUris.size > 1,
              startRename: () => startRename(entry),
            });
            if (!menu) return card;
            return (
              <ContextMenu key={entry.uri}>
                <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
                <ContextMenuContent className={contextMenuClassName}>
                  {menu}
                </ContextMenuContent>
              </ContextMenu>
            );
          }}
        />
      );
    }
  )
);

FileSystemGridController.displayName = "FileSystemGridController";

export default FileSystemGridController;
