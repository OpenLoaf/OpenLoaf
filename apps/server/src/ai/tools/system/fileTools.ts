import path from "node:path";
import { promises as fs } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import { tool, zodSchema } from "ai";
import {
  fileDeleteToolDef,
  fileListToolDef,
  fileReadToolDef,
  fileSearchToolDef,
  fileWriteToolDef,
} from "@tenas-ai/api/types/tools/system";
import { resolveProjectPath } from "@/ai/tools/system/projectPath";

/** Max bytes for reading a single file. */
const MAX_FILE_BYTES = 256 * 1024;
/** Max bytes for searching file contents. */
const MAX_SEARCH_FILE_BYTES = 128 * 1024;
/** Max search results to return. */
const DEFAULT_SEARCH_LIMIT = 50;
/** Max depth for recursive search. */
const MAX_SEARCH_DEPTH = 12;
/** Directory names skipped by search. */
const SEARCH_IGNORE_DIRS = new Set([".git", ".tenas", "node_modules", "dist", "build"]);

/** Directory entry output. */
export type DirectoryEntry = {
  /** Entry display name. */
  name: string;
  /** Project-relative entry path. */
  path: string;
  /** Entry type. */
  type: "file" | "dir";
};

/** File read tool output. */
type FileReadToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Project-relative file path. */
    path: string;
    /** File size in bytes. */
    bytes: number;
    /** File content as UTF-8 text. */
    content: string;
  };
};

/** File list tool output. */
type FileListToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Project-relative directory path. */
    path: string;
    /** Directory entries. */
    entries: DirectoryEntry[];
  };
};

/** File search tool output. */
type FileSearchToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Search query string. */
    query: string;
    /** Project-relative search root. */
    root: string;
    /** Matched project-relative paths. */
    results: string[];
  };
};

/** File write tool output. */
type FileWriteToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Project-relative file path. */
    path: string;
    /** Bytes written. */
    bytes: number;
    /** Write mode. */
    mode: "overwrite" | "append";
  };
};

/** File delete tool output. */
type FileDeleteToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Project-relative file path. */
    path: string;
  };
};

/** Ensure the target is a file. */
export async function ensureFile(targetPath: string): Promise<Stats> {
  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) {
    throw new Error("Target is not a file.");
  }
  return stat;
}

/** Ensure the target is a directory. */
async function ensureDirectory(targetPath: string): Promise<Stats> {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error("Target is not a directory.");
  }
  return stat;
}

/** Read a text file with size guard. */
async function readTextFile(targetPath: string): Promise<{ content: string; bytes: number }> {
  const stat = await ensureFile(targetPath);
  // 逻辑：超过上限直接报错，避免读取超大文件。
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error("File too large.");
  }
  const content = await fs.readFile(targetPath, "utf8");
  return { content, bytes: stat.size };
}

/** Collect file list from a directory. */
export async function listDirectory(targetPath: string): Promise<DirectoryEntry[]> {
  await ensureDirectory(targetPath);
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries
    .map((entry) => ({
      name: entry.name,
      path: entry.name,
      type: entry.isDirectory() ? "dir" : "file",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve whether a directory should be skipped during search. */
function shouldSkipSearchDir(name: string): boolean {
  return SEARCH_IGNORE_DIRS.has(name);
}

/** Search files under a directory for a query string. */
async function searchFiles(input: {
  rootPath: string;
  rootRelative: string;
  query: string;
  limit: number;
}): Promise<string[]> {
  const results: string[] = [];
  const queue: Array<{ absPath: string; depth: number }> = [{ absPath: input.rootPath, depth: 0 }];

  // 逻辑：广度遍历目录树，限制深度与结果数量，避免扫描过量文件。
  while (queue.length > 0 && results.length < input.limit) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth > MAX_SEARCH_DEPTH) continue;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(current.absPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= input.limit) break;
      if (entry.isDirectory()) {
        if (shouldSkipSearchDir(entry.name)) continue;
        queue.push({
          absPath: path.join(current.absPath, entry.name),
          depth: current.depth + 1,
        });
        continue;
      }
      if (!entry.isFile()) continue;
      const absPath = path.join(current.absPath, entry.name);
      const relativePath = path
        .relative(input.rootPath, absPath)
        .replace(/\\/g, "/");

      if (entry.name.includes(input.query)) {
        results.push(path.join(input.rootRelative, relativePath).replace(/\\/g, "/"));
        continue;
      }

      let stat: Stats;
      try {
        stat = await fs.stat(absPath);
      } catch {
        continue;
      }
      if (stat.size > MAX_SEARCH_FILE_BYTES) continue;

      let content: string;
      try {
        content = await fs.readFile(absPath, "utf8");
      } catch {
        continue;
      }
      if (content.includes(input.query)) {
        results.push(path.join(input.rootRelative, relativePath).replace(/\\/g, "/"));
      }
    }
  }
  return results;
}

/** Read a project file. */
export const fileReadTool = tool({
  description: fileReadToolDef.description,
  inputSchema: zodSchema(fileReadToolDef.parameters),
  execute: async ({ path: rawPath }): Promise<FileReadToolOutput> => {
    const resolved = resolveProjectPath(rawPath);
    const result = await readTextFile(resolved.absPath);
    return {
      ok: true,
      data: {
        path: resolved.relativePath,
        bytes: result.bytes,
        content: result.content,
      },
    };
  },
});

/** List files under a project directory. */
export const fileListTool = tool({
  description: fileListToolDef.description,
  inputSchema: zodSchema(fileListToolDef.parameters),
  execute: async ({ path: rawPath }): Promise<FileListToolOutput> => {
    const targetPath = rawPath?.trim() || ".";
    const resolved = resolveProjectPath(targetPath);
    const entries = await listDirectory(resolved.absPath);
    const normalized = entries.map((entry) => ({
      ...entry,
      path: path.join(resolved.relativePath, entry.path).replace(/\\/g, "/"),
    }));
    return {
      ok: true,
      data: {
        path: resolved.relativePath,
        entries: normalized,
      },
    };
  },
});

/** Search project files for a query string. */
export const fileSearchTool = tool({
  description: fileSearchToolDef.description,
  inputSchema: zodSchema(fileSearchToolDef.parameters),
  execute: async ({ query, path: rawPath, limit }): Promise<FileSearchToolOutput> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error("query is required.");
    }
    const targetPath = rawPath?.trim() || ".";
    const resolved = resolveProjectPath(targetPath);
    const searchLimit = limit ?? DEFAULT_SEARCH_LIMIT;
    const results = await searchFiles({
      rootPath: resolved.absPath,
      rootRelative: resolved.relativePath,
      query: trimmedQuery,
      limit: searchLimit,
    });
    return {
      ok: true,
      data: {
        query: trimmedQuery,
        root: resolved.relativePath,
        results,
      },
    };
  },
});

/** Write content into a project file. */
export const fileWriteTool = tool({
  description: fileWriteToolDef.description,
  inputSchema: zodSchema(fileWriteToolDef.parameters),
  needsApproval: true,
  execute: async ({ path: rawPath, content, mode }): Promise<FileWriteToolOutput> => {
    const resolved = resolveProjectPath(rawPath);
    const writeMode = mode ?? "overwrite";
    const parent = path.dirname(resolved.absPath);
    // 逻辑：写入前确保目录存在，避免写入失败。
    await fs.mkdir(parent, { recursive: true });
    if (writeMode === "append") {
      await fs.appendFile(resolved.absPath, content, "utf8");
    } else {
      await fs.writeFile(resolved.absPath, content, "utf8");
    }
    return {
      ok: true,
      data: {
        path: resolved.relativePath,
        bytes: Buffer.byteLength(content, "utf8"),
        mode: writeMode,
      },
    };
  },
});

/** Delete a project file. */
export const fileDeleteTool = tool({
  description: fileDeleteToolDef.description,
  inputSchema: zodSchema(fileDeleteToolDef.parameters),
  needsApproval: true,
  execute: async ({ path: rawPath }): Promise<FileDeleteToolOutput> => {
    const resolved = resolveProjectPath(rawPath);
    await ensureFile(resolved.absPath);
    await fs.unlink(resolved.absPath);
    return { ok: true, data: { path: resolved.relativePath } };
  },
});
