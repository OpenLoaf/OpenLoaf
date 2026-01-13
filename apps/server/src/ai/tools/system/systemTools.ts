import os from "node:os";
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
  shellDestructiveToolDef,
  shellReadonlyToolDef,
  shellWriteToolDef,
  timeNowToolDef,
  webFetchToolDef,
  webSearchToolDef,
} from "@tenas-ai/api/types/tools/system";
import { resolveProjectPath, resolveProjectRootPath } from "@/ai/tools/system/projectPath";

/** Max bytes for reading a single file. */
const MAX_FILE_BYTES = 256 * 1024;
/** Max bytes for searching file contents. */
const MAX_SEARCH_FILE_BYTES = 128 * 1024;
/** Max search results to return. */
const DEFAULT_SEARCH_LIMIT = 50;
/** Max depth for recursive search. */
const MAX_SEARCH_DEPTH = 12;
/** Max bytes for web fetch response. */
const MAX_WEB_FETCH_BYTES = 1024 * 1024;
/** Default fetch timeout. */
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
/** Directory names skipped by search. */
const SEARCH_IGNORE_DIRS = new Set([".git", ".tenas", "node_modules", "dist", "build"]);

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
    entries: Array<{
      /** Entry display name. */
      name: string;
      /** Project-relative entry path. */
      path: string;
      /** Entry type. */
      type: "file" | "dir";
    }>;
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

/** Shell readonly tool output. */
type ShellReadonlyToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Original command string. */
    cmd: string;
    /** Command output. */
    output: string;
  };
};

/** Shell write tool output. */
type ShellWriteToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Original command string. */
    cmd: string;
    /** Project-relative path. */
    path: string;
  };
};

/** Shell destructive tool output. */
type ShellDestructiveToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Original command string. */
    cmd: string;
    /** Project-relative path. */
    path: string;
  };
};

/** Web fetch tool output. */
type WebFetchToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Fetched URL. */
    url: string;
    /** HTTP status code. */
    status: number;
    /** Response content type. */
    contentType: string | null;
    /** Response body text. */
    content: string;
  };
};

/** Web search tool output. */
type WebSearchToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Search query string. */
    query: string;
    /** Search results list. */
    results: Array<{
      /** Result title. */
      title: string;
      /** Result URL. */
      url: string;
      /** Optional snippet. */
      snippet?: string;
    }>;
  };
};

/** Split a command string into tokens. */
function splitCommand(raw: string): { command: string; args: string[] } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("cmd is required.");
  // 逻辑：禁止管道与重定向等复杂语法，避免绕过白名单。
  if (/[|;&><]/.test(trimmed)) {
    throw new Error("Unsupported shell syntax.");
  }
  const parts = trimmed.split(/\s+/);
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

/** Ensure the target is a file. */
async function ensureFile(targetPath: string): Promise<Stats> {
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
async function listDirectory(targetPath: string): Promise<FileListToolOutput["data"]["entries"]> {
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

/** Validate public URL for web requests. */
function assertPublicUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https urls are allowed.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Localhost is not allowed.");
  }
  if (hostname === "::1") {
    throw new Error("Localhost is not allowed.");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    const [a, b] = hostname.split(".").map((part) => Number(part));
    // 逻辑：拦截常见内网与保留地址段。
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      throw new Error("Private network addresses are not allowed.");
    }
  }
}

/** Fetch response text with timeout and size limit. */
async function fetchTextWithLimit(input: {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ status: number; contentType: string | null; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }
    const contentLength = response.headers.get("content-length");
    const maxBytes = input.maxBytes ?? MAX_WEB_FETCH_BYTES;
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error("Response too large.");
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error("Response too large.");
    }
    const text = new TextDecoder().decode(buffer);
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Parse DuckDuckGo response into search results. */
function parseDuckDuckGoResults(payload: any, limit: number): WebSearchToolOutput["data"]["results"] {
  const results: WebSearchToolOutput["data"]["results"] = [];
  const pushEntry = (entry: any) => {
    if (!entry || results.length >= limit) return;
    if (entry.FirstURL && entry.Text) {
      results.push({
        title: entry.Text,
        url: entry.FirstURL,
        snippet: entry.Text,
      });
    }
  };

  if (Array.isArray(payload?.Results)) {
    for (const entry of payload.Results) {
      pushEntry(entry);
      if (results.length >= limit) break;
    }
  }

  if (Array.isArray(payload?.RelatedTopics)) {
    for (const topic of payload.RelatedTopics) {
      if (results.length >= limit) break;
      if (Array.isArray(topic.Topics)) {
        for (const sub of topic.Topics) {
          pushEntry(sub);
          if (results.length >= limit) break;
        }
      } else {
        pushEntry(topic);
      }
    }
  }

  return results.slice(0, limit);
}

/** Resolve current server time info. */
export const timeNowTool = tool({
  description: timeNowToolDef.description,
  inputSchema: zodSchema(timeNowToolDef.parameters),
  execute: async ({ timezone }) => {
    const now = new Date();
    const tz = timezone?.trim();

    let resolvedTimeZone: string | undefined;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", tz ? { timeZone: tz } : undefined);
      resolvedTimeZone = formatter.resolvedOptions().timeZone;
    } catch {
      throw new Error(`Invalid timezone: ${tz}`);
    }

    return {
      ok: true,
      data: {
        iso: now.toISOString(),
        unixMs: now.getTime(),
        timeZone: resolvedTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  },
});

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

/** Execute readonly shell command. */
export const shellReadonlyTool = tool({
  description: shellReadonlyToolDef.description,
  inputSchema: zodSchema(shellReadonlyToolDef.parameters),
  execute: async ({ cmd }): Promise<ShellReadonlyToolOutput> => {
    const { command, args } = splitCommand(cmd);
    if (!command) throw new Error("cmd is required.");

    if (command === "date") {
      return { ok: true, data: { cmd, output: new Date().toString() } };
    }
    if (command === "uname") {
      return { ok: true, data: { cmd, output: `${os.type()} ${os.release()}` } };
    }
    if (command === "whoami") {
      return { ok: true, data: { cmd, output: os.userInfo().username } };
    }
    if (command === "pwd") {
      const { rootPath } = resolveProjectRootPath();
      return { ok: true, data: { cmd, output: rootPath } };
    }
    if (command === "ls") {
      const flags = args.filter((arg) => arg.startsWith("-"));
      if (flags.length > 0) {
        throw new Error("ls flags are not supported.");
      }
      const positionals = args.filter((arg) => !arg.startsWith("-"));
      if (positionals.length > 1) {
        throw new Error("ls supports a single path.");
      }
      const targetArg = positionals[0] ?? ".";
      const resolved = resolveProjectPath(targetArg);
      const entries = await listDirectory(resolved.absPath);
      const output = entries
        .map((entry) => (entry.type === "dir" ? `${entry.name}/` : entry.name))
        .join("\n");
      return { ok: true, data: { cmd, output } };
    }

    throw new Error("Unsupported readonly command.");
  },
});

/** Execute write shell command. */
export const shellWriteTool = tool({
  description: shellWriteToolDef.description,
  inputSchema: zodSchema(shellWriteToolDef.parameters),
  needsApproval: true,
  execute: async ({ cmd }): Promise<ShellWriteToolOutput> => {
    const { command, args } = splitCommand(cmd);
    if (command !== "mkdir") {
      throw new Error("Only mkdir is supported.");
    }
    if (args.length !== 1 || args[0].startsWith("-")) {
      throw new Error("mkdir requires a single path.");
    }
    const targetPath = args[0];
    if (!targetPath) {
      throw new Error("mkdir requires a path.");
    }
    const resolved = resolveProjectPath(targetPath);
    await fs.mkdir(resolved.absPath, { recursive: true });
    return { ok: true, data: { cmd, path: resolved.relativePath } };
  },
});

/** Execute destructive shell command. */
export const shellDestructiveTool = tool({
  description: shellDestructiveToolDef.description,
  inputSchema: zodSchema(shellDestructiveToolDef.parameters),
  needsApproval: true,
  execute: async ({ cmd }): Promise<ShellDestructiveToolOutput> => {
    const { command, args } = splitCommand(cmd);
    if (command !== "rm") {
      throw new Error("Only rm is supported.");
    }
    if (args.length !== 1 || args[0].startsWith("-")) {
      throw new Error("rm requires a single file path.");
    }
    const targetPath = args[0];
    if (!targetPath) {
      throw new Error("rm requires a path.");
    }
    const resolved = resolveProjectPath(targetPath);
    await ensureFile(resolved.absPath);
    await fs.unlink(resolved.absPath);
    return { ok: true, data: { cmd, path: resolved.relativePath } };
  },
});

/** Fetch web content via http/https. */
export const webFetchTool = tool({
  description: webFetchToolDef.description,
  inputSchema: zodSchema(webFetchToolDef.parameters),
  execute: async ({ url }): Promise<WebFetchToolOutput> => {
    const parsed = new URL(url);
    assertPublicUrl(parsed);
    const response = await fetchTextWithLimit({ url: parsed.toString() });
    return {
      ok: true,
      data: {
        url: parsed.toString(),
        status: response.status,
        contentType: response.contentType,
        content: response.text,
      },
    };
  },
});

/** Perform web search (DuckDuckGo). */
export const webSearchTool = tool({
  description: webSearchToolDef.description,
  inputSchema: zodSchema(webSearchToolDef.parameters),
  execute: async ({ query, limit }): Promise<WebSearchToolOutput> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error("query is required.");
    }
    const searchUrl = new URL("https://api.duckduckgo.com/");
    searchUrl.searchParams.set("q", trimmedQuery);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("no_html", "1");
    searchUrl.searchParams.set("skip_disambig", "1");
    const response = await fetchTextWithLimit({
      url: searchUrl.toString(),
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      maxBytes: MAX_WEB_FETCH_BYTES,
    });
    const payload = JSON.parse(response.text);
    const results = parseDuckDuckGoResults(payload, limit ?? 8);
    return { ok: true, data: { query: trimmedQuery, results } };
  },
});
