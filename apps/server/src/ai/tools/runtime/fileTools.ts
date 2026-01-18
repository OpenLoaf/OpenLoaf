import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, zodSchema } from "ai";
import {
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
} from "@tenas-ai/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { resolveToolPath, resolveToolWorkdir } from "@/ai/tools/runtime/toolScope";

type ReadFileToolOutput = {
  ok: true;
  data: {
    /** Absolute file path. */
    path: string;
    /** Root label describing scope. */
    rootLabel: "workspace" | "project" | "external";
    /** Read mode. */
    mode: "slice" | "indentation";
    /** 1-based start line. */
    startLine: number;
    /** 1-based end line. */
    endLine: number;
    /** Total lines in file. */
    totalLines: number;
    /** Returned content text. */
    content: string;
    /** Whether the output is truncated. */
    truncated: boolean;
  };
};

type ListDirToolOutput = {
  ok: true;
  data: {
    /** Absolute directory path. */
    path: string;
    /** Root label describing scope. */
    rootLabel: "workspace" | "project" | "external";
    /** Recursion depth. */
    depth: number;
    /** Total entries before pagination. */
    total: number;
    /** Entries after pagination. */
    entries: Array<{
      /** Entry name. */
      name: string;
      /** Relative path from base directory. */
      relativePath: string;
      /** Absolute path. */
      path: string;
      /** Entry kind. */
      kind: "file" | "folder";
      /** Recursion depth for this entry. */
      depth: number;
      /** Byte size for files. */
      size?: number;
      /** Last modified time. */
      updatedAt: string;
    }>;
    /** Whether entries were truncated. */
    truncated: boolean;
  };
};

type GrepMatch = {
  /** Absolute file path. */
  path: string;
  /** Relative path from base directory. */
  relativePath: string;
  /** 1-based line number. */
  line: number;
  /** Line text. */
  text: string;
  /** Matched snippet. */
  match: string;
};

type GrepFilesToolOutput = {
  ok: true;
  data: {
    /** Base search path. */
    basePath: string;
    /** Root label describing scope. */
    rootLabel: "workspace" | "project" | "external";
    /** Regex pattern string. */
    pattern: string;
    /** Optional include filter. */
    include?: string;
    /** Total matches returned. */
    totalMatches: number;
    /** Whether results were truncated. */
    truncated: boolean;
    /** Scanned file count. */
    scannedFiles: number;
    /** Skipped file count. */
    skippedFiles: number;
    /** Matched entries. */
    matches: GrepMatch[];
  };
};

type IndentationSliceInput = {
  /** Full lines of file. */
  lines: string[];
  /** 1-based anchor line. */
  anchorLine: number;
  /** Maximum levels to include. */
  maxLevels: number;
  /** Include siblings around anchor. */
  includeSiblings: boolean;
  /** Include parent header. */
  includeHeader: boolean;
  /** Max output lines. */
  maxLines: number;
};

type IndentationSliceResult = {
  startLine: number;
  endLine: number;
  content: string;
  truncated: boolean;
};

/** Resolve indentation count for a line. */
function resolveIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === " ") {
      count += 1;
      continue;
    }
    if (ch === "\t") {
      count += 2;
      continue;
    }
    break;
  }
  return count;
}

/** Resolve whether a line is blank. */
function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

/** Resolve the indentation unit size from an anchor block. */
function resolveIndentUnit(lines: string[], anchorIndex: number, anchorIndent: number): number {
  let minDiff = Infinity;
  for (let i = anchorIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (isBlankLine(line)) continue;
    const indent = resolveIndent(line);
    if (indent <= anchorIndent) break;
    minDiff = Math.min(minDiff, indent - anchorIndent);
    if (minDiff === 1) break;
  }
  return Number.isFinite(minDiff) && minDiff > 0 ? minDiff : 2;
}

/** Resolve the line index to use as anchor when empty lines are involved. */
function resolveAnchorIndex(lines: string[], anchorIndex: number): number {
  let cursor = Math.min(Math.max(anchorIndex, 0), Math.max(lines.length - 1, 0));
  while (cursor > 0 && isBlankLine(lines[cursor] ?? "")) {
    cursor -= 1;
  }
  return cursor;
}

/** Find the parent header line for an anchor indentation. */
function findHeaderIndex(lines: string[], anchorIndex: number, anchorIndent: number): number | null {
  for (let i = anchorIndex - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (isBlankLine(line)) continue;
    const indent = resolveIndent(line);
    if (indent < anchorIndent) return i;
    if (indent === 0) break;
  }
  return null;
}

/** Find the block start line for the same indentation level. */
function findBlockStart(lines: string[], anchorIndex: number, anchorIndent: number): number {
  let cursor = anchorIndex;
  while (cursor > 0) {
    const prevLine = lines[cursor - 1] ?? "";
    if (isBlankLine(prevLine)) {
      cursor -= 1;
      continue;
    }
    const indent = resolveIndent(prevLine);
    if (indent < anchorIndent) break;
    cursor -= 1;
  }
  return cursor;
}

/** Find the block end line for the same indentation level. */
function findBlockEnd(lines: string[], anchorIndex: number, anchorIndent: number): number {
  let cursor = anchorIndex;
  for (let i = anchorIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (isBlankLine(line)) {
      cursor = i;
      continue;
    }
    const indent = resolveIndent(line);
    if (indent < anchorIndent) break;
    cursor = i;
  }
  return cursor;
}

/** Find the block end line for the anchor node only. */
function findAnchorBlockEnd(lines: string[], anchorIndex: number, anchorIndent: number): number {
  let cursor = anchorIndex;
  for (let i = anchorIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (isBlankLine(line)) {
      cursor = i;
      continue;
    }
    const indent = resolveIndent(line);
    if (indent <= anchorIndent) break;
    cursor = i;
  }
  return cursor;
}

/** Build indentation-based slice result. */
function buildIndentationSlice(input: IndentationSliceInput): IndentationSliceResult {
  const lineCount = input.lines.length;
  const anchorIndex = resolveAnchorIndex(input.lines, input.anchorLine - 1);
  const anchorIndent = resolveIndent(input.lines[anchorIndex] ?? "");
  const indentUnit = resolveIndentUnit(input.lines, anchorIndex, anchorIndent);

  const blockStart = input.includeSiblings
    ? findBlockStart(input.lines, anchorIndex, anchorIndent)
    : anchorIndex;
  // 中文注释：不包含兄弟节点时仅截取锚点子树范围。
  const blockEnd = input.includeSiblings
    ? findBlockEnd(input.lines, anchorIndex, anchorIndent)
    : findAnchorBlockEnd(input.lines, anchorIndex, anchorIndent);

  const headerIndex = input.includeHeader
    ? findHeaderIndex(input.lines, blockStart, anchorIndent)
    : null;

  const maxIndent = anchorIndent + indentUnit * input.maxLevels;
  const indices: number[] = [];

  if (headerIndex !== null) {
    indices.push(headerIndex);
  }

  for (let i = blockStart; i <= blockEnd; i += 1) {
    const line = input.lines[i] ?? "";
    if (isBlankLine(line)) {
      indices.push(i);
      continue;
    }
    const indent = resolveIndent(line);
    if (indent <= maxIndent) {
      indices.push(i);
    }
  }

  const uniqueIndices = Array.from(new Set(indices)).sort((a, b) => a - b);
  const limitedIndices =
    uniqueIndices.length > input.maxLines
      ? uniqueIndices.slice(0, input.maxLines)
      : uniqueIndices;
  const truncated = uniqueIndices.length > limitedIndices.length;
  const startLine = limitedIndices[0] != null ? limitedIndices[0] + 1 : 1;
  const endLine = limitedIndices.length
    ? (limitedIndices[limitedIndices.length - 1] ?? 0) + 1
    : Math.min(Math.max(input.anchorLine, 1), Math.max(lineCount, 1));
  const content = limitedIndices.map((index) => input.lines[index] ?? "").join("\n");

  return { startLine, endLine, content, truncated };
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
  }): Promise<ReadFileToolOutput> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { absPath, rootLabel } = resolveToolPath({ target: filePath, allowOutside });
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) throw new Error("Path is not a file.");
    const raw = await fs.readFile(absPath, "utf-8");
    const lines = raw.split(/\r?\n/);
    const totalLines = lines.length;
    const resolvedMode = mode === "indentation" ? "indentation" : "slice";

    if (resolvedMode === "indentation") {
      const resolvedAnchor = anchorLine ?? offset ?? 1;
      const resolvedMaxLevels = typeof maxLevels === "number" ? Math.max(0, maxLevels) : 3;
      const resolvedMaxLines = typeof maxLines === "number" ? Math.max(1, maxLines) : 200;
      // 中文注释：缩进模式提取与锚点相关的代码块，避免一次返回整文件。
      const slice = buildIndentationSlice({
        lines,
        anchorLine: resolvedAnchor,
        maxLevels: resolvedMaxLevels,
        includeSiblings: Boolean(includeSiblings),
        includeHeader: Boolean(includeHeader),
        maxLines: resolvedMaxLines,
      });
      return {
        ok: true,
        data: {
          path: absPath,
          rootLabel,
          mode: resolvedMode,
          startLine: slice.startLine,
          endLine: slice.endLine,
          totalLines,
          content: slice.content,
          truncated: slice.truncated,
        },
      };
    }

    const startLine = Math.max(1, typeof offset === "number" ? offset : 1);
    const maxLinesToRead = Math.max(1, typeof limit === "number" ? limit : 200);
    const startIndex = Math.min(startLine - 1, Math.max(totalLines - 1, 0));
    const endIndex = Math.min(startIndex + maxLinesToRead - 1, Math.max(totalLines - 1, 0));
    const content = lines.slice(startIndex, endIndex + 1).join("\n");
    const truncated = endIndex < totalLines - 1;

    return {
      ok: true,
      data: {
        path: absPath,
        rootLabel,
        mode: resolvedMode,
        startLine: startIndex + 1,
        endLine: endIndex + 1,
        totalLines,
        content,
        truncated,
      },
    };
  },
});

/** Execute list directory tool with scope enforcement. */
export const listDirTool = tool({
  description: listDirToolDef.description,
  inputSchema: zodSchema(listDirToolDef.parameters),
  execute: async ({ path: targetPath, offset, limit, depth }): Promise<ListDirToolOutput> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { absPath, rootLabel } = resolveToolPath({ target: targetPath, allowOutside });
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) throw new Error("Path is not a directory.");
    const resolvedDepth = typeof depth === "number" && depth > 0 ? Math.floor(depth) : 1;
    const entries: ListDirToolOutput["data"]["entries"] = [];

    const walk = async (basePath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > resolvedDepth) return;
      const dirEntries = await fs.readdir(basePath, { withFileTypes: true });
      for (const entry of dirEntries) {
        const entryPath = path.join(basePath, entry.name);
        const entryStat = await fs.stat(entryPath);
        const kind = entryStat.isDirectory() ? "folder" : "file";
        const relativePath = path.relative(absPath, entryPath);
        entries.push({
          name: entry.name,
          relativePath: relativePath || entry.name,
          path: entryPath,
          kind,
          depth: currentDepth,
          size: entryStat.isFile() ? entryStat.size : undefined,
          updatedAt: entryStat.mtime.toISOString(),
        });
        if (entryStat.isDirectory()) {
          await walk(entryPath, currentDepth + 1);
        }
      }
    };

    // 中文注释：递归遍历目录并记录层级信息，便于分页与展示。
    await walk(absPath, 1);

    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const total = entries.length;
    const start = Math.max(1, typeof offset === "number" ? offset : 1);
    const maxItems = Math.max(1, typeof limit === "number" ? limit : total || 1);
    const startIndex = Math.min(start - 1, Math.max(total - 1, 0));
    const endIndex = Math.min(startIndex + maxItems, total);
    const sliced = entries.slice(startIndex, endIndex);
    const truncated = sliced.length < total;

    return {
      ok: true,
      data: {
        path: absPath,
        rootLabel,
        depth: resolvedDepth,
        total,
        entries: sliced,
        truncated,
      },
    };
  },
});

/** Build a regex from input pattern. */
function buildSearchRegex(pattern: string): RegExp {
  const trimmed = pattern.trim();
  if (!trimmed) throw new Error("pattern is required.");
  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const lastSlash = trimmed.lastIndexOf("/");
    const body = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
    return new RegExp(body, normalizedFlags);
  }
  return new RegExp(trimmed, "g");
}

/** Escape a string for regex usage. */
function escapeRegex(raw: string): string {
  return raw.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

/** Build include matcher from a glob-like string. */
function buildIncludeMatcher(include?: string): (value: string) => boolean {
  if (!include) return () => true;
  const trimmed = include.trim();
  if (!trimmed) return () => true;
  if (trimmed.startsWith("re:")) {
    const regex = new RegExp(trimmed.slice(3));
    return (value: string) => regex.test(value);
  }
  const pattern = escapeRegex(trimmed)
    .replace(/\\\*\\\*\/?/g, ".*")
    .replace(/\\\*/g, "[^/]*")
    .replace(/\\\?/g, "[^/]");
  const regex = new RegExp(`^${pattern}$`);
  return (value: string) => regex.test(value);
}

/** Check if a buffer is likely binary content. */
function isBinaryBuffer(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  return sample.includes(0);
}

/** Resolve base path and label for grep tool. */
function resolveGrepBase(input: {
  target?: string;
  allowOutside: boolean;
}): { basePath: string; rootLabel: "workspace" | "project" | "external" } {
  if (input.target) {
    const resolved = resolveToolPath({ target: input.target, allowOutside: input.allowOutside });
    return { basePath: resolved.absPath, rootLabel: resolved.rootLabel };
  }
  const { cwd, rootLabel } = resolveToolWorkdir({ allowOutside: input.allowOutside });
  return { basePath: cwd, rootLabel };
}

/** Execute grep files tool with scope enforcement. */
export const grepFilesTool = tool({
  description: grepFilesToolDef.description,
  inputSchema: zodSchema(grepFilesToolDef.parameters),
  execute: async ({ pattern, include, path: targetPath, limit }): Promise<GrepFilesToolOutput> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { basePath, rootLabel } = resolveGrepBase({ target: targetPath, allowOutside });
    const stat = await fs.stat(basePath);
    const regex = buildSearchRegex(pattern);
    const includeMatcher = buildIncludeMatcher(include);
    const maxMatches = Math.max(1, typeof limit === "number" ? limit : 50);
    const matches: GrepMatch[] = [];
    let scannedFiles = 0;
    let skippedFiles = 0;

    const scanFile = async (filePath: string) => {
      if (matches.length >= maxMatches) return;
      let entryStat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        entryStat = await fs.stat(filePath);
      } catch {
        return;
      }
      if (!entryStat.isFile()) return;
      if (entryStat.size > 2 * 1024 * 1024) {
        // 中文注释：超过 2MB 的文件直接跳过，避免占用过多内存。
        skippedFiles += 1;
        return;
      }
      const buffer = await fs.readFile(filePath);
      if (isBinaryBuffer(buffer)) {
        skippedFiles += 1;
        return;
      }
      const text = buffer.toString("utf-8");
      const lines = text.split(/\r?\n/);
      scannedFiles += 1;
      for (let i = 0; i < lines.length; i += 1) {
        const lineText = lines[i] ?? "";
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(lineText)) !== null) {
          matches.push({
            path: filePath,
            relativePath: path.relative(basePath, filePath) || path.basename(filePath),
            line: i + 1,
            text: lineText,
            match: match[0],
          });
          if (matches.length >= maxMatches) return;
          if (!regex.global) break;
        }
      }
    };

    const walk = async (dirPath: string) => {
      if (matches.length >= maxMatches) return;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (matches.length >= maxMatches) return;
        if (entry.isSymbolicLink()) {
          // 中文注释：跳过符号链接，避免循环引用。
          continue;
        }
        const entryPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, entryPath) || entry.name;
        if (entry.isDirectory()) {
          await walk(entryPath);
          continue;
        }
        const normalizedRelative = relativePath.split(path.sep).join("/");
        if (!includeMatcher(normalizedRelative)) continue;
        await scanFile(entryPath);
      }
    };

    // 中文注释：若目标是文件则直接扫描，否则递归遍历目录。
    if (stat.isFile()) {
      if (includeMatcher(path.basename(basePath))) {
        await scanFile(basePath);
      }
    } else if (stat.isDirectory()) {
      await walk(basePath);
    } else {
      throw new Error("Path must be a file or directory.");
    }

    return {
      ok: true,
      data: {
        basePath,
        rootLabel,
        pattern,
        include: include?.trim() || undefined,
        totalMatches: matches.length,
        truncated: matches.length >= maxMatches,
        scannedFiles,
        skippedFiles,
        matches,
      },
    };
  },
});
