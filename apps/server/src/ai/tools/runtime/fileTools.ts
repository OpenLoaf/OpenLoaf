import path from "node:path";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tool, zodSchema } from "ai";
import {
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
} from "@tenas-ai/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { resolveToolPath, resolveToolWorkdir } from "@/ai/tools/runtime/toolScope";

const MAX_LINE_LENGTH = 500;
const DEFAULT_READ_LIMIT = 2000;
const TAB_WIDTH = 4;
const COMMENT_PREFIXES = ["#", "//", "--"];

const MAX_ENTRY_LENGTH = 500;
const INDENTATION_SPACES = 2;
const DEFAULT_LIST_LIMIT = 25;
const DEFAULT_LIST_DEPTH = 2;

const DEFAULT_GREP_LIMIT = 100;
const MAX_GREP_LIMIT = 2000;
const GREP_TIMEOUT_MS = 30_000;

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
};

/** Truncate a string to the max line length without breaking characters. */
function truncateLine(line: string, maxLength: number): string {
  const chars = Array.from(line);
  if (chars.length <= maxLength) return line;
  return chars.slice(0, maxLength).join("");
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
  while (start <= end && records[indices[start]]?.isBlank) start += 1;
  while (end >= start && records[indices[end]]?.isBlank) end -= 1;
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
    return [formatLineRecord(records[anchorIndex])];
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
  return trimmed.map((index) => formatLineRecord(records[index]));
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
  execute: async ({ path: targetPath, offset, limit, depth }): Promise<string> => {
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

    const entries = await collectDirEntries(absPath, resolvedDepth);
    const output: string[] = [`Absolute path: ${absPath}`];

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
async function collectDirEntries(basePath: string, depth: number): Promise<DirEntry[]> {
  const entries: DirEntry[] = [];
  const queue: Array<{ dirPath: string; prefix: string; remaining: number }> = [
    { dirPath: basePath, prefix: "", remaining: depth },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const dirEntries = await fs.readdir(current.dirPath, { withFileTypes: true });
    const collected: Array<{ entryPath: string; relativePath: string; entry: DirEntry; kind: DirEntryKind }> = [];

    for (const entry of dirEntries) {
      const relativePath = current.prefix ? path.join(current.prefix, entry.name) : entry.name;
      const normalized = relativePath.split(path.sep).join("/");
      const depthLevel = current.prefix ? current.prefix.split(path.sep).length : 0;
      const displayName = truncateLine(entry.name, MAX_ENTRY_LENGTH);
      const kind: DirEntryKind = entry.isDirectory()
        ? "directory"
        : entry.isSymbolicLink()
          ? "symlink"
          : entry.isFile()
            ? "file"
            : "other";
      collected.push({
        entryPath: path.join(current.dirPath, entry.name),
        relativePath,
        kind,
        entry: {
          name: truncateLine(normalized, MAX_ENTRY_LENGTH),
          displayName,
          depth: depthLevel,
          kind,
        },
      });
    }

    collected.sort((a, b) => a.entry.name.localeCompare(b.entry.name));

    for (const item of collected) {
      entries.push(item.entry);
      if (item.kind === "directory" && current.remaining > 1) {
        queue.push({ dirPath: item.entryPath, prefix: item.relativePath, remaining: current.remaining - 1 });
      }
    }
  }

  return entries;
}

/** Format directory entry line. */
function formatDirEntry(entry: DirEntry): string {
  const indent = " ".repeat(entry.depth * INDENTATION_SPACES);
  let name = entry.displayName;
  if (entry.kind === "directory") name += "/";
  if (entry.kind === "symlink") name += "@";
  if (entry.kind === "other") name += "?";
  return `${indent}${name}`;
}

/** Execute grep files tool with scope enforcement. */
export const grepFilesTool = tool({
  description: grepFilesToolDef.description,
  inputSchema: zodSchema(grepFilesToolDef.parameters),
  execute: async ({ pattern, include, path: targetPath, limit }): Promise<string> => {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) throw new Error("pattern must not be empty");

    const resolvedLimit = typeof limit === "number" ? limit : DEFAULT_GREP_LIMIT;
    if (resolvedLimit <= 0) throw new Error("limit must be greater than zero");

    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { basePath, cwd } = resolveGrepBase({ target: targetPath, allowOutside });
    await fs.stat(basePath);

    const includeValue = include?.trim() || undefined;
    const results = await runRgSearch({
      pattern: trimmedPattern,
      include: includeValue,
      searchPath: basePath,
      limit: Math.min(resolvedLimit, MAX_GREP_LIMIT),
      cwd,
    });

    if (!results.length) return "No matches found.";
    return results.join("\n");
  },
});

type GrepBase = {
  /** Base search path. */
  basePath: string;
  /** Working directory for rg. */
  cwd: string;
};

/** Resolve base path and cwd for grep tool. */
function resolveGrepBase(input: { target?: string; allowOutside: boolean }): GrepBase {
  const { cwd } = resolveToolWorkdir({ allowOutside: input.allowOutside });
  if (input.target) {
    const resolved = resolveToolPath({ target: input.target, allowOutside: input.allowOutside });
    return { basePath: resolved.absPath, cwd };
  }
  return { basePath: cwd, cwd };
}

type RgSearchInput = {
  /** Regex pattern string. */
  pattern: string;
  /** Optional glob filter. */
  include?: string;
  /** Search path. */
  searchPath: string;
  /** Maximum results. */
  limit: number;
  /** Working directory. */
  cwd: string;
};

/** Run a ripgrep search and return file paths. */
async function runRgSearch(input: RgSearchInput): Promise<string[]> {
  const args = [
    "--files-with-matches",
    "--sortr=modified",
    "--regexp",
    input.pattern,
    "--no-messages",
  ];
  if (input.include) {
    args.push("--glob", input.include);
  }
  args.push("--", input.searchPath);

  const output = await runCommand("rg", args, input.cwd, GREP_TIMEOUT_MS);

  if (output.exitCode === 1) return [];
  if (output.exitCode !== 0) {
    const stderr = output.stderr || "rg failed";
    throw new Error(stderr);
  }

  const lines = output.stdout.split("\n").filter(Boolean);
  return lines.slice(0, input.limit);
}

type CommandOutput = {
  /** Exit code. */
  exitCode: number | null;
  /** Stdout content. */
  stdout: string;
  /** Stderr content. */
  stderr: string;
};

/** Run a command with timeout and capture output. */
function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "pipe" });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => stdoutChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(String(chunk)));

    let timeoutId: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("rg timed out after 30 seconds"));
      }, timeoutMs);
    }

    child.once("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new Error(`failed to launch rg: ${String(error)}. Ensure ripgrep is installed and on PATH.`));
    });

    child.once("exit", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        exitCode: code,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });
  });
}
