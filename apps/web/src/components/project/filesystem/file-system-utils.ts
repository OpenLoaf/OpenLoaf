export type FileSystemEntry = {
  uri: string;
  name: string;
  kind: "file" | "folder";
  ext?: string;
  size?: number;
  updatedAt?: string;
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
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
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
  while (existingNames.has(`${base}-copy${index}${ext}`)) {
    index += 1;
  }
  return `${base}-copy${index}${ext}`;
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

/** Format timestamp string for display. */
export function formatTimestamp(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}
