"use client";

import {
  memo,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ArrowLeftIcon, FileText, Folder, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { type FileSystemEntry } from "../utils/file-system-utils";

type FileSystemEmptyStateProps = {
  showEmptyActions?: boolean;
  parentEntry?: FileSystemEntry | null;
  onCreateDocument?: () => void;
  onCreateBoard?: () => void;
  onNavigate?: (nextUri: string) => void;
  onEntryDrop?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLElement>
  ) => void;
  setDragOverFolderUri: Dispatch<SetStateAction<string | null>>;
  shouldBlockPointerEvent: (event: { button?: number } | null | undefined) => boolean;
};

/** Props for search empty state. */
type FileSystemSearchEmptyStateProps = {
  query: string;
};

/** Render the empty state panel for the file system grid. */
const FileSystemEmptyState = memo(function FileSystemEmptyState({
  showEmptyActions = true,
  parentEntry,
  onCreateDocument,
  onCreateBoard,
  onNavigate,
  onEntryDrop,
  setDragOverFolderUri,
  shouldBlockPointerEvent,
}: FileSystemEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center translate-y-2">
      <div className="flex w-full flex-col items-center gap-4">
        <EmptyState
          title="暂无文件"
          description="创建一个文稿或画布开始工作。"
          icons={[Folder, FileText, FolderOpen]}
          className="border-0 hover:border-0"
          actions={
            showEmptyActions ? (
              <>
                <Button
                  onClick={(event) => {
                    if (shouldBlockPointerEvent(event)) return;
                    onCreateDocument?.();
                  }}
                >
                  创建文稿
                </Button>
                <Button
                  variant="outline"
                  onClick={(event) => {
                    if (shouldBlockPointerEvent(event)) return;
                    onCreateBoard?.();
                  }}
                >
                  创建画布
                </Button>
              </>
            ) : null
          }
        />
        {parentEntry ? (
          <div className="-mt-3">
            <Button
              variant="link"
              className="text-muted-foreground"
              size="sm"
              onClick={(event) => {
                if (shouldBlockPointerEvent(event)) return;
                if (event.button !== 0) return;
                if (event.nativeEvent.which !== 1) return;
                onNavigate?.(parentEntry.uri);
              }}
              onDragOver={(event) => {
                setDragOverFolderUri(parentEntry.uri);
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={() => {
                setDragOverFolderUri(parentEntry.uri);
              }}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget as Node | null;
                if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                setDragOverFolderUri((current) =>
                  current === parentEntry.uri ? null : current
                );
              }}
              onDrop={(event) => {
                setDragOverFolderUri(null);
                onEntryDrop?.(parentEntry, event);
              }}
            >
              <ArrowLeftIcon />
              返回上级
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
FileSystemEmptyState.displayName = "FileSystemEmptyState";

/** Render the empty state panel for empty search results. */
const FileSystemSearchEmptyState = memo(function FileSystemSearchEmptyState({
  query,
}: FileSystemSearchEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center translate-y-2">
      <EmptyState
        title="未找到匹配文件"
        description={`没有找到包含 \"${query}\" 的文件或文件夹。`}
        icons={[Search]}
        className="border-0 hover:border-0"
      />
    </div>
  );
});
FileSystemSearchEmptyState.displayName = "FileSystemSearchEmptyState";

export { FileSystemEmptyState, FileSystemSearchEmptyState };
