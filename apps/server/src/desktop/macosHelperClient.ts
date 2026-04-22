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
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  getMacosHelperPath,
  isDesktopRuntime,
} from '@/runtime/desktopRuntime'
import {
  getMockResponse,
  hasMockScenario,
  macosHelperMockEnabled,
} from '@/desktop/macosHelperMockStore'

export type HelperResponse = {
  id: string
  ok: boolean
  error?: string
  permissionsMissing?: string[]
  [key: string]: unknown
}

export interface MacosHelperInterface {
  request(
    op: string,
    payload?: Record<string, unknown>,
    ctx?: { sessionId?: string },
  ): Promise<HelperResponse>
  abort(): void
}

type Pending = {
  resolve: (r: HelperResponse) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout | null
}

const REQUEST_TIMEOUT_MS = 15_000

/**
 * Hybrid helper — per-request, checks whether the caller's session has a
 * registered mock scenario. If yes, returns canned fixture responses; if no,
 * delegates to the real Swift helper (ProcessMacosHelper).
 *
 * This lets a single server serve regular dev chat (real helper when desktop
 * runtime, null otherwise) AND browser-test sessions that explicitly opted
 * into mocking via POST /debug/macos-helper-mock — no process-wide switch,
 * no restart required.
 */
class HybridMacosHelper implements MacosHelperInterface {
  constructor(private readonly real: MacosHelperInterface | null) {}

  async request(
    op: string,
    payload: Record<string, unknown> = {},
    ctx: { sessionId?: string } = {},
  ): Promise<HelperResponse> {
    if (hasMockScenario(ctx.sessionId)) {
      return this.servemock(op, payload, ctx)
    }
    if (!this.real) {
      // No mock registered and no real helper available (e.g. non-desktop dev).
      return {
        id: 'mock',
        ok: false,
        error:
          'macos-control: no helper available. Start with desktop runtime, or register a mock scenario via POST /debug/macos-helper-mock.',
      }
    }
    return this.real.request(op, payload, ctx)
  }

  abort(): void {
    this.real?.abort()
  }

  /**
   * Observe requests demand an actual PNG at screenshotPath; materialize a
   * 1×1 placeholder so the attachment tag expander downstream has a real
   * file to reference.
   */
  private async servemock(
    op: string,
    payload: Record<string, unknown>,
    ctx: { sessionId?: string },
  ): Promise<HelperResponse> {
    const resp = getMockResponse(ctx.sessionId, op) ?? {
      ok: false,
      error: `macos-control mock: no scenario for op=${op}`,
    }
    if (op === 'observe' && resp.ok && resp.screenshotPath === '__AUTO__') {
      const target = String(payload.screenshotPath ?? '')
      if (target) {
        try {
          // 16×16 white PNG; must be ≥10×10 or Qwen-VL rejects with
          // "height:1 or width:1 must be larger than 10".
          const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR42mP4TyJgGNUwqmH4agAAr639H23ooMoAAAAASUVORK5CYII=',
            'base64',
          )
          await fs.writeFile(target, png)
        } catch {
          // best effort — test will surface as assertion failure if missing
        }
        return { id: 'mock', ok: true, ...resp, screenshotPath: target } as HelperResponse
      }
    }
    const ok = Boolean((resp as { ok?: unknown }).ok)
    return { id: 'mock', ok, ...resp } as HelperResponse
  }
}

class MacosHelper implements MacosHelperInterface {
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

  async request(
    op: string,
    payload: Record<string, unknown> = {},
    _ctx: { sessionId?: string } = {},
  ): Promise<HelperResponse> {
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

let realSingleton: MacosHelper | null = null
let hybridSingleton: HybridMacosHelper | null = null

function getRealHelper(): MacosHelper | null {
  if (!isDesktopRuntime()) return null
  if (realSingleton) return realSingleton
  const bin = getMacosHelperPath()
  if (!bin) return null
  realSingleton = new MacosHelper(path.resolve(bin))
  return realSingleton
}

/**
 * Returns the helper. Null only when neither the real helper (desktop runtime)
 * nor the mock (dev/test) is available — i.e. in production non-desktop.
 *
 * The returned helper is a thin wrapper: per request it checks whether the
 * caller's session has a registered mock scenario, and routes accordingly.
 * Callers should pass the sessionId via the `ctx` argument to `request()`.
 */
export function getMacosHelper(): MacosHelperInterface | null {
  const real = getRealHelper()
  if (!real && !macosHelperMockEnabled()) return null
  if (!hybridSingleton) hybridSingleton = new HybridMacosHelper(real)
  return hybridSingleton
}
