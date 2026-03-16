#!/usr/bin/env node

/**
 * Desktop dev wrapper — kills stale desktop-session processes before launching Electron.
 *
 * Problem: Previous desktop dev sessions can leave orphaned server/web/electron
 * processes that hold ports (23333, 3001) or consume resources.
 *
 * Solution: Kill only desktop-session-specific stale processes (server on dev port,
 * Next.js dev, electron-forge), then spawn with proper process group cleanup.
 * Intentional processes like behavior tests are NOT touched.
 */

import { spawn } from 'node:child_process'
import { killStaleProcesses } from './kill.mjs'

// ── 1. Kill stale desktop-session processes ──────────────────────────
killStaleProcesses({ log: (msg) => console.log(msg.replace('[kill]', '[desktop]')) })

// ── 2. Spawn the desktop command in its own process group ────────────
const child = spawn('pnpm', ['--filter', 'desktop', 'desktop'], {
  stdio: 'inherit',
  detached: true,
  env: {
    ...process.env,
    NODE_OPTIONS: '--conditions=development',
  },
})

// ── 3. Cleanup: kill entire process group on ANY exit ────────────────
let exiting = false

function cleanup(signal) {
  if (exiting) return
  exiting = true

  try {
    process.kill(-child.pid, signal || 'SIGTERM')
  } catch {}

  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    process.exit(signal === 'SIGINT' ? 0 : 1)
  }, 5000) // Electron needs a bit more time to gracefully shut down
}

process.on('SIGTERM', () => cleanup('SIGTERM'))
process.on('SIGINT', () => cleanup('SIGINT'))
process.on('SIGHUP', () => cleanup('SIGHUP'))
process.on('exit', () => {
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
})

child.on('exit', (code, signal) => {
  exiting = true
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  process.exit(code ?? (signal === 'SIGINT' ? 0 : 1))
})
