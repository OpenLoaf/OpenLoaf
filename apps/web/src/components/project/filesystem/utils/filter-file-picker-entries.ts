type FileSystemEntry = {
  uri: string;
  name: string;
  kind: "file" | "folder";
  ext?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
  isEmpty?: boolean;
};

const BOARD_FILE_EXT = "tnboard";
const IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".openloaf-trash",
  "dist",
  "build",
  "out",
]);

function isBoardFileExt(ext?: string): boolean {
  return (ext ?? "").toLowerCase() === BOARD_FILE_EXT;
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

function getEntryExt(entry: FileSystemEntry) {
  if (entry.ext) return entry.ext.toLowerCase();
  const parts = entry.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export type FilePickerFilterOptions = {
  /** Optional file extension allowlist. */
  allowedExtensions?: Set<string>;
  /** Whether to hide board entries from the picker. */
  excludeBoardEntries?: boolean;
  /** Current board folder uri (relative to project root). */
  currentBoardFolderUri?: string;
  /** Current directory uri in picker (relative to project root). */
  currentDirectoryUri?: string;
};

/** Filter file picker entries by extension and visibility rules. */
export function filterFilePickerEntries(
  entries: FileSystemEntry[],
  options: FilePickerFilterOptions
): FileSystemEntry[] {
  const baseEntries = entries.filter((entry) => !IGNORE_NAMES.has(entry.name));
  const normalizedBoardFolder = normalizeRelativePath(
    options.currentBoardFolderUri ?? ""
  );
  const normalizedCurrentDir = normalizeRelativePath(
    options.currentDirectoryUri ?? ""
  );
  const boardIndexFileName = `index.${BOARD_FILE_EXT}`;
  const boardIndexUri = normalizedBoardFolder
    ? `${normalizedBoardFolder}/${boardIndexFileName}`
    : "";
  return baseEntries.filter((entry) => {
    if (options.excludeBoardEntries && normalizedBoardFolder) {
      const normalizedEntryUri = normalizeRelativePath(entry.uri);
      // 逻辑：仅隐藏当前画布目录及其 index.tnboard 文件。
      if (entry.kind === "folder" && normalizedEntryUri === normalizedBoardFolder) {
        return false;
      }
      if (entry.kind === "file" && isBoardFileExt(getEntryExt(entry))) {
        if (normalizedEntryUri === boardIndexUri) return false;
        if (normalizedCurrentDir === normalizedBoardFolder) {
          const currentIndexUri = `${normalizedCurrentDir}/${boardIndexFileName}`;
          if (normalizedEntryUri === currentIndexUri) return false;
        }
      }
    }
    if (entry.kind === "folder") return true;
    return true;
  });
}
