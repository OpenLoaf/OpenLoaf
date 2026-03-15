/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";

const READONLY_COMMANDS_UNIX = new Set([
  // filesystem inspection
  "ls",
  "ll",
  "which",
  "pwd",
  "whoami",
  "uname",
  "date",
  "find",
  "stat",
  "du",
  "df",
  "file",
  "tree",
  "realpath",
  "readlink",
  "basename",
  "dirname",
  // text search & processing
  "grep",
  "rg",
  "ag",
  "cat",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "awk",
  "sed",
  "xargs",
  "cut",
  "tr",
  "jq",
  "yq",
  "column",
  "diff",
  "comm",
  "tee",
  "less",
  "more",
  "strings",
  "hexdump",
  "xxd",
  // system info
  "ps",
  "id",
  "groups",
  "who",
  "w",
  "uptime",
  "hostname",
  "env",
  "printenv",
  "top",
  "htop",
  "vmstat",
  "iostat",
  "dmesg",
  "last",
  "finger",
  "lsblk",
  "lscpu",
  "free",
  "vm_stat",
  "sw_vers",
  "system_profiler",
  // network (read-only)
  "ping",
  "traceroute",
  "nslookup",
  "dig",
  "host",
  "curl",
  "wget",
  "whois",
  "ifconfig",
  "netstat",
  "ss",
  // archive & compression (non-destructive: create/extract files)
  "unzip",
  "zip",
  "tar",
  "gzip",
  "gunzip",
  "bzip2",
  "bunzip2",
  "xz",
  "unxz",
  "zstd",
  "unrar",
  "7z",
  "7za",
  // file creation (non-destructive)
  "mkdir",
  "touch",
  "cp",
  "ln",
  "install",
  // checksum & encoding
  "md5",
  "md5sum",
  "shasum",
  "sha256sum",
  "base64",
  // open / preview (macOS)
  "open",
  "pbcopy",
  "pbpaste",
  // version control (read & safe-write operations)
  "git",
  "svn",
  // runtimes & interpreters
  "python",
  "python3",
  "node",
  "bun",
  "deno",
  "ruby",
  "perl",
  "php",
  "java",
  "javac",
  "go",
  "rustc",
  "cargo",
  "swift",
  "swiftc",
  "dotnet",
  // package managers
  "pip",
  "pip3",
  "uv",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "brew",
  "apt",
  "apt-get",
  "yum",
  "dnf",
  "pacman",
  "conda",
  "poetry",
  "pdm",
  "pipx",
  // build tools
  "make",
  "cmake",
  "ninja",
  "gradle",
  "mvn",
  "ant",
  // misc safe
  "echo",
  "printf",
  "expr",
  "bc",
  "man",
  "help",
  "info",
  "type",
  "nproc",
  "seq",
  "yes",
  "true",
  "false",
  "sleep",
  "time",
  "timeout",
]);
const READONLY_COMMANDS_WIN = new Set([
  // filesystem
  "ls",
  "dir",
  "gci",
  "get-childitem",
  "where",
  "get-command",
  "pwd",
  "whoami",
  "hostname",
  "find",
  "findstr",
  "select-string",
  "tree",
  "type",
  // system info
  "systeminfo",
  "ipconfig",
  "get-computerinfo",
  "get-ciminstance",
  // network
  "ping",
  "tracert",
  "nslookup",
  "curl",
  "wget",
  // archive & file creation
  "expand-archive",
  "compress-archive",
  "tar",
  "mkdir",
  "new-item",
  "copy-item",
  "copy",
  "cp",
  // runtimes & package managers
  "python",
  "python3",
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "pip",
  "pip3",
  "git",
  "dotnet",
  "cargo",
  "go",
  // misc safe
  "echo",
  "write-output",
  "get-content",
  "cat",
  "sort",
  "measure-object",
]);
const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "fish", "powershell", "pwsh", "cmd"]);

function normalizeCommandToken(token: string): string {
  const trimmed = token.trim().replace(/^['"]|['"]$/g, "");
  const base = path.basename(trimmed);
  return base.toLowerCase().replace(/\.(exe|cmd)$/i, "");
}

function isReadOnlyCommandToken(token: string): boolean {
  const allowlist = process.platform === "win32" ? READONLY_COMMANDS_WIN : READONLY_COMMANDS_UNIX;
  return allowlist.has(token);
}

function hasUnsafeOperators(command: string): boolean {
  // 多行、命令替换视为高风险。
  if (command.includes("\n")) return true;
  if (command.includes("`")) return true;
  if (command.includes("$(")) return true;
  // 重定向（> <）、分号（;）、后台执行（单独 &）视为高风险。
  // 但 && 是安全的链式操作符，需要排除。
  if (/[;<>]/.test(command)) return true;
  // 检测单独的 &（后台执行），排除 &&
  if (/(?<!\&)\&(?!\&)/.test(command)) return true;
  return false;
}

/** Check if a single command token is safe (no approval needed). */
function isSafeToken(rawToken: string): boolean {
  const token = normalizeCommandToken(rawToken);
  if (token === "sudo") return false;
  if (SHELL_BINARIES.has(token)) return false;
  return isReadOnlyCommandToken(token);
}

/** Check if all segments of a pipe/chain are safe commands. */
function isSafeCommandChain(command: string, separator: string | RegExp): boolean {
  const segments = command.split(separator).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((segment) => {
    // 递归检查：每个段落可能还包含管道
    if (segment.includes("|")) return isSafeCommandChain(segment, "|");
    const [rawToken] = segment.split(/\s+/);
    if (!rawToken) return false;
    return isSafeToken(rawToken);
  });
}

/** Resolve approval requirement for shell-like commands. */
export function needsApprovalForCommand(command: string | string[] | undefined): boolean {
  if (Array.isArray(command)) {
    const [rawToken] = command;
    if (!rawToken) return true;
    return !isSafeToken(rawToken);
  }

  const trimmed = command?.trim() ?? "";
  if (!trimmed) return true;
  if (hasUnsafeOperators(trimmed)) return true;

  // 支持 &&、|| 链式和 | 管道的安全检查
  const hasChain = trimmed.includes("&&") || trimmed.includes("||");
  const hasPipe = trimmed.includes("|") && !hasChain;

  if (hasChain) {
    return !isSafeCommandChain(trimmed, /\&\&|\|\|/);
  }
  if (hasPipe) {
    return !isSafeCommandChain(trimmed, "|");
  }

  const [rawToken] = trimmed.split(/\s+/);
  if (!rawToken) return true;
  return !isSafeToken(rawToken);
}
