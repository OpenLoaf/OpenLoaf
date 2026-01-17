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
  ".tenas-trash",
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
} from "@/components/ui/tenas/drag-drop-types";

/** Scoped project path matcher like [projectId]/path/to/file. */
const PROJECT_SCOPE_REGEX = /^\[([^\]]+)\]\/(.+)$/;
/** Project-scoped absolute path matcher like @[projectId]/path/to/file. */
const PROJECT_ABSOLUTE_REGEX = /^@\[[^\]]+\]\//;
/** Scheme matcher for absolute URLs. */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Check whether the value looks like a URI with scheme. */
function hasUriScheme(value: string) {
  return SCHEME_REGEX.test(value.trim());
}

/** Get a relative path for an entry under the project root. */
export function getRelativePathFromUri(rootUri: string, entryUri: string) {
  const trimmedEntry = entryUri.trim();
  if (!trimmedEntry) return "";
  if (!hasUriScheme(trimmedEntry)) return normalizeRelativePath(trimmedEntry);
  const trimmedRoot = rootUri.trim();
  if (!trimmedRoot || !hasUriScheme(trimmedRoot)) return "";
  try {
    const rootUrl = new URL(trimmedRoot);
    const entryUrl = new URL(trimmedEntry);
    if (rootUrl.protocol !== "file:" || entryUrl.protocol !== "file:") return "";
    const rootParts = rootUrl.pathname.split("/").filter(Boolean).map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
    const entryParts = entryUrl.pathname.split("/").filter(Boolean).map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
    const isPrefix = rootParts.every((part, index) => part === entryParts[index]);
    if (!isPrefix) return "";
    const relativeParts = entryParts.slice(rootParts.length);
    return normalizeRelativePath(relativeParts.join("/"));
  } catch {
    return "";
  }
}

/** Build a file URI by joining root with a relative path. */
export function buildUriFromRoot(rootUri: string, relativePath: string) {
  const trimmedRelative = relativePath.trim();
  if (!trimmedRelative) {
    if (!rootUri?.trim() || hasUriScheme(rootUri)) return "";
    return normalizeRelativePath(rootUri);
  }
  if (hasUriScheme(trimmedRelative)) return trimmedRelative;
  const normalizedRelative = normalizeRelativePath(trimmedRelative);
  if (!rootUri?.trim() || hasUriScheme(rootUri)) return normalizedRelative;
  return joinRelativePath(rootUri, normalizedRelative);
}

/** Normalize a relative path string to POSIX format. */
export function normalizeRelativePath(value: string) {
  const normalized = value
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
  return normalized === "." ? "" : normalized;
}

/** Join two relative path segments. */
export function joinRelativePath(base: string, segment: string) {
  const normalizedBase = normalizeRelativePath(base);
  const normalizedSegment = normalizeRelativePath(segment);
  if (!normalizedBase) return normalizedSegment;
  if (!normalizedSegment) return normalizedBase;
  return normalizeRelativePath(`${normalizedBase}/${normalizedSegment}`);
}

/** Resolve a parent relative path, return null when already at root. */
export function getParentRelativePath(value: string): string | null {
  const normalized = normalizeRelativePath(value);
  if (!normalized) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/** Normalize a project-relative path string. */
export function normalizeProjectRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

/** Check whether the value is a project-scoped absolute path. */
export function isProjectAbsolutePath(value: string) {
  return PROJECT_ABSOLUTE_REGEX.test(value.trim());
}

/** Parse a scoped project path string. */
export function parseScopedProjectPath(
  value: string
): { projectId?: string; relativePath: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (SCHEME_REGEX.test(normalized)) return null;
  // 逻辑：支持 @[projectId]/path 形式的跨项目引用。
  const match = normalized.match(PROJECT_SCOPE_REGEX);
  const relativePath = normalizeProjectRelativePath(match ? match[2] ?? "" : normalized);
  if (!relativePath) return null;
  return { projectId: match?.[1]?.trim(), relativePath };
}

/** Format a scoped project path string. */
export function formatScopedProjectPath(input: {
  /** Relative path under project root. */
  relativePath: string;
  /** Project id for scoping. */
  projectId?: string;
  /** Current project id for de-dup. */
  currentProjectId?: string;
  /** Whether to prefix with "@". */
  includeAt?: boolean;
}) {
  const relativePath = normalizeProjectRelativePath(input.relativePath);
  if (!relativePath) return "";
  const shouldScope =
    Boolean(input.projectId) &&
    (!input.currentProjectId || input.projectId !== input.currentProjectId);
  const prefix = shouldScope ? `[${input.projectId}]/` : "";
  const scoped = `${prefix}${relativePath}`;
  if (input.includeAt && shouldScope) return `@${scoped}`;
  return scoped;
}

/** Get a normalized extension string for a file entry. */
export function getEntryExt(entry: FileSystemEntry) {
  if (entry.ext) return entry.ext.toLowerCase();
  const parts = entry.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/** Convert a file URI to a display path string. */
export function getDisplayPathFromUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return "/";
  if (!hasUriScheme(trimmed)) return normalizeRelativePath(trimmed) || "/";
  try {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname);
  } catch {
    return trimmed;
  }
}

/** Build a child URI by appending a name to the base directory URI. */
export function buildChildUri(baseUri: string, name: string) {
  const trimmedBase = baseUri.trim();
  if (!trimmedBase) return normalizeRelativePath(name);
  if (!hasUriScheme(trimmedBase)) return joinRelativePath(trimmedBase, name);
  try {
    const nextUrl = new URL(trimmedBase);
    const basePath = nextUrl.pathname.replace(/\/$/, "");
    nextUrl.pathname = `${basePath}/${encodeURIComponent(name)}`;
    return nextUrl.toString();
  } catch {
    return trimmedBase;
  }
}

/** Build a file:// URI by joining root with a relative path. */
export function buildFileUriFromRoot(rootUri: string, relativePath: string) {
  if (!rootUri?.trim() || !rootUri.startsWith("file://")) return "";
  const normalizedRelative = normalizeRelativePath(relativePath);
  if (!normalizedRelative) return rootUri;
  try {
    const rootUrl = new URL(rootUri);
    const rootParts = rootUrl.pathname.split("/").filter(Boolean);
    const relativeParts = normalizedRelative.split("/").filter(Boolean);
    const nextParts = [...rootParts, ...relativeParts].map((part) =>
      encodeURIComponent(decodeURIComponent(part))
    );
    rootUrl.pathname = `/${nextParts.join("/")}`;
    return rootUrl.toString();
  } catch {
    return rootUri;
  }
}

/** Resolve a file:// URI for local integrations. */
export function resolveFileUriFromRoot(rootUri: string | undefined, uri: string) {
  if (!uri?.trim()) return "";
  if (uri.startsWith("file://")) return uri;
  if (!rootUri?.trim()) return uri;
  return buildFileUriFromRoot(rootUri, uri) || uri;
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
