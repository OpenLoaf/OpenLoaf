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
  "ls",
  "ll",
  "which",
  "pwd",
  "whoami",
  "uname",
  "date",
  "find",
  "grep",
  "rg",
  "ag",
  "cat",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "stat",
  "du",
  "df",
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
  "awk",
  "sed",
  "xargs",
  "cut",
  "tr",
  "jq",
  "column",
  "sort",
  "uniq",
  "head",
  "tail",
  "wc",
  "ping",
  "traceroute",
  "nslookup",
  "dig",
  "host",
  "curl",
  "wget",
  "whois",
]);
const READONLY_COMMANDS_WIN = new Set([
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
  "systeminfo",
  "ipconfig",
  "get-computerinfo",
  "get-ciminstance",
  "ping",
  "tracert",
  "nslookup",
  "curl",
  "wget",
  "whoami",
  "hostname",
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
  // 中文注释：重定向/命令替换/多语句视为高风险。
  if (command.includes("\n")) return true;
  if (command.includes("`")) return true;
  if (command.includes("$(")) return true;
  return /[;&<>]/.test(command);
}

function isSafePipeChain(command: string): boolean {
  const segments = command.split("|").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((segment) => {
    const [rawToken] = segment.split(/\s+/);
    if (!rawToken) return false;
    const token = normalizeCommandToken(rawToken);
    if (token === "sudo") return false;
    if (SHELL_BINARIES.has(token)) return false;
    return isReadOnlyCommandToken(token);
  });
}

/** Resolve approval requirement for shell-like commands. */
export function needsApprovalForCommand(command: string | string[] | undefined): boolean {
  if (Array.isArray(command)) {
    const [rawToken] = command;
    if (!rawToken) return true;
    const token = normalizeCommandToken(rawToken);
    if (token === "sudo") return true;
    if (SHELL_BINARIES.has(token)) return true;
    return !isReadOnlyCommandToken(token);
  }

  const trimmed = command?.trim() ?? "";
  if (!trimmed) return true;
  if (hasUnsafeOperators(trimmed)) return true;
  if (trimmed.includes("|") && !isSafePipeChain(trimmed)) return true;
  const [rawToken] = trimmed.split(/\s+/);
  if (!rawToken) return true;
  const token = normalizeCommandToken(rawToken);
  if (token === "sudo") return true;
  if (SHELL_BINARIES.has(token)) return true;
  return !isReadOnlyCommandToken(token);
}
