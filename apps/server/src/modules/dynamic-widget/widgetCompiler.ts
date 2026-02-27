/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import { logger } from '@/common/logger'

export interface CompileResult {
  ok: boolean
  code?: string
  error?: string
}

/**
 * Compile a widget's React component (.tsx) into a self-contained ESM bundle.
 *
 * Uses esbuild to bundle the widget entry file. React is marked as external
 * since the host application provides it at runtime.
 */
export async function compileWidget(widgetDir: string): Promise<CompileResult> {
  const pkgPath = path.join(widgetDir, 'package.json')
  let pkg: { main?: string }
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
  } catch {
    return { ok: false, error: 'Failed to read widget package.json' }
  }

  const entryFile = pkg.main || 'widget.tsx'
  const entryPath = path.join(widgetDir, entryFile)

  try {
    await fs.access(entryPath)
  } catch {
    return { ok: false, error: `Entry file "${entryFile}" not found` }
  }

  try {
    const result = await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2022',
      jsx: 'automatic',
      minify: false,
      // React and the widget SDK are provided by the host at runtime.
      external: ['react', 'react-dom', 'react/jsx-runtime', '@openloaf/widget-sdk'],
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    })

    const output = result.outputFiles?.[0]
    if (!output) {
      return { ok: false, error: 'esbuild produced no output' }
    }

    return { ok: true, code: output.text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err, widgetDir }, 'Widget compilation failed')
    return { ok: false, error: message }
  }
}
