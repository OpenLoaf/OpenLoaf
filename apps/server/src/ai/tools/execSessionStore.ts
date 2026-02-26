/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { IPty } from "node-pty";
import { truncateText } from "@/ai/tools/execUtils";

type ExecSession = {
  /** Session id. */
  id: string;
  /** Child process instance. */
  process: ChildProcessWithoutNullStreams | IPty;
  /** Whether process is a PTY. */
  isPty: boolean;
  /** Combined output buffer. */
  buffer: string;
  /** Read offset in buffer. */
  readOffset: number;
  /** Exit code when process ends. */
  exitCode: number | null;
  /** Exit signal when process ends. */
  signal: NodeJS.Signals | null;
  /** Session start timestamp. */
  startedAt: number;
  /** End timestamp if finished. */
  endedAt?: number;
};

type ExecReadResult = {
  output: string;
  truncated: boolean;
  chunkId: string;
  wallTimeMs: number;
};

const sessions = new Map<string, ExecSession>();
const MAX_BUFFER_SIZE = 1024 * 1024;
const SESSION_TTL_MS = 5 * 60 * 1000;

function isPtyProcess(process: ChildProcessWithoutNullStreams | IPty): process is IPty {
  return typeof (process as IPty).onData === "function";
}

/** Create a new exec session and start capturing output. */
export function createExecSession(process: ChildProcessWithoutNullStreams | IPty): ExecSession {
  const id = randomUUID();
  const isPty = isPtyProcess(process);
  const session: ExecSession = {
    id,
    process,
    isPty,
    buffer: "",
    readOffset: 0,
    exitCode: null,
    signal: null,
    startedAt: Date.now(),
  };
  sessions.set(id, session);

  const append = (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    session.buffer += text;
    if (session.buffer.length > MAX_BUFFER_SIZE) {
      const overflow = session.buffer.length - MAX_BUFFER_SIZE;
      // 缓冲区超限时截断旧内容并同步 readOffset。
      session.buffer = session.buffer.slice(overflow);
      session.readOffset = Math.max(0, session.readOffset - overflow);
    }
  };

  if (isPtyProcess(process)) {
    process.onData((data) => {
      append(data);
    });
    process.onExit((event) => {
      session.exitCode = event.exitCode ?? null;
      session.signal = null;
      session.endedAt = Date.now();
      const cleanupTimer = setTimeout(() => {
        sessions.delete(id);
      }, SESSION_TTL_MS);
      cleanupTimer.unref?.();
    });
  } else {
    process.stdout.setEncoding("utf-8");
    process.stderr.setEncoding("utf-8");
    process.stdout.on("data", append);
    process.stderr.on("data", append);

    process.once("exit", (code, signal) => {
      session.exitCode = code;
      session.signal = signal;
      session.endedAt = Date.now();
      const cleanupTimer = setTimeout(() => {
        sessions.delete(id);
      }, SESSION_TTL_MS);
      cleanupTimer.unref?.();
    });

    process.once("error", (error) => {
      append(`[process-error] ${String(error)}\n`);
    });
  }

  return session;
}

/** Get an exec session by id. */
function getExecSession(sessionId: string): ExecSession | null {
  return sessions.get(sessionId) ?? null;
}

/** Read output from the exec session buffer. */
export function readExecOutput(input: {
  sessionId: string;
  maxChars?: number;
}): ExecReadResult {
  const session = getExecSession(input.sessionId);
  if (!session) throw new Error("Exec session not found.");
  const now = Date.now();
  const chunkId = randomUUID();
  const wallTimeMs = (session.endedAt ?? now) - session.startedAt;
  const pending = session.buffer.slice(session.readOffset);
  if (!input.maxChars || pending.length <= input.maxChars) {
    session.readOffset = session.buffer.length;
    return { output: pending, truncated: false, chunkId, wallTimeMs };
  }
  const truncated = truncateText(pending, { kind: "chars", limit: input.maxChars });
  // 中文注释：截断后仍然视为“已消费”，避免后续返回重复内容。
  session.readOffset = session.buffer.length;
  return { output: truncated.text, truncated: true, chunkId, wallTimeMs };
}

/** Write input to the exec session stdin. */
export function writeExecStdin(input: { sessionId: string; chars?: string }): void {
  const session = getExecSession(input.sessionId);
  if (!session) throw new Error("Exec session not found.");
  if (isPtyProcess(session.process)) {
    if (input.chars) session.process.write(input.chars);
    return;
  }
  if (input.chars && session.process.stdin.writable) {
    session.process.stdin.write(input.chars);
  }
}

/** Resolve exec session status for responses. */
export function getExecSessionStatus(sessionId: string): {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  endedAt?: number;
} {
  const session = getExecSession(sessionId);
  if (!session) throw new Error("Exec session not found.");
  return { exitCode: session.exitCode, signal: session.signal, endedAt: session.endedAt };
}
