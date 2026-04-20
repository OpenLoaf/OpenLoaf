/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * JsSandbox — run an ESM script inside a Node subprocess. Unified entry point
 * for Office/PDF file creation and editing (formerly handled by the now-removed
 * structured Mutate tools). The AI writes the transformation as code;
 * we pipe stdout/stderr back and observe cwd for new/modified files.
 */
import { tool, zodSchema } from 'ai'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsSandboxToolDef } from '@openloaf/api/types/tools/jsSandbox'
import { resolveCreateTargetPath } from '@/ai/tools/toolScope'
import { createToolProgress } from '@/ai/tools/toolProgress'
import { logger } from '@/common/logger'

/**
 * Locate the node_modules directory that houses the server's preinstalled
 * sandbox dependencies. pnpm may hoist to workspace root or keep them under
 * apps/server/node_modules — we resolve a known package (pdf-lib) and walk
 * up to its parent `node_modules` dir.
 */
let cachedNodeModulesDir: string | null = null
function serverNodeModulesDir(): string {
  if (cachedNodeModulesDir) return cachedNodeModulesDir
  try {
    const req = createRequire(import.meta.url)
    const pdfLibEntry = req.resolve('pdf-lib')
    let dir = path.dirname(pdfLibEntry)
    while (dir !== path.dirname(dir)) {
      if (path.basename(dir) === 'node_modules') {
        cachedNodeModulesDir = dir
        return dir
      }
      dir = path.dirname(dir)
    }
  } catch {
    /* ignore */
  }
  const here = fileURLToPath(new URL('.', import.meta.url))
  cachedNodeModulesDir = path.resolve(here, '..', '..', '..', '..', 'node_modules')
  return cachedNodeModulesDir
}

/**
 * Ensure `<scriptsDir>/node_modules` is a symlink to the server's node_modules,
 * so ESM `import 'pdf-lib'` in user code resolves by walking up from the
 * saved script. Cheap + idempotent per JsSandbox call.
 */
async function ensureNodeModulesLink(scriptsDir: string): Promise<void> {
  const target = serverNodeModulesDir()
  const link = path.join(scriptsDir, 'node_modules')
  try {
    const st = await fs.lstat(link)
    if (st.isSymbolicLink()) {
      const current = await fs.readlink(link)
      if (path.resolve(scriptsDir, current) === target) return
      await fs.unlink(link)
    } else {
      return
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return
  }
  try {
    await fs.symlink(target, link, 'dir')
  } catch (err) {
    logger.warn(
      { err, scriptsDir, target },
      '[jssandbox] failed to create node_modules symlink',
    )
  }
}

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_STDOUT = 8_000
const MAX_STDERR = 4_000
const MAX_SCRIPT_BYTES = 200_000 // refuse > 200 KB scripts

type JsSandboxInput = {
  action: 'run' | 'run-saved' | 'edit-and-run'
  code?: string
  scriptPath?: string
  edits?: { find: string; replace: string }[]
  timeoutMs?: number
  description?: string
}

type SandboxOutcome = {
  ok: boolean
  exitCode: number
  timedOut: boolean
  stdout: string
  stderr: string
  durationMs: number
}

/** Absolute path to the sandbox entry shim. Resolved once at module load. */
function sandboxEntryPath(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  return path.join(here, 'sandbox-runtime', 'sandbox-entry.mjs')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n…[truncated ${s.length - max} chars]`
}

async function collectWrittenFiles(
  rootDir: string,
  sinceMs: number,
  scriptsDir: string,
): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        // skip the scripts dir itself (we track scripts separately)
        if (full === scriptsDir) continue
        // skip huge node_modules / tool-results if any
        if (ent.name === 'node_modules' || ent.name === '.git') continue
        await walk(full)
      } else if (ent.isFile()) {
        try {
          const st = await fs.stat(full)
          if (st.mtimeMs >= sinceMs - 50) out.push(full)
        } catch {
          /* ignore */
        }
      }
    }
    return
  }
  await walk(rootDir)
  return out
}

function applyEdits(source: string, edits: { find: string; replace: string }[]): string {
  let out = source
  for (const { find, replace } of edits) {
    const idx = out.indexOf(find)
    if (idx === -1) {
      throw new Error(`edit-and-run: "find" string not found (${JSON.stringify(find.slice(0, 60))}...)`)
    }
    const idx2 = out.indexOf(find, idx + find.length)
    if (idx2 !== -1) {
      throw new Error(
        `edit-and-run: "find" string is not unique (${JSON.stringify(find.slice(0, 60))}...)`,
      )
    }
    out = out.slice(0, idx) + replace + out.slice(idx + find.length)
  }
  return out
}

async function resolveCwdRoot(): Promise<string> {
  // We want the writable root of the current session (or project root). The
  // simplest way is to ask resolveCreateTargetPath with a dummy filename and
  // extract rootPath — but that would also create nothing. Just pass a
  // placeholder so we only get back rootPath.
  const { rootPath } = await resolveCreateTargetPath('__jssandbox_probe__')
  return rootPath
}

async function runSubprocess(
  scriptPath: string,
  cwd: string,
  timeoutMs: number,
): Promise<SandboxOutcome> {
  const started = Date.now()
  return await new Promise<SandboxOutcome>(resolve => {
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=1024',
        '--no-warnings',
        sandboxEntryPath(),
        scriptPath,
        cwd,
      ],
      {
        cwd,
        env: {
          // Minimal env: keep NODE_PATH so user code can resolve server deps,
          // expose session dir, clear everything else sensitive.
          NODE_ENV: process.env.NODE_ENV ?? 'production',
          NODE_PATH: process.env.NODE_PATH ?? '',
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? cwd,
          OPENLOAF_ASSET_DIR: cwd,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
      if (stdout.length > MAX_STDOUT * 4) stdout = stdout.slice(-MAX_STDOUT * 4)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
      if (stderr.length > MAX_STDERR * 4) stderr = stderr.slice(-MAX_STDERR * 4)
    })

    child.on('error', err => {
      clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: -1,
        timedOut: false,
        stdout: truncate(stdout, MAX_STDOUT),
        stderr: truncate(`spawn error: ${err.message}\n${stderr}`, MAX_STDERR),
        durationMs: Date.now() - started,
      })
    })

    child.on('close', code => {
      clearTimeout(timer)
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code ?? -1,
        timedOut,
        stdout: truncate(stdout, MAX_STDOUT),
        stderr: truncate(stderr, MAX_STDERR),
        durationMs: Date.now() - started,
      })
    })
  })
}

export const jsSandboxTool = tool({
  description: jsSandboxToolDef.description,
  inputSchema: zodSchema(jsSandboxToolDef.parameters),
  execute: async (input: JsSandboxInput, { toolCallId }): Promise<string> => {
    const progress = createToolProgress(toolCallId, 'JsSandbox')
    const action = input.action ?? 'run'
    const timeoutMs = Math.min(
      Math.max(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000),
      120_000,
    )

    let rootPath: string
    try {
      rootPath = await resolveCwdRoot()
    } catch (err) {
      return JSON.stringify({
        ok: false,
        error: `Failed to resolve sandbox cwd: ${(err as Error).message}`,
      })
    }

    const scriptsDir = path.join(rootPath, 'scripts')
    await fs.mkdir(scriptsDir, { recursive: true })
    await ensureNodeModulesLink(scriptsDir)

    // Resolve / synthesize script contents per action.
    let scriptPath = ''
    let scriptBody = ''

    try {
      if (action === 'run') {
        if (!input.code || !input.code.trim()) {
          return JSON.stringify({ ok: false, error: 'action=run requires non-empty `code`' })
        }
        if (Buffer.byteLength(input.code, 'utf-8') > MAX_SCRIPT_BYTES) {
          return JSON.stringify({
            ok: false,
            error: `Script too large (> ${MAX_SCRIPT_BYTES} bytes). Split or use edit-and-run.`,
          })
        }
        const ts = Date.now()
        const slug = (input.description ?? 'anon')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 40)
          .replace(/^-+|-+$/g, '') || 'anon'
        scriptPath = path.join(scriptsDir, `run-${ts}-${slug}.mjs`)
        const header =
          `// auto-saved by JsSandbox · ${new Date().toISOString()}` +
          (input.description ? `\n// description: ${input.description}` : '') +
          '\n\n'
        scriptBody = header + input.code
        await fs.writeFile(scriptPath, scriptBody, 'utf-8')
      } else if (action === 'run-saved') {
        if (!input.scriptPath) {
          return JSON.stringify({ ok: false, error: 'action=run-saved requires `scriptPath`' })
        }
        scriptPath = path.resolve(input.scriptPath)
        if (!scriptPath.startsWith(scriptsDir)) {
          return JSON.stringify({
            ok: false,
            error: `scriptPath must be under ${scriptsDir}`,
          })
        }
        scriptBody = await fs.readFile(scriptPath, 'utf-8')
      } else {
        // edit-and-run
        if (!input.scriptPath || !input.edits || input.edits.length === 0) {
          return JSON.stringify({
            ok: false,
            error: 'action=edit-and-run requires `scriptPath` and non-empty `edits`',
          })
        }
        const srcPath = path.resolve(input.scriptPath)
        if (!srcPath.startsWith(scriptsDir)) {
          return JSON.stringify({
            ok: false,
            error: `scriptPath must be under ${scriptsDir}`,
          })
        }
        const original = await fs.readFile(srcPath, 'utf-8')
        const edited = applyEdits(original, input.edits)
        if (Buffer.byteLength(edited, 'utf-8') > MAX_SCRIPT_BYTES) {
          return JSON.stringify({
            ok: false,
            error: `After edits, script exceeds ${MAX_SCRIPT_BYTES} bytes.`,
          })
        }
        const ts = Date.now()
        scriptPath = path.join(scriptsDir, `edit-${ts}-${path.basename(srcPath)}`)
        scriptBody = edited
        await fs.writeFile(scriptPath, scriptBody, 'utf-8')
      }
    } catch (err) {
      return JSON.stringify({
        ok: false,
        error: `Script prepare failed: ${(err as Error).message}`,
      })
    }

    progress.start(`Running ${path.basename(scriptPath)} (timeout ${Math.round(timeoutMs / 1000)}s)`)

    const started = Date.now()
    const outcome = await runSubprocess(scriptPath, rootPath, timeoutMs)
    const writtenFiles = outcome.ok
      ? await collectWrittenFiles(rootPath, started, scriptsDir)
      : []

    logger.info(
      {
        tool: 'JsSandbox',
        action,
        scriptPath,
        exitCode: outcome.exitCode,
        timedOut: outcome.timedOut,
        durationMs: outcome.durationMs,
        writtenCount: writtenFiles.length,
      },
      '[jssandbox] run complete',
    )

    if (outcome.timedOut) {
      progress.done(`Timed out after ${timeoutMs}ms`)
    } else if (outcome.ok) {
      progress.done(`Done in ${outcome.durationMs}ms (${writtenFiles.length} file(s) touched)`)
    } else {
      progress.done(`Exit ${outcome.exitCode} in ${outcome.durationMs}ms`)
    }

    const result = {
      ok: outcome.ok,
      action,
      scriptPath,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      durationMs: outcome.durationMs,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      writtenFiles,
      hint: outcome.ok
        ? '想改几行再跑？用 action:"edit-and-run" + scriptPath + edits[] — 别整段重传。'
        : '修 bug 时优先用 action:"edit-and-run" 对上面的 scriptPath 做最小改动。',
    }
    return JSON.stringify(result)
  },
})
