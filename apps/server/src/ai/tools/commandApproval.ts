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

// ─── 安全命令白名单 ─────────────────────────────────────────────────────────

const SAFE_COMMANDS_UNIX = new Set([
  // 文件系统查看
  "ls", "ll", "which", "pwd", "whoami", "uname", "date", "find", "stat",
  "du", "df", "file", "tree", "realpath", "readlink", "basename", "dirname",
  // 文本搜索与处理
  "grep", "rg", "ag", "cat", "head", "tail", "wc", "sort", "uniq",
  "awk", "sed", "xargs", "cut", "tr", "jq", "yq", "column", "diff",
  "comm", "tee", "less", "more", "strings", "hexdump", "xxd",
  // 系统信息
  "ps", "id", "groups", "who", "w", "uptime", "hostname", "env", "printenv",
  "top", "htop", "vmstat", "iostat", "dmesg", "last", "finger",
  "lsblk", "lscpu", "free", "vm_stat", "sw_vers", "system_profiler",
  // 网络（只读）
  "ping", "traceroute", "nslookup", "dig", "host", "curl", "wget",
  "whois", "ifconfig", "netstat", "ss",
  // 归档压缩
  "unzip", "zip", "tar", "gzip", "gunzip", "bzip2", "bunzip2",
  "xz", "unxz", "zstd", "unrar", "7z", "7za",
  // 文件创建（非破坏性）
  "mkdir", "touch", "cp", "ln", "install",
  // 校验与编码
  "md5", "md5sum", "shasum", "sha256sum", "base64",
  // macOS 预览
  "open", "pbcopy", "pbpaste",
  // 版本控制
  "git", "svn",
  // 运行时 & 解释器
  "python", "python3", "node", "bun", "deno", "ruby", "perl", "php",
  "java", "javac", "go", "rustc", "cargo", "swift", "swiftc", "dotnet",
  // 包管理器
  "pip", "pip3", "uv", "npm", "npx", "pnpm", "yarn", "brew",
  "apt", "apt-get", "yum", "dnf", "pacman", "conda", "poetry", "pdm", "pipx",
  // 构建工具
  "make", "cmake", "ninja", "gradle", "mvn", "ant",
  // Playwright（浏览器自动化，开发工具）
  "playwright",
  // 其他安全命令
  "echo", "printf", "expr", "bc", "man", "help", "info", "type",
  "nproc", "seq", "yes", "true", "false", "sleep", "time", "timeout",
]);

const SAFE_COMMANDS_WIN = new Set([
  "ls", "dir", "gci", "get-childitem", "where", "get-command",
  "pwd", "whoami", "hostname", "find", "findstr", "select-string", "tree", "type",
  "systeminfo", "ipconfig", "get-computerinfo", "get-ciminstance",
  "ping", "tracert", "nslookup", "curl", "wget",
  "expand-archive", "compress-archive", "tar", "mkdir", "new-item",
  "copy-item", "copy", "cp",
  "python", "python3", "node", "npm", "npx", "pnpm", "yarn",
  "pip", "pip3", "git", "dotnet", "cargo", "go",
  "echo", "write-output", "get-content", "cat", "sort", "measure-object",
]);

const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "fish", "powershell", "pwsh", "cmd"]);

/**
 * 沙箱限定安全命令：这些命令在沙箱目录内操作时免审批。
 * 它们对用户源码/系统文件有破坏性，但在会话私有目录（CURRENT_CHAT_DIR 等）内是安全的。
 */
const SANDBOX_ONLY_COMMANDS = new Set(["rm", "mv", "rmdir"]);

// ─── 核心逻辑 ───────────────────────────────────────────────────────────────

/** 提取命令的首个 token（归一化为小写、去扩展名）。 */
function extractLeadCommand(segment: string): string {
  const trimmed = segment.trim();
  const [rawToken] = trimmed.split(/\s+/);
  if (!rawToken) return "";
  const cleaned = rawToken.replace(/^['"]|['"]$/g, "");
  return path.basename(cleaned).toLowerCase().replace(/\.(exe|cmd)$/i, "");
}

/** 判断单个命令 token 是否安全。 */
function isSafeCommand(token: string): boolean {
  if (!token) return false;
  if (token === "sudo") return false;
  if (SHELL_BINARIES.has(token)) return false;
  const allowlist = process.platform === "win32" ? SAFE_COMMANDS_WIN : SAFE_COMMANDS_UNIX;
  return allowlist.has(token);
}

/**
 * 剥离引号内容，避免引号内的 shell 元字符被误判。
 *   python3 -c "import os; print(os.getcwd())"  →  python3 -c "_Q_"
 */
function maskQuotedStrings(command: string): string {
  return command
    .replace(/\$'(?:[^'\\]|\\.)*'/g, "'_Q_'")
    .replace(/'[^']*'/g, "'_Q_'")
    .replace(/"(?:[^"\\]|\\.)*"/g, '"_Q_"');
}

/**
 * 检测命令中是否存在不安全的 shell 操作符。
 * 在剥离引号内容后进行检查，避免引号内的 ;、>、\n 等被误判。
 */
function hasUnsafeShellOps(masked: string): boolean {
  // 命令替换
  if (masked.includes("`") || masked.includes("$(")) return true;
  // 分号（命令分隔符）
  if (masked.includes(";")) return true;
  // 多行（引号内的换行已被 mask）
  if (masked.includes("\n")) return true;
  // 先移除安全的 stderr 重定向模式，再检查危险操作符
  const noSafeRedir = masked
    .replace(/[12]>&[12]/g, "")
    .replace(/\d*>\s*\/dev\/null/g, "")
    .replace(/&>\s*\/dev\/null/g, "");
  // 单独的 &（后台执行），排除 &&
  if (/(?<!\&)\&(?!\&)/.test(noSafeRedir)) return true;
  // 危险重定向（> <）
  if (/[<>]/.test(noSafeRedir)) return true;
  return false;
}

/**
 * 将命令按 shell 链式操作符（&&, ||, |）拆分为段落，
 * 检查每段的首个命令是否在白名单中。
 */
function allSegmentsSafe(command: string): boolean {
  // 按 &&、|| 拆分
  const chainSegments = command.split(/\s*(?:\&\&|\|\|)\s*/);
  for (const segment of chainSegments) {
    if (!segment.trim()) continue;
    // 每段可能还有管道
    const pipeSegments = segment.split(/\s*\|\s*/);
    for (const pipeSeg of pipeSegments) {
      const token = extractLeadCommand(pipeSeg);
      if (!isSafeCommand(token)) return false;
    }
  }
  return true;
}

/**
 * 检查所有命令段是否为白名单命令或沙箱限定安全命令。
 * 用于沙箱豁免判定：即使命令本身（rm/mv 等）不在全局白名单中，
 * 只要路径都在沙箱内就可以放行。
 */
function allSegmentsSafeOrSandboxSafe(command: string): boolean {
  const chainSegments = command.split(/\s*(?:\&\&|\|\|)\s*/);
  for (const segment of chainSegments) {
    if (!segment.trim()) continue;
    const pipeSegments = segment.split(/\s*\|\s*/);
    for (const pipeSeg of pipeSegments) {
      const token = extractLeadCommand(pipeSeg);
      if (!isSafeCommand(token) && !SANDBOX_ONLY_COMMANDS.has(token)) return false;
    }
  }
  return true;
}

// ─── 沙箱目录检测 ──────────────────────────────────────────────────────────

/** 判断 target 路径是否在 root 下（或等于 root）。 */
function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * 提取命令字符串中所有"看起来是绝对路径"的 token。
 * 支持：/abs/path、~/rel、C:\foo\bar 等。
 * 只在空白/分隔符之后出现的才算，避免误匹配 URL 中的 //。
 */
function extractAbsolutePaths(command: string): string[] {
  const found: string[] = [];
  const pattern =
    /(?:^|[\s"'=:,;|&<>()`])(~\/[^\s"'`;|&<>()]*|\/[^\s"'`;|&<>():]*|[a-zA-Z]:\\[^\s"'`;|&<>()]*)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(command)) !== null) {
    const p = m[1];
    if (p && p.length > 1) found.push(p);
  }
  return found;
}

/** 系统二进制路径前缀（工具调用时硬引用，不算用户文件）。 */
const SYSTEM_PATH_PREFIXES = [
  "/bin/", "/sbin/", "/usr/", "/opt/", "/etc/",
  "/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr",
  "/tmp/", "/System/", "/Library/", "/var/",
];

function isSystemPath(absPath: string): boolean {
  return SYSTEM_PATH_PREFIXES.some(
    (prefix) => absPath === prefix.replace(/\/$/, "") || absPath.startsWith(prefix),
  );
}

/**
 * 命令中出现的所有绝对/home 路径是否都落在 sandboxDirs 集合内。
 * 系统路径（/bin、/usr 等）不影响判断；若命令里没有出现任何绝对路径，
 * 返回 false（让调用方走常规判定，不特权化纯相对路径命令）。
 */
function commandStaysInSandbox(command: string, sandboxDirs: string[]): boolean {
  if (sandboxDirs.length === 0) return false;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const resolvedSandboxes = sandboxDirs.map((d) => path.resolve(d));
  const found = extractAbsolutePaths(command);
  if (found.length === 0) return false;
  for (const raw of found) {
    const expanded = raw.startsWith("~") ? raw.replace(/^~/, home) : raw;
    const abs = path.resolve(expanded);
    if (isSystemPath(abs)) continue;
    const insideAny = resolvedSandboxes.some((sb) => isPathInside(sb, abs));
    if (!insideAny) return false;
  }
  return true;
}

// ─── 导出 ───────────────────────────────────────────────────────────────────

export interface ApprovalOptions {
  /**
   * 沙箱目录白名单（绝对路径）。若命令里所有用户路径都落在这些目录内，
   * 即使命令含有重定向、分号等"危险"操作符，也无需审批。典型值：
   * CURRENT_CHAT_DIR / CURRENT_BOARD_DIR 对应的绝对路径。
   */
  sandboxDirs?: string[];
}

/** 判断 shell 命令是否需要用户审批。false = 安全，true = 需要审批。 */
export function needsApprovalForCommand(
  command: string | string[] | undefined,
  options?: ApprovalOptions,
): boolean {
  // 数组形式：只看第一个 token
  if (Array.isArray(command)) {
    return !isSafeCommand(extractLeadCommand(command[0] ?? ""));
  }

  const trimmed = command?.trim() ?? "";
  if (!trimmed) return true;

  // 1. 剥离引号内容
  const masked = maskQuotedStrings(trimmed);

  // 2. 检查 shell 操作符
  const hasUnsafeOps = hasUnsafeShellOps(masked);
  // 3. 检查每段命令是否在白名单中
  const hasUnsafeSegment = !allSegmentsSafe(masked);

  if (!hasUnsafeOps && !hasUnsafeSegment) return false;

  // 沙箱豁免：命令中所有用户路径均在沙箱目录内时，放行以下两种情况：
  // 1. 白名单命令 + 危险 I/O 操作符（重定向、分号等）
  // 2. 沙箱限定命令（rm、mv 等）— 对用户源码有破坏性，但在会话沙箱内安全
  // 注意：sudo、shell 二进制等不在任何安全集合中，始终需要审批。
  if (
    options?.sandboxDirs?.length &&
    allSegmentsSafeOrSandboxSafe(masked) &&
    commandStaysInSandbox(trimmed, options.sandboxDirs)
  ) {
    return false;
  }

  return true;
}
