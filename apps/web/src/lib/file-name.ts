/** File extension for board documents. */
export const BOARD_FILE_EXT = "ttboard";

/** Return true when the extension is a board file. */
export function isBoardFileExt(ext?: string): boolean {
  return (ext ?? "").toLowerCase() === BOARD_FILE_EXT;
}

/** Return a display name for a file, hiding board extensions. */
export function getDisplayFileName(name: string, ext?: string): string {
  if (!isBoardFileExt(ext)) return name;
  const suffix = `.${BOARD_FILE_EXT}`;
  if (!name.toLowerCase().endsWith(suffix)) return name;
  // 中文注释：仅隐藏固定后缀，保留原始主文件名。
  return name.slice(0, -suffix.length);
}

/** Ensure a filename keeps the board extension. */
export function ensureBoardFileName(baseName: string): string {
  const trimmed = baseName.trim();
  const suffix = `.${BOARD_FILE_EXT}`;
  const normalized = trimmed.toLowerCase().endsWith(suffix)
    ? trimmed.slice(0, -suffix.length)
    : trimmed;
  // 中文注释：强制固定后缀，避免用户通过重命名修改类型。
  return `${normalized}.${BOARD_FILE_EXT}`;
}
