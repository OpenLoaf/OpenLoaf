import { isBoardFileExt, isBoardFolderName, isDocFolderName } from "@/lib/file-name";
import { MARKDOWN_EXTS } from "../components/FileSystemEntryVisual";
import { getEntryExt, type FileSystemEntry } from "./file-system-utils";

/** Resolve sort priority for file system entries. */
export function resolveEntrySortRank(entry: FileSystemEntry): number {
  if (entry.kind === "folder") {
    if (isBoardFolderName(entry.name)) return 1;
    if (isDocFolderName(entry.name)) return 1;
    return 0;
  }
  if (entry.kind === "file") {
    const ext = getEntryExt(entry);
    if (isBoardFileExt(ext)) return 1;
    if (MARKDOWN_EXTS.has(ext)) return 2;
    return 3;
  }
  // 逻辑：排序顺序为文件夹、画布、文稿、文件。
  return 3;
}

/** Sort entries by type priority while keeping stable order within each type. */
export function sortEntriesByType(entries: FileSystemEntry[]): FileSystemEntry[] {
  if (entries.length <= 1) return entries;
  const prioritized = entries.map((entry, index) => ({
    entry,
    index,
    rank: resolveEntrySortRank(entry),
  }));
  // 逻辑：按类型优先级稳定排序，保留原有顺序。
  prioritized.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.index - b.index;
  });
  return prioritized.map((item) => item.entry);
}
