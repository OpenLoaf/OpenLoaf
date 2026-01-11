import path from "node:path";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, type IPty } from "node-pty";
import { logger } from "@/common/logger";
import { createRequire } from "node:module";

/** Idle timeout for terminal sessions (milliseconds). */
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Cleanup interval for terminal sessions (milliseconds). */
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

type TerminalSession = {
  /** Unique session id. */
  id: string;
  /** Token required for websocket attachment. */
  token: string;
  /** Resolved working directory. */
  cwd: string;
  /** Creation timestamp (ms). */
  createdAt: number;
  /** Last activity timestamp (ms). */
  lastActiveAt: number;
  /** PTY process instance. */
  pty: IPty;
};

const sessions = new Map<string, TerminalSession>();
let cleanupTimer: NodeJS.Timeout | null = null;

/** Resolve whether terminal feature is enabled. */
export function isTerminalEnabled(): boolean {
  return process.env.TENAS_ENABLE_TERMINAL === "1";
}

/** Resolve a terminal working directory from user input. */
function resolveTerminalCwd(pwd: string): string {
  if (!pwd) return process.cwd();
  try {
    if (pwd.startsWith("file://")) {
      const url = new URL(pwd);
      const filePath = fileURLToPath(url);
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        if (stat.isDirectory()) return filePath;
        if (stat.isFile()) return path.dirname(filePath);
      }
      return process.cwd();
    }
  } catch {
    // 中文注释：解析 file:// 失败时继续回退为普通路径逻辑。
  }
  const resolved = path.resolve(pwd);
  try {
    if (existsSync(resolved)) {
      const stat = statSync(resolved);
      if (stat.isDirectory()) return resolved;
      if (stat.isFile()) return path.dirname(resolved);
    }
  } catch {
    // ignore
  }
  return process.cwd();
}

/** Resolve the default shell for the current OS. */
function resolveTerminalShellCandidates(): Array<{ file: string; args: string[] }> {
  const customShell = process.env.TENAS_TERMINAL_SHELL?.trim();
  const candidates: Array<{ file: string; args: string[] }> = [];
  const pushCandidate = (file?: string | null) => {
    if (!file) return;
    const trimmed = file.trim();
    if (!trimmed) return;
    candidates.push({ file: trimmed, args: resolveShellArgs(trimmed) });
  };

  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    pushCandidate(customShell);
    pushCandidate(process.env.ComSpec);
    pushCandidate(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`);
    pushCandidate("powershell.exe");
    pushCandidate("pwsh.exe");
    pushCandidate("cmd.exe");
    return candidates;
  }

  pushCandidate(customShell);
  pushCandidate(process.env.SHELL);
  pushCandidate("/bin/zsh");
  pushCandidate("/bin/bash");
  pushCandidate("/bin/sh");
  pushCandidate("sh");
  return candidates;
}

/** Resolve default args for a shell executable. */
function resolveShellArgs(file: string): string[] {
  const lowered = file.toLowerCase();
  if (lowered.includes("powershell") || lowered.endsWith("pwsh.exe")) {
    return ["-NoLogo"];
  }
  return [];
}

/** Ensure spawn-helper is executable for node-pty on unix. */
function ensureSpawnHelperExecutable(): void {
  if (process.platform === "win32") return;
  try {
    const require = createRequire(import.meta.url);
    const packageRoot = path.dirname(require.resolve("node-pty/package.json"));
    const candidates = [
      path.join(packageRoot, "build", "Release", "spawn-helper"),
      path.join(packageRoot, "build", "Debug", "spawn-helper"),
      path.join(
        packageRoot,
        "prebuilds",
        `${process.platform}-${process.arch}`,
        "spawn-helper"
      ),
    ];
    const helperPath = candidates.find((candidate) => existsSync(candidate));
    if (!helperPath) return;
    const stat = statSync(helperPath);
    // 中文注释：确保 spawn-helper 可执行，避免 posix_spawnp 失败。
    if ((stat.mode & 0o111) === 0) {
      chmodSync(helperPath, stat.mode | 0o111);
    }
  } catch (error) {
    logger.warn({ err: error }, "[terminal] ensure spawn-helper failed");
  }
}

/** Build environment variables for the terminal process. */
function buildTerminalEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // 中文注释：确保终端能力默认是 xterm-256color，便于颜色渲染。
    TERM: process.env.TERM || "xterm-256color",
  };
  const pathEntries = (env["PATH"] ?? "").split(path.delimiter).filter(Boolean);
  const ensurePath = (entry: string) => {
    if (!pathEntries.includes(entry)) pathEntries.push(entry);
  };
  // 中文注释：补齐常见 PATH，避免 GUI 进程缺失路径导致 spawn 失败。
  ensurePath("/usr/bin");
  ensurePath("/bin");
  ensurePath("/usr/sbin");
  ensurePath("/sbin");
  if (process.platform === "darwin") {
    ensurePath("/usr/local/bin");
    ensurePath("/opt/homebrew/bin");
  }
  env["PATH"] = pathEntries.join(path.delimiter);
  return env;
}

/** Ensure terminal feature flag is enabled. */
function ensureTerminalEnabled(): void {
  if (isTerminalEnabled()) return;
  throw new Error("Terminal feature is disabled.");
}

/** Schedule a periodic cleanup for idle sessions. */
function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      const idleMs = now - session.lastActiveAt;
      if (idleMs < SESSION_IDLE_TIMEOUT_MS) continue;
      // 中文注释：超时会话直接回收，避免 PTY 持续占用系统资源。
      try {
        session.pty.kill();
      } catch (error) {
        logger.warn({ err: error, sessionId }, "[terminal] pty kill failed");
      }
      sessions.delete(sessionId);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}

/** Create a new terminal session. */
export function createTerminalSession(input: {
  pwd: string;
  cols?: number;
  rows?: number;
}): { sessionId: string; token: string } {
  ensureTerminalEnabled();
  ensureSpawnHelperExecutable();
  const cwd = resolveTerminalCwd(input.pwd);
  const cols = input.cols ?? 80;
  const rows = input.rows ?? 24;
  const sessionId = randomUUID();
  const token = randomUUID();
  const candidates = resolveTerminalShellCandidates();
  let pty: IPty | null = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      // 中文注释：逐个尝试 shell，避免环境变量指向不存在的可执行文件。
      pty = spawn(candidate.file, candidate.args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: buildTerminalEnv(),
        // 中文注释：Windows 端使用 ConPTY，提高兼容性。
        useConpty: process.platform === "win32",
      });
      break;
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          err: error,
          shell: candidate.file,
          cwd,
          errno: (error as any)?.errno,
          code: (error as any)?.code,
        },
        "[terminal] spawn failed",
      );
    }
  }
  if (!pty) {
    const reason =
      lastError instanceof Error ? lastError.message : "unknown error";
    throw new Error(`Terminal spawn failed: ${reason}`);
  }
  const now = Date.now();
  sessions.set(sessionId, {
    id: sessionId,
    token,
    cwd,
    createdAt: now,
    lastActiveAt: now,
    pty,
  });
  ensureCleanupTimer();
  return { sessionId, token };
}

/** Get a terminal session by id. */
export function getTerminalSession(sessionId: string): TerminalSession | null {
  return sessions.get(sessionId) ?? null;
}

/** Update session activity timestamp. */
export function touchTerminalSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.lastActiveAt = Date.now();
}

/** Close and remove a terminal session. */
export function closeTerminalSession(input: {
  sessionId: string;
  token?: string;
}): boolean {
  const session = sessions.get(input.sessionId);
  if (!session) return false;
  if (input.token && session.token !== input.token) return false;
  try {
    session.pty.kill();
  } catch (error) {
    logger.warn({ err: error, sessionId: input.sessionId }, "[terminal] pty kill failed");
  }
  sessions.delete(input.sessionId);
  return true;
}
