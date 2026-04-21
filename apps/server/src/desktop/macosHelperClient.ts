/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Singleton client for the macOS control helper (Swift binary spawned by the
 * server). Line-delimited JSON over stdio; one in-flight request at a time per
 * helper process. The helper is cheap to restart — we re-spawn on crash.
 *
 * Public API:
 *   - getMacosHelper(): MacosHelper | null      (null when runtime is not desktop)
 *   - helper.request(op, payload): Promise<any>
 *   - helper.abort(): void                      (rejects the pending request)
 *
 * Permission handling: the helper itself preflights screen/accessibility TCC
 * and returns { ok:false, permissionsMissing:[...] } in the response. Callers
 * surface that list to the user/UI — we do not throw.
 */
import { ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import {
  getMacosHelperPath,
  isDesktopRuntime,
} from '@/runtime/desktopRuntime'

export type HelperResponse = {
  id: string
  ok: boolean
  error?: string
  permissionsMissing?: string[]
  [key: string]: unknown
}

type Pending = {
  resolve: (r: HelperResponse) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout | null
}

const REQUEST_TIMEOUT_MS = 15_000

class MacosHelper {
  private child: ChildProcess | null = null
  private buffer = ''
  private pending = new Map<string, Pending>()
  private seq = 0
  private aborted = false

  constructor(private readonly binaryPath: string) {}

  private ensureChild(): ChildProcess {
    if (this.child && !this.child.killed) return this.child

    const child = spawn(this.binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => this.onStdout(chunk))
    child.stderr?.on('data', (chunk: string) => {
      process.stderr.write(`[macos-control] ${chunk}`)
    })
    child.on('exit', (code, signal) => {
      for (const p of this.pending.values()) {
        if (p.timer) clearTimeout(p.timer)
        p.reject(new Error(`macos-control helper exited code=${code} signal=${signal}`))
      }
      this.pending.clear()
      this.child = null
    })
    this.child = child
    return child
  }

  private onStdout(chunk: string) {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line) as HelperResponse
        const p = this.pending.get(msg.id)
        if (!p) continue
        if (p.timer) clearTimeout(p.timer)
        this.pending.delete(msg.id)
        p.resolve(msg)
      } catch (err) {
        process.stderr.write(`[macos-control] bad JSON line: ${line}\n`)
      }
    }
  }

  async request(op: string, payload: Record<string, unknown> = {}): Promise<HelperResponse> {
    if (this.aborted) {
      this.aborted = false
      throw new Error('macos-control aborted by user')
    }
    const child = this.ensureChild()
    const id = `r${++this.seq}`
    const body = JSON.stringify({ id, op, ...payload }) + '\n'

    return new Promise<HelperResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`macos-control timeout after ${REQUEST_TIMEOUT_MS}ms (op=${op})`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      if (!child.stdin || !child.stdin.writable) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error('macos-control stdin not writable'))
        return
      }
      child.stdin.write(body, (err) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  abort(): void {
    this.aborted = true
    for (const p of this.pending.values()) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(new Error('macos-control aborted by user'))
    }
    this.pending.clear()
  }
}

let singleton: MacosHelper | null = null

/** Returns the helper singleton, or null when this server isn't running under the desktop app. */
export function getMacosHelper(): MacosHelper | null {
  if (!isDesktopRuntime()) return null
  if (singleton) return singleton
  const bin = getMacosHelperPath()
  if (!bin) return null
  singleton = new MacosHelper(path.resolve(bin))
  return singleton
}
