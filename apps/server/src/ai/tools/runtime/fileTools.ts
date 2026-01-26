import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, zodSchema } from "ai";
import {
  listDirToolDef,
  readFileToolDef,
} from "@tenas-ai/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { resolveToolPath, resolveToolWorkdir } from "@/ai/tools/runtime/toolScope";
import { buildGitignoreMatcher } from "@/ai/tools/runtime/gitignoreMatcher";

const MAX_LINE_LENGTH = 500;
const DEFAULT_READ_LIMIT = 2000;
const TAB_WIDTH = 4;
const COMMENT_PREFIXES = ["#", "//", "--"];

const MAX_ENTRY_LENGTH = 500;
const INDENTATION_SPACES = 2;
const DEFAULT_LIST_LIMIT = 25;
const DEFAULT_LIST_DEPTH = 2;

/** Blocked binary extensions for read file tools. */
const BINARY_FILE_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".bz2",
  ".dat",
  ".db",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".iso",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".psd",
  ".rar",
  ".so",
  ".sqlite",
  ".tar",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".xls",
  ".xlsx",
  ".xz",
  ".zip",
]);
type ReadMode = "slice" | "indentation";

type IndentationOptions = {
  /** Anchor line to center the indentation lookup on. */
  anchorLine: number;
  /** How many parent indentation levels to include. */
  maxLevels: number;
  /** Whether to include sibling blocks at the same indentation. */
  includeSiblings: boolean;
  /** Whether to include header lines above the anchor block. */
  includeHeader: boolean;
  /** Hard cap on returned lines. */
  maxLines: number;
};

type LineRecord = {
  /** 1-based line number. */
  number: number;
  /** Raw line text. */
  raw: string;
  /** Display text (possibly truncated). */
  display: string;
  /** Measured indentation. */
  indent: number;
  /** Effective indentation for blank lines. */
  effectiveIndent: number;
  /** Whether line is blank. */
  isBlank: boolean;
  /** Whether line is a comment. */
  isComment: boolean;
};

type DirEntryKind = "directory" | "file" | "symlink" | "other";

type DirEntry = {
  /** Sort key. */
  name: string;
  /** Display name. */
  displayName: string;
  /** Depth for indentation. */
  depth: number;
  /** Entry kind. */
  kind: DirEntryKind;
  /** File size in bytes. */
  sizeBytes?: number | null;
};

type DirStats = {
  ignored: number;
  dirCount: number;
  fileCount: number;
  symlinkCount: number;
  otherCount: number;
};

/** Clamp a byte index to a UTF-8 boundary. */
function clampUtf8End(buffer: Buffer, index: number): number {
  let cursor = Math.max(0, Math.min(index, buffer.length));
  while (cursor > 0) {
    const byte = buffer[cursor - 1];
    if (byte === undefined) break;
    if ((byte & 0b1100_0000) !== 0b1000_0000) break;
    cursor -= 1;
  }
  return cursor;
}

/** Truncate a string to the max byte length without breaking characters. */
function truncateLine(line: string, maxLength: number): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= maxLength) return line;
  const end = clampUtf8End(bytes, maxLength);
  return bytes.toString("utf8", 0, end);
}

/** Split file contents into lines while matching Codex newline handling. */
function splitLines(raw: string): string[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  if (raw.endsWith("\n") || raw.endsWith("\r\n")) {
    lines.pop();
  }
  return lines;
}

/** Format a line record to output format. */
function formatLineRecord(record: LineRecord): string {
  return `L${record.number}: ${record.display}`;
}

/** Measure indentation width (tabs are TAB_WIDTH). */
function measureIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === " ") {
      count += 1;
      continue;
    }
    if (ch === "\t") {
      count += TAB_WIDTH;
      continue;
    }
    break;
  }
  return count;
}

/** Build line records with effective indentation. */
function collectLineRecords(lines: string[]): LineRecord[] {
  const records: LineRecord[] = [];
  let previousIndent = 0;
  lines.forEach((raw, index) => {
    const indent = measureIndent(raw);
    const isBlank = raw.trim().length === 0;
    const effectiveIndent = isBlank ? previousIndent : indent;
    if (!isBlank) previousIndent = indent;
    const isComment = COMMENT_PREFIXES.some((prefix) => raw.trim().startsWith(prefix));
    records.push({
      number: index + 1,
      raw,
      display: truncateLine(raw, MAX_LINE_LENGTH),
      indent,
      effectiveIndent,
      isBlank,
      isComment,
    });
  });
  return records;
}

/** Trim empty lines from both ends of the index list. */
function trimEmptyLines(indices: number[], records: LineRecord[]): number[] {
  let start = 0;
  let end = indices.length - 1;
  while (start <= end) {
    const index = indices[start];
    if (index == null || !records[index]?.isBlank) break;
    start += 1;
  }
  while (end >= start) {
    const index = indices[end];
    if (index == null || !records[index]?.isBlank) break;
    end -= 1;
  }
  return indices.slice(start, end + 1);
}

/** Build indentation-aware output lines. */
function readIndentationBlock(
  records: LineRecord[],
  offset: number,
  limit: number,
  options: IndentationOptions,
): string[] {
  const anchorLine = options.anchorLine || offset;
  if (anchorLine <= 0) throw new Error("anchorLine must be a 1-indexed line number");
  if (!records.length || anchorLine > records.length) {
    throw new Error("anchorLine exceeds file length");
  }

  const anchorIndex = anchorLine - 1;
  const anchorIndent = records[anchorIndex]?.effectiveIndent ?? 0;
  const minIndent = options.maxLevels === 0 ? 0 : Math.max(0, anchorIndent - options.maxLevels * TAB_WIDTH);
  const finalLimit = Math.min(limit, options.maxLines, records.length);

  if (finalLimit === 1) {
    return [formatLineRecord(records[anchorIndex]!)];
  }

  let i = anchorIndex - 1;
  let j = anchorIndex + 1;
  let iCounterMinIndent = 0;
  let jCounterMinIndent = 0;
  const outputIndices: number[] = [anchorIndex];

  while (outputIndices.length < finalLimit) {
    let progressed = 0;

    // 向上扩展：遇到小于 minIndent 的缩进就停止。
    if (i >= 0) {
      const index = i;
      const record = records[index];
      if (record && record.effectiveIndent >= minIndent) {
        outputIndices.unshift(index);
        progressed += 1;
        i -= 1;

        if (record.effectiveIndent === minIndent && !options.includeSiblings) {
          const allowHeaderComment = options.includeHeader && record.isComment;
          const canTakeLine = allowHeaderComment || iCounterMinIndent === 0;
          if (canTakeLine) {
            iCounterMinIndent += 1;
          } else {
            outputIndices.shift();
            progressed -= 1;
            i = -1;
          }
        }

        if (outputIndices.length >= finalLimit) break;
      } else {
        i = -1;
      }
    }

    // 向下扩展：与向上逻辑保持一致。
    if (j < records.length) {
      const index = j;
      const record = records[index];
      if (record && record.effectiveIndent >= minIndent) {
        outputIndices.push(index);
        progressed += 1;
        j += 1;

        if (record.effectiveIndent === minIndent && !options.includeSiblings) {
          if (jCounterMinIndent > 0) {
            outputIndices.pop();
            progressed -= 1;
            j = records.length;
          }
          jCounterMinIndent += 1;
        }
      } else {
        j = records.length;
      }
    }

    if (progressed === 0) break;
  }

  const trimmed = trimEmptyLines(outputIndices, records);
  return trimmed.map((index) => formatLineRecord(records[index]!));
}

/** Execute file read tool with slice or indentation mode. */
export const readFileTool = tool({
  description: readFileToolDef.description,
  inputSchema: zodSchema(readFileToolDef.parameters),
  execute: async ({
    path: filePath,
    offset,
    limit,
    mode,
    anchorLine,
    maxLevels,
    includeSiblings,
    includeHeader,
    maxLines,
  }): Promise<string> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { absPath } = resolveToolPath({ target: filePath, allowOutside });
    // 过滤常见二进制文件后缀，避免读取非文本文件内容。
    if (hasBlockedBinaryExtension(absPath)) {
      throw new Error("Only text files are supported; binary file extensions are not allowed.");
    }
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) throw new Error("Path is not a file.");

    const raw = await fs.readFile(absPath, "utf-8");
    const lines = splitLines(raw);
    const records = collectLineRecords(lines);
    const resolvedOffset = typeof offset === "number" ? offset : 1;
    const resolvedLimit = typeof limit === "number" ? limit : DEFAULT_READ_LIMIT;

    if (resolvedOffset <= 0) throw new Error("offset must be a 1-indexed line number");
    if (resolvedLimit <= 0) throw new Error("limit must be greater than zero");

    const resolvedMode: ReadMode = mode === "indentation" ? "indentation" : "slice";

    if (resolvedMode === "indentation") {
      const options: IndentationOptions = {
        anchorLine: anchorLine ?? resolvedOffset,
        maxLevels: typeof maxLevels === "number" ? Math.max(0, maxLevels) : 0,
        includeSiblings: Boolean(includeSiblings),
        includeHeader: includeHeader !== false,
        maxLines: typeof maxLines === "number" ? Math.max(1, maxLines) : resolvedLimit,
      };
      return readIndentationBlock(records, resolvedOffset, resolvedLimit, options).join("\n");
    }

    if (resolvedOffset > records.length) throw new Error("offset exceeds file length");

    const startIndex = resolvedOffset - 1;
    const endIndex = Math.min(startIndex + resolvedLimit - 1, records.length - 1);
    const slice = records.slice(startIndex, endIndex + 1).map(formatLineRecord);
    return slice.join("\n");
  },
});

/** Execute list directory tool with scope enforcement. */
export const listDirTool = tool({
  description: listDirToolDef.description,
  inputSchema: zodSchema(listDirToolDef.parameters),
  execute: async ({ path: targetPath, offset, limit, depth, ignoreGitignore }): Promise<string> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { absPath } = resolveToolPath({ target: targetPath, allowOutside });
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) throw new Error("Path is not a directory.");

    const resolvedOffset = typeof offset === "number" ? offset : 1;
    const resolvedLimit = typeof limit === "number" ? limit : DEFAULT_LIST_LIMIT;
    const resolvedDepth = typeof depth === "number" ? depth : DEFAULT_LIST_DEPTH;

    if (resolvedOffset <= 0) throw new Error("offset must be a 1-indexed entry number");
    if (resolvedLimit <= 0) throw new Error("limit must be greater than zero");
    if (resolvedDepth <= 0) throw new Error("depth must be greater than zero");

    const ignoreMatcher = ignoreGitignore === false
      ? null
      : await buildGitignoreMatcher({ rootPath: absPath });
    const { entries, stats } = await collectDirEntries(absPath, resolvedDepth, ignoreMatcher);
    const output: string[] = [`Absolute path: ${absPath}`];
    output.push(
      `Ignored by .gitignore: ${stats.ignored}`,
      `Directories: ${stats.dirCount}, Files: ${stats.fileCount}`,
    );

    if (entries.length === 0) {
      return output.join("\n");
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    const startIndex = resolvedOffset - 1;
    if (startIndex >= entries.length) {
      throw new Error("offset exceeds directory entry count");
    }

    const remaining = entries.length - startIndex;
    const cappedLimit = Math.min(resolvedLimit, remaining);
    const endIndex = startIndex + cappedLimit;
    const selected = entries.slice(startIndex, endIndex);

    selected.forEach((entry) => output.push(formatDirEntry(entry)));

    if (endIndex < entries.length) {
      output.push(`More than ${cappedLimit} entries found`);
    }

    return output.join("\n");
  },
});

/** Collect directory entries in BFS order with depth. */
async function collectDirEntries(
  basePath: string,
  depth: number,
  ignoreMatcher: import("ignore").Ignore | null,
): Promise<{ entries: DirEntry[]; stats: DirStats }> {
  const entries: DirEntry[] = [];
  const stats: DirStats = {
    ignored: 0,
    dirCount: 0,
    fileCount: 0,
    symlinkCount: 0,
    otherCount: 0,
  };
  const queue: Array<{ dirPath: string; prefix: string; remaining: number }> = [
    { dirPath: basePath, prefix: "", remaining: depth },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const dirEntries = await fs.readdir(current.dirPath, { withFileTypes: true });
    const collected: Array<{ entryPath: string; relativePath: string; entry: DirEntry; kind: DirEntryKind }> = [];

    for (const entry of dirEntries) {
      // 固定过滤 .DS_Store 与 .tenas* 目录，避免噪声泄露到工具输出。
      if (entry.name === ".DS_Store" || (entry.isDirectory() && entry.name.startsWith(".tenas"))) {
        continue;
      }
      const relativePath = current.prefix ? path.join(current.prefix, entry.name) : entry.name;
      const normalized = relativePath.split(path.sep).join("/");
      if (ignoreMatcher) {
        const ignoreTarget = entry.isDirectory() ? `${normalized}/` : normalized;
        if (ignoreMatcher.ignores(ignoreTarget)) {
          stats.ignored += 1;
          continue;
        }
      }
      const depthLevel = current.prefix ? current.prefix.split(path.sep).length : 0;
      const displayName = truncateLine(entry.name, MAX_ENTRY_LENGTH);
      const kind: DirEntryKind = entry.isDirectory()
        ? "directory"
        : entry.isSymbolicLink()
          ? "symlink"
          : entry.isFile()
            ? "file"
            : "other";
      let sizeBytes: number | null | undefined;
      if (kind === "file") {
        try {
          sizeBytes = (await fs.stat(path.join(current.dirPath, entry.name))).size;
        } catch {
          sizeBytes = null;
        }
      }
      collected.push({
        entryPath: path.join(current.dirPath, entry.name),
        relativePath,
        kind,
        entry: {
          name: truncateLine(normalized, MAX_ENTRY_LENGTH),
          displayName,
          depth: depthLevel,
          kind,
          sizeBytes,
        },
      });
    }

    collected.sort((a, b) => a.entry.name.localeCompare(b.entry.name));

    for (const item of collected) {
      entries.push(item.entry);
      if (item.kind === "directory") stats.dirCount += 1;
      if (item.kind === "file") stats.fileCount += 1;
      if (item.kind === "symlink") stats.symlinkCount += 1;
      if (item.kind === "other") stats.otherCount += 1;
      if (item.kind === "directory" && current.remaining > 1) {
        queue.push({ dirPath: item.entryPath, prefix: item.relativePath, remaining: current.remaining - 1 });
      }
    }
  }

  return { entries, stats };
}

/** Format directory entry line. */
function formatDirEntry(entry: DirEntry): string {
  const indent = " ".repeat(entry.depth * INDENTATION_SPACES);
  let name = entry.displayName;
  if (entry.kind === "directory") name += "/";
  if (entry.kind === "symlink") name += "@";
  if (entry.kind === "other") name += "?";
  if (entry.kind === "file") {
    const sizeLabel = formatBytesAsMb(entry.sizeBytes ?? 0);
    name += ` (${sizeLabel})`;
  }
  return `${indent}${name}`;
}

function formatBytesAsMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/** Check whether a path ends with a blocked binary extension. */
function hasBlockedBinaryExtension(targetPath: string): boolean {
  const ext = path.extname(targetPath).toLowerCase();
  return Boolean(ext) && BINARY_FILE_EXTENSIONS.has(ext);
}
