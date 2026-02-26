/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'

/** Default execution timeout in milliseconds. */
const EXEC_TIMEOUT_MS = 10_000

/** Parse a .env file into a key-value record. */
async function loadDotEnv(envPath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(envPath, 'utf-8')
    const env: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex < 0) continue
      const key = trimmed.slice(0, eqIndex).trim()
      let value = trimmed.slice(eqIndex + 1).trim()
      // Strip surrounding quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key) env[key] = value
    }
    return env
  } catch {
    return {}
  }
}

export interface ExecuteFunctionResult {
  ok: boolean
  data?: unknown
  error?: string
}

/**
 * Execute a widget function by spawning the corresponding script command.
 *
 * Reads the widget's package.json to find the script, loads .env into the
 * child process environment, captures stdout as JSON, and enforces a timeout.
 */
export async function executeWidgetFunction(
  widgetDir: string,
  functionName: string,
  params?: Record<string, unknown>,
): Promise<ExecuteFunctionResult> {
  const pkgPath = path.join(widgetDir, 'package.json')
  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
  } catch {
    return { ok: false, error: 'Failed to read widget package.json' }
  }

  const command = pkg.scripts?.[functionName]
  if (!command) {
    return { ok: false, error: `Function "${functionName}" not found in scripts` }
  }

  // Load .env from widget directory.
  const dotEnv = await loadDotEnv(path.join(widgetDir, '.env'))

  // Pass params as environment variables prefixed with WIDGET_PARAM_.
  const paramEnv: Record<string, string> = {}
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      paramEnv[`WIDGET_PARAM_${key.toUpperCase()}`] = String(value)
    }
  }

  return new Promise<ExecuteFunctionResult>((resolve) => {
    const child = spawn(command, {
      cwd: widgetDir,
      shell: true,
      env: { ...process.env, ...dotEnv, ...paramEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: EXEC_TIMEOUT_MS,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, EXEC_TIMEOUT_MS)

    child.on('close', (code) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim()
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()

      if (code !== 0) {
        logger.warn(
          { widgetDir, functionName, code, stderr },
          'Widget function exited with non-zero code',
        )
        return resolve({
          ok: false,
          error: stderr || `Process exited with code ${code}`,
        })
      }

      try {
        const data = JSON.parse(stdout)
        resolve({ ok: true, data })
      } catch {
        // If stdout is not valid JSON, return it as a string.
        resolve({ ok: true, data: stdout || null })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      logger.error({ err, widgetDir, functionName }, 'Widget function spawn error')
      resolve({ ok: false, error: err.message })
    })
  })
}
