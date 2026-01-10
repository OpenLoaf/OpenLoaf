import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, type IPty } from "node-pty";
import { logger } from "@/common/logger";

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
  return process.env.TEATIME_ENABLE_TERMINAL === "1";
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
function resolveTerminalShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    const file = process.env.TEATIME_TERMINAL_SHELL || "powershell.exe";
    return { file, args: ["-NoLogo"] };
  }
  const file = process.env.SHELL || "/bin/bash";
  return { file, args: [] };
}

/** Build environment variables for the terminal process. */
function buildTerminalEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // 中文注释：确保终端能力默认是 xterm-256color，便于颜色渲染。
    TERM: process.env.TERM || "xterm-256color",
  };
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
  const cwd = resolveTerminalCwd(input.pwd);
  const { file, args } = resolveTerminalShell();
  const cols = input.cols ?? 80;
  const rows = input.rows ?? 24;
  const sessionId = randomUUID();
  const token = randomUUID();
  const pty = spawn(file, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: buildTerminalEnv(),
    // 中文注释：Windows 端使用 ConPTY，提高兼容性。
    useConpty: process.platform === "win32",
  });
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
