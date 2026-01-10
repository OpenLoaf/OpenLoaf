export type FileSystemEntry = {
  uri: string;
  name: string;
  kind: "file" | "folder";
  ext?: string;
  size?: number;
  /** File creation time in ISO format. */
  createdAt?: string;
  updatedAt?: string;
  /** Whether the folder has no visible children. */
  isEmpty?: boolean;
};

export const IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".teatime-trash",
  "dist",
  "build",
  "out",
]);

export {
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_IMAGE_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  FILE_DRAG_URIS_MIME,
} from "@/components/ui/teatime/drag-drop-types";

/** Get a relative path for an entry under the project root. */
export function getRelativePathFromUri(rootUri: string, entryUri: string) {
  try {
    const rootUrl = new URL(rootUri);
    const entryUrl = new URL(entryUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const entryParts = entryUrl.pathname.split("/").filter(Boolean);
    const relativeParts = entryParts.slice(rootParts.length);
    return decodeURIComponent(relativeParts.join("/"));
  } catch {
    return "";
  }
}

/** Build a file URI by joining root with a relative path. */
export function buildUriFromRoot(rootUri: string, relativePath: string) {
  try {
    const rootUrl = new URL(rootUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const relativeParts = relativePath.split("/").filter(Boolean);
    const nextParts = [...rootParts, ...relativeParts].map((part) =>
      encodeURIComponent(decodeURIComponent(part))
    );
    rootUrl.pathname = `/${nextParts.join("/")}`;
    return rootUrl.toString();
  } catch {
    return "";
  }
}

/** Build teatime-file URL from projectId and relative path. */
export function buildTeatimeFileUrl(projectId: string, relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  const encoded = parts.map((part) => encodeURIComponent(part));
  return `teatime-file://${projectId}/${encoded.join("/")}`;
}

/** Parse teatime-file URL into projectId and relative path. */
export function parseTeatimeFileUrl(uri: string): { projectId: string; relativePath: string } | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "teatime-file:") return null;
    const projectId = parsed.hostname.trim();
    const relativePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!projectId || !relativePath) return null;
    return { projectId, relativePath };
  } catch {
    return null;
  }
}

/** Get a normalized extension string for a file entry. */
export function getEntryExt(entry: FileSystemEntry) {
  if (entry.ext) return entry.ext.toLowerCase();
  const parts = entry.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/** Convert a file URI to a display path string. */
export function getDisplayPathFromUri(uri: string) {
  try {
    const url = new URL(uri);
    return decodeURIComponent(url.pathname);
  } catch {
    return uri;
  }
}

/** Build a child URI by appending a name to the base directory URI. */
export function buildChildUri(baseUri: string, name: string) {
  const nextUrl = new URL(baseUri);
  const basePath = nextUrl.pathname.replace(/\/$/, "");
  nextUrl.pathname = `${basePath}/${encodeURIComponent(name)}`;
  return nextUrl.toString();
}

/** Ensure a filename is unique in the current directory. */
export function getUniqueName(name: string, existingNames: Set<string>) {
  if (!existingNames.has(name)) return name;
  const parts = name.split(".");
  const hasExt = parts.length > 1;
  const ext = hasExt ? `.${parts.pop()}` : "";
  const base = parts.join(".");
  let index = 1;
  while (existingNames.has(`${base}-${index}${ext}`)) {
    index += 1;
  }
  return `${base}-${index}${ext}`;
}

/** Format file size for display. */
export function formatSize(bytes?: number) {
  if (bytes === undefined) return "--";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

/** Format a number as a two-digit string. */
function formatTwoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

/** Format a date into yyyy-MM-dd. */
function formatDatePart(date: Date) {
  const year = date.getFullYear();
  const month = formatTwoDigits(date.getMonth() + 1);
  const day = formatTwoDigits(date.getDate());
  return `${year}-${month}-${day}`;
}

/** Format a date into HH:mm:ss. */
function formatTimePart(date: Date) {
  const hour = formatTwoDigits(date.getHours());
  const minute = formatTwoDigits(date.getMinutes());
  const second = formatTwoDigits(date.getSeconds());
  return `${hour}:${minute}:${second}`;
}

/** Format timestamp string for display. */
export function formatTimestamp(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const timePart = formatTimePart(date);
  if (date >= startOfToday) {
    // 今日仅展示时间，减少重复的日期信息。
    return `今日 ${timePart}`;
  }
  if (date >= startOfYesterday) {
    // 昨日保留时间，方便区分具体时刻。
    return `昨日 ${timePart}`;
  }
  return `${formatDatePart(date)} ${timePart}`;
}
