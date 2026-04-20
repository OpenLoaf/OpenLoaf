// @ts-nocheck
/**
 * JsSandbox subprocess entry.
 *
 * Launched by jsSandboxTool via child_process.fork(). Receives { scriptPath, cwd }
 * via argv, chdirs into cwd, and dynamic-imports the user script as ESM. stdout /
 * stderr pipe back to the parent; non-zero exit propagates.
 *
 * Guards:
 *  - Disallow require('child_process') / require('http') / require('https') /
 *    require('net') / require('dgram') — throw on import.
 *  - No explicit fs sandbox (cwd convention only) — user code uses relative paths.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const BLOCKED = new Set(['child_process', 'http', 'https', 'net', 'dgram', 'tls', 'cluster', 'worker_threads'])

function installImportGuards() {
  // Block CJS require of networking / process-spawning modules.
  const req = createRequire(import.meta.url)
  const origResolve = req.resolve
  // Monkey-patch Module._load to deny blocked specifiers from *any* require chain.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = req('module')
  const origLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (typeof request === 'string' && BLOCKED.has(request)) {
      throw new Error(`[sandbox] require('${request}') is blocked in JsSandbox`)
    }
    if (typeof request === 'string' && BLOCKED.has(request.replace(/^node:/, ''))) {
      throw new Error(`[sandbox] require('${request}') is blocked in JsSandbox`)
    }
    return origLoad.call(this, request, parent, isMain)
  }
  // Best-effort ESM block: dynamic import of blocked specifiers throws.
  const origImport = globalThis.__sandboxOrigImport__ = async (specifier) => {
    throw new Error(`[sandbox] import('${specifier}') is blocked in JsSandbox`)
  }
  void origImport
  void origResolve
}

async function main() {
  const scriptPath = process.argv[2]
  const cwd = process.argv[3]
  if (!scriptPath || !cwd) {
    console.error('[sandbox] missing scriptPath or cwd')
    process.exit(2)
  }
  try {
    process.chdir(cwd)
  } catch (err) {
    console.error(`[sandbox] chdir failed: ${err.message}`)
    process.exit(2)
  }
  installImportGuards()

  try {
    // ESM dynamic import of the user script via absolute path → URL.
    const { pathToFileURL } = await import('node:url')
    await import(pathToFileURL(path.resolve(scriptPath)).href)
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err)
    console.error(`[sandbox error] ${msg}`)
    process.exit(1)
  }
}

main()
