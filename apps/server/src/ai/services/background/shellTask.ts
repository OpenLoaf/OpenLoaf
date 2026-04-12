/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import treeKill from 'tree-kill'
import type { BgTaskMetaFile } from './types'

/** Accepts friendly IDs like `openloaf-sh-a1b2c3` and legacy UUIDs. */
const TASK_ID_REGEX = /^(?:openloaf-[a-z]{2,4}-[a-f0-9]{6}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/

// Session id comes from the session service and may contain alphanumerics,
// underscores and hyphens. Strict allowlist prevents directory traversal or
// shell metacharacters being planted via sessionId.
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]+$/

/**
 * Return the shell executable for the current platform.
 * Windows defaults to `powershell.exe`; Unix uses `/bin/sh`.
 * Extracted so that a future PowerShell-version-detection helper (P2) can
 * override it without touching spawn logic.
 */
export function getShellExecutable(): string {
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'
}

/** Root directory for background task output files. */
export function getBgTasksRoot(): string {
  const base = process.env.OPENLOAF_HOME ?? path.join(os.homedir(), '.openloaf')
  return path.join(base, 'bg-tasks')
}

/** Per-session sub-directory. Guaranteed to be inside getBgTasksRoot(). */
export function getSessionBgDir(sessionId: string): string {
  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error(`Invalid sessionId format: ${sessionId}`)
  }
  return path.join(getBgTasksRoot(), sessionId)
}

function assertPathInside(parent: string, child: string) {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  if (
    resolvedChild !== resolvedParent &&
    !resolvedChild.startsWith(resolvedParent + path.sep)
  ) {
    throw new Error(`Path traversal blocked: ${child}`)
  }
}

export type ShellSpawnResult = {
  pid: number
  outputPath: string
  metaPath: string
  child: ChildProcess
  kill: () => Promise<void>
}

export type ShellFinalizeResult = {
  exitCode: number
  interrupted: boolean
  status: 'completed' | 'failed' | 'killed'
}

/**
 * Spawn a shell child with stdout/stderr piped to a disk file (not memory).
 * Ensures:
 * - taskId is a server-generated UUID
 * - output path stays inside the session directory (traversal blocked)
 * - directory is 0o700 and output/meta files are 0o600
 * - metadata JSON is written before returning so reap can see it even if the
 *   server crashes a millisecond later
 * - finalize runs exactly once (kill/exit/error compete but only one wins)
 */
export async function spawnShellProcess(opts: {
  taskId: string
  sessionId: string
  command: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  ownerAgentId?: string
  onFinalize: (result: ShellFinalizeResult) => void | Promise<void>
}): Promise<ShellSpawnResult> {
  if (!TASK_ID_REGEX.test(opts.taskId)) {
    throw new Error(`Invalid taskId format: ${opts.taskId}`)
  }

  const sessionDir = getSessionBgDir(opts.sessionId)
  const outputPath = path.join(sessionDir, `${opts.taskId}.out`)
  const metaPath = path.join(sessionDir, `${opts.taskId}.meta.json`)
  assertPathInside(sessionDir, outputPath)
  assertPathInside(sessionDir, metaPath)

  await fs.mkdir(sessionDir, { recursive: true, mode: 0o700 })

  // Truncate any stale file then open with 0o600. Using open() directly so
  // the returned fd can be handed to spawn() as stdout/stderr.
  const fd = await fs.open(outputPath, 'w', 0o600)

  let child: ChildProcess
  try {
    const shellFile = getShellExecutable()
    const isWin = process.platform === 'win32'
    const shellArgs = isWin
      ? ['-NoLogo', '-NonInteractive', '-Command', opts.command]
      : ['-lc', opts.command]

    child = spawn(shellFile, shellArgs, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', fd.fd, fd.fd],
      detached: false,
    })
  } catch (err) {
    await fd.close().catch(() => {})
    throw err
  }

  if (!child.pid) {
    await fd.close().catch(() => {})
    throw new Error('spawn failed: no pid')
  }

  const pid = child.pid
  const meta: BgTaskMetaFile = {
    id: opts.taskId,
    kind: 'shell',
    sessionId: opts.sessionId,
    pid,
    startedAt: Date.now(),
    ownerAgentId: opts.ownerAgentId,
    serverPid: process.pid,
  }
  await fs.writeFile(metaPath, JSON.stringify(meta), { mode: 0o600 })

  // Single finalizer: kill / exit / error all funnel here, but only the first
  // wins via the `terminated` flag.
  let terminated = false
  const finalize = async (
    exitCode: number,
    interrupted: boolean,
    status: 'completed' | 'failed' | 'killed',
  ): Promise<void> => {
    if (terminated) return
    terminated = true
    try {
      await fd.close()
    } catch {
      /* ignore */
    }
    try {
      await fs.unlink(metaPath)
    } catch {
      /* ignore */
    }
    try {
      await opts.onFinalize({ exitCode, interrupted, status })
    } catch (err) {
      console.warn('[shellTask] onFinalize threw:', err)
    }
  }

  child.once('exit', (code, signal) => {
    const interrupted = signal === 'SIGKILL' || signal === 'SIGTERM'
    const status: ShellFinalizeResult['status'] = interrupted
      ? 'killed'
      : (code ?? 0) === 0
        ? 'completed'
        : 'failed'
    void finalize(code ?? -1, interrupted, status)
  })
  child.once('error', () => {
    void finalize(-1, false, 'failed')
  })

  return {
    pid,
    outputPath,
    metaPath,
    child,
    kill: () =>
      new Promise<void>((resolve) => {
        // tree-kill walks the process tree and sends SIGKILL. The exit
        // handler above will then run finalize.
        treeKill(pid, 'SIGKILL', () => resolve())
      }),
  }
}

/**
 * Scan ~/.openloaf/bg-tasks/<session>/*.meta.json at server startup and
 * terminate any shell processes whose parent server (identified by serverPid
 * in the meta file) already died. This prevents accumulating zombies across
 * restarts.
 *
 * NOTE: this is fire-and-forget — called from BackgroundProcessManager
 * constructor. Errors are logged, not thrown.
 */
export async function reapOrphanedShellTasks(): Promise<void> {
  const root = getBgTasksRoot()
  let sessions: string[]
  try {
    sessions = await fs.readdir(root)
  } catch (err: any) {
    if (err?.code === 'ENOENT') return
    throw err
  }

  for (const sessionId of sessions) {
    const sessionDir = path.join(root, sessionId)
    let entries: string[]
    try {
      entries = await fs.readdir(sessionDir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.meta.json')) continue
      const metaPath = path.join(sessionDir, entry)
      try {
        const raw = await fs.readFile(metaPath, 'utf-8')
        const meta = JSON.parse(raw) as BgTaskMetaFile
        if (meta.kind !== 'shell' || typeof meta.pid !== 'number') {
          await fs.unlink(metaPath).catch(() => {})
          continue
        }
        // process.kill(pid, 0) is a liveness probe (no signal sent).
        try {
          process.kill(meta.pid, 0)
          // Still alive AND its parent server is gone → orphan. Kill tree.
          if (meta.serverPid !== process.pid) {
            treeKill(meta.pid, 'SIGKILL')
          }
        } catch {
          /* pid already dead — just clean meta */
        }
        await fs.unlink(metaPath).catch(() => {})
      } catch {
        // Corrupt meta — best-effort cleanup.
        await fs.unlink(metaPath).catch(() => {})
      }
    }
  }
}
