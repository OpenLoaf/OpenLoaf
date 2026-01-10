"use client";

import {
  memo,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ArrowLeftIcon, Folder, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { type FileSystemEntry } from "../utils/file-system-utils";

type FileSystemEmptyStateProps = {
  showEmptyActions?: boolean;
  parentEntry?: FileSystemEntry | null;
  onCreateBoard?: () => void;
  onNavigate?: (nextUri: string) => void;
  onEntryDrop?: (
    entry: FileSystemEntry,
    event: DragEvent<HTMLButtonElement>
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
  onCreateBoard,
  onNavigate,
  onEntryDrop,
  setDragOverFolderUri,
  shouldBlockPointerEvent,
}: FileSystemEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center translate-y-2">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Folder />
          </EmptyMedia>
          <EmptyTitle>暂无文件</EmptyTitle>
          <EmptyDescription>创建一个文档或画布开始工作。</EmptyDescription>
        </EmptyHeader>
        {showEmptyActions ? (
          <EmptyContent>
            <div className="flex gap-2">
              <Button>创建文档</Button>
              <Button
                variant="outline"
                onClick={(event) => {
                  if (shouldBlockPointerEvent(event)) return;
                  onCreateBoard?.();
                }}
              >
                创建画布
              </Button>
            </div>
          </EmptyContent>
        ) : null}
        {parentEntry ? (
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
        ) : null}
      </Empty>
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
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyTitle>未找到匹配文件</EmptyTitle>
          <EmptyDescription>{`没有找到包含 \"${query}\" 的文件或文件夹。`}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
});
FileSystemSearchEmptyState.displayName = "FileSystemSearchEmptyState";

export { FileSystemEmptyState, FileSystemSearchEmptyState };
