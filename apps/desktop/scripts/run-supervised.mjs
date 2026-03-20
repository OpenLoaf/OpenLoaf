#!/usr/bin/env node
/**
 * Lightweight process supervisor with parent-death detection.
 *
 * When spawned with stdin as a pipe, this script monitors stdin for EOF.
 * If the parent process dies (crash, force-quit, etc.), the OS closes the pipe
 * and this script detects the EOF, then kills the entire child process tree.
 *
 * Usage:  node run-supervised.mjs <command> [args...]
 * Parent: spawn with stdio ['pipe', 'pipe', 'pipe'] or ['pipe', 'pipe', 'pipe', 'ipc']
 *
 * The child process is spawned with detached: true so we can kill the entire
 * process group via kill(-pid) on exit.
 */
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
if (args.length === 0) {
  process.stderr.write('Usage: run-supervised.mjs <command> [args...]\n')
  process.exit(1)
}

const [command, ...commandArgs] = args

// On Windows, .cmd/.bat files need shell mode.
const isWin = process.platform === 'win32'
const useCmdShim = isWin && /\.(cmd|bat)$/i.test(command)

const child = spawn(command, commandArgs, {
  // Child ignores stdin; stdout/stderr inherit from us (piped to Electron).
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: useCmdShim,
  // Own process group so kill(-pid) reaches all descendants.
  detached: true,
})

// Forward child exit to our own exit.
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 1)
  }
})

child.on('error', (err) => {
  process.stderr.write(`[supervised] spawn error: ${err.message}\n`)
  process.exit(1)
})

// --- Parent death detection via stdin pipe ---
// When the parent dies, the OS closes the pipe's write end.
// We detect EOF and kill the child process tree.
if (!process.stdin.isTTY) {
  process.stdin.resume()
  process.stdin.on('end', () => {
    cleanup('stdin EOF (parent died)')
  })
  process.stdin.on('error', () => {
    cleanup('stdin error (parent died)')
  })
}

// --- IPC disconnect detection (if IPC channel exists) ---
if (process.connected !== undefined) {
  process.on('disconnect', () => {
    cleanup('IPC disconnect (parent died)')
  })
}

// --- Signal forwarding ---
// When parent sends SIGTERM (graceful shutdown via stopManaged), clean up child tree.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => cleanup(`received ${sig}`))
}

let cleaning = false
function cleanup(reason) {
  if (cleaning) return
  cleaning = true
  process.stderr.write(`[supervised] ${reason}, killing child tree (pid ${child.pid})\n`)
  if (child.pid) {
    try {
      // Kill the entire process group (child + all its descendants).
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Process group may not exist; try direct kill.
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
    }
  }
  // Grace period, then force exit.
  setTimeout(() => {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }
    process.exit(0)
  }, 3000)
}
