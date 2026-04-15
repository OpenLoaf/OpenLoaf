/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Archive (.zip) extractor for the unified Read tool.
 *
 * Extracts every entry to `{assetDirAbsPath}` (which the Read dispatcher sets
 * to `{sessionAssetDir}/{basename}_unzipped`), then returns a FileContentResult
 * whose `content` is a Markdown tree listing. The extracted folder path is
 * surfaced via `assetDir` so the model can Read any specific file afterward.
 *
 * Safety: bounded total size, bounded entry count, path-traversal guard.
 */
import { promises as fs, createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import type { FileContentResult } from './types'

const MAX_ENTRIES = 2000
const MAX_TOTAL_BYTES = 256 * 1024 * 1024 // 256 MB extracted
const MAX_SINGLE_ENTRY_BYTES = 128 * 1024 * 1024 // 128 MB per file
/** How many top-level directory rollup rows to show when archive is deep. */
const MAX_TOPLEVEL_ROWS = 40
/** How many extension stat rows to show in the summary. */
const MAX_EXT_ROWS = 20
/** Show flat listing inline only for small archives. */
const INLINE_FLAT_LIMIT = 60

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error('zip open failed'))
      else resolve(zipfile)
    })
  })
}

function openEntryStream(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) reject(err ?? new Error('zip entry stream failed'))
      else resolve(stream)
    })
  })
}

/** Normalize and guard a zip entry path against traversal / absolute roots. */
function safeJoin(rootAbs: string, entryName: string): string | null {
  // Strip leading slashes, reject absolute / drive paths, reject any `..` segment.
  const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized === '.' || normalized === '..') return null
  if (/^[A-Za-z]:/.test(normalized)) return null
  const segments = normalized.split('/')
  if (segments.some((s) => s === '..')) return null
  const target = path.resolve(rootAbs, ...segments)
  const rel = path.relative(rootAbs, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return target
}

type EntryRecord = {
  name: string
  isDir: boolean
  size: number
  extracted: boolean
  skipReason?: string
}

export async function extractArchiveContent(
  absPath: string,
  assetDirAbsPath: string,
  assetRelPrefix: string,
): Promise<FileContentResult> {
  await fs.mkdir(assetDirAbsPath, { recursive: true })

  const zipfile = await openZip(absPath)
  const entries: EntryRecord[] = []
  let totalBytes = 0
  let entryCount = 0
  let truncated = false

  await new Promise<void>((resolve, reject) => {
    zipfile.on('error', reject)
    zipfile.on('end', resolve)
    zipfile.on('entry', async (entry: yauzl.Entry) => {
      try {
        entryCount += 1
        if (entryCount > MAX_ENTRIES) {
          truncated = true
          zipfile.close()
          resolve()
          return
        }
        const isDir = /\/$/.test(entry.fileName)
        const rec: EntryRecord = {
          name: entry.fileName,
          isDir,
          size: entry.uncompressedSize,
          extracted: false,
        }
        entries.push(rec)

        const target = safeJoin(assetDirAbsPath, entry.fileName)
        if (!target) {
          rec.skipReason = 'unsafe path (traversal or absolute)'
          zipfile.readEntry()
          return
        }

        if (isDir) {
          await fs.mkdir(target, { recursive: true })
          rec.extracted = true
          zipfile.readEntry()
          return
        }

        if (entry.uncompressedSize > MAX_SINGLE_ENTRY_BYTES) {
          rec.skipReason = `entry too large (${entry.uncompressedSize} > ${MAX_SINGLE_ENTRY_BYTES})`
          zipfile.readEntry()
          return
        }
        if (totalBytes + entry.uncompressedSize > MAX_TOTAL_BYTES) {
          rec.skipReason = 'total size budget exceeded'
          truncated = true
          zipfile.close()
          resolve()
          return
        }

        await fs.mkdir(path.dirname(target), { recursive: true })
        const stream = await openEntryStream(zipfile, entry)
        await pipeline(stream, createWriteStream(target))
        totalBytes += entry.uncompressedSize
        rec.extracted = true
        zipfile.readEntry()
      } catch (err) {
        reject(err)
      }
    })
    zipfile.readEntry()
  })

  // ---------------------------------------------------------------------
  // Roll up entries into (a) top-level directory summary and (b) extension
  // stats, instead of dumping a flat list the model has to scan line by line.
  // For tiny archives (< INLINE_FLAT_LIMIT) we still show a flat listing as
  // the primary content since the summary buys nothing there.
  // ---------------------------------------------------------------------
  const { topLevel, rootFiles, extStats, skipped } = rollupEntries(entries)
  const lines: string[] = []
  lines.push(`# Archive: ${path.basename(absPath)}`)
  lines.push('')
  lines.push(`- entries: **${entries.length}**${truncated ? ' (truncated)' : ''}`)
  lines.push(`- extracted total: ${formatBytes(totalBytes)}`)
  lines.push(`- extracted to (abs): \`${assetDirAbsPath}\``)
  lines.push(`- extracted to (template): \`\${CURRENT_CHAT_DIR}/${assetRelPrefix}\``)
  if (skipped.length > 0) {
    lines.push(`- skipped: **${skipped.length}** entries (see bottom of this envelope)`)
  }
  lines.push('')
  lines.push(
    '> Use Bash / Glob / Grep on the absolute path to explore further, or ' +
      'call `Read` with the template path + a relative sub-path to read a specific file.',
  )
  lines.push('')

  if (entries.length <= INLINE_FLAT_LIMIT) {
    lines.push('## Contents')
    lines.push('')
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name))
    for (const e of sorted) {
      const icon = e.isDir ? '📁' : '📄'
      const sizeLabel = e.isDir ? '' : ` — ${formatBytes(e.size)}`
      const statusLabel = e.extracted ? '' : ` — ⚠ skipped: ${e.skipReason ?? 'unknown'}`
      lines.push(`- ${icon} \`${e.name}\`${sizeLabel}${statusLabel}`)
    }
  } else {
    // Top-level directory rollup
    lines.push('## Top-level layout')
    lines.push('')
    const topRows = topLevel.slice(0, MAX_TOPLEVEL_ROWS)
    for (const row of topRows) {
      lines.push(
        `- 📁 \`${row.name}/\` — ${row.fileCount} file(s), ${formatBytes(row.totalBytes)}` +
          (row.dirCount > 0 ? `, ${row.dirCount} subdir(s)` : ''),
      )
    }
    if (topLevel.length > topRows.length) {
      lines.push(`- …and ${topLevel.length - topRows.length} more top-level dirs`)
    }
    if (rootFiles.length > 0) {
      lines.push('')
      lines.push('### Root-level files')
      for (const f of rootFiles.slice(0, 30)) {
        lines.push(`- 📄 \`${f.name}\` — ${formatBytes(f.size)}`)
      }
      if (rootFiles.length > 30) {
        lines.push(`- …and ${rootFiles.length - 30} more root-level files`)
      }
    }

    // Extension stats
    lines.push('')
    lines.push('## By extension')
    lines.push('')
    lines.push('| ext | count | total size |')
    lines.push('| --- | ---: | ---: |')
    for (const row of extStats.slice(0, MAX_EXT_ROWS)) {
      lines.push(`| \`${row.ext}\` | ${row.count} | ${formatBytes(row.totalBytes)} |`)
    }
    if (extStats.length > MAX_EXT_ROWS) {
      lines.push(`| …${extStats.length - MAX_EXT_ROWS} more | | |`)
    }

    lines.push('')
    lines.push('## How to dig deeper')
    lines.push('')
    lines.push(
      `- List everything: \`Bash ls -laR "${assetDirAbsPath}" | head -200\`` +
        ` (or \`Glob "\${CURRENT_CHAT_DIR}/${assetRelPrefix}/**/*"\`)`,
    )
    if (extStats[0]) {
      const hot = extStats[0]!
      lines.push(
        `- Find all \`${hot.ext}\` files: \`Glob "\${CURRENT_CHAT_DIR}/${assetRelPrefix}/**/*${hot.ext === '(no ext)' ? '' : hot.ext}"\``,
      )
    }
    lines.push(
      `- Search text inside: \`Grep "<pattern>" path="${assetDirAbsPath}"\``,
    )
    lines.push(
      `- Read a specific file: \`Read "\${CURRENT_CHAT_DIR}/${assetRelPrefix}/<relative/path>"\``,
    )
  }

  if (skipped.length > 0) {
    lines.push('')
    lines.push('## Skipped entries')
    lines.push('')
    for (const e of skipped.slice(0, 20)) {
      lines.push(`- ⚠ \`${e.name}\` — ${e.skipReason ?? 'unknown'}`)
    }
    if (skipped.length > 20) {
      lines.push(`- …and ${skipped.length - 20} more skipped entries`)
    }
  }

  return {
    type: 'archive',
    fileName: path.basename(absPath),
    content: lines.join('\n'),
    meta: {
      entryCount: entries.length,
      extractedBytes: totalBytes,
      truncated,
      skippedCount: skipped.length,
      topLevelDirCount: topLevel.length,
      rootFileCount: rootFiles.length,
      extensionCount: extStats.length,
    },
    images: [],
    assetDir: assetRelPrefix,
    truncated,
  }
}

// ---------------------------------------------------------------------------
// Rollup helpers
// ---------------------------------------------------------------------------

type TopLevelRow = {
  name: string
  fileCount: number
  dirCount: number
  totalBytes: number
}

type ExtRow = {
  ext: string
  count: number
  totalBytes: number
}

type RootFile = {
  name: string
  size: number
}

function rollupEntries(entries: EntryRecord[]): {
  topLevel: TopLevelRow[]
  rootFiles: RootFile[]
  extStats: ExtRow[]
  skipped: EntryRecord[]
} {
  const topLevelMap = new Map<string, TopLevelRow>()
  const extMap = new Map<string, ExtRow>()
  const rootFiles: RootFile[] = []
  const skipped: EntryRecord[] = []

  for (const e of entries) {
    if (!e.extracted) {
      skipped.push(e)
    }
    // normalize
    const name = e.name.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!name || name === '.' || name === '..') continue

    const slashIdx = name.indexOf('/')
    if (slashIdx === -1) {
      // Top-level leaf (file at archive root, or bare dir with no trailing /)
      if (e.isDir) {
        const row = topLevelMap.get(name) ?? { name, fileCount: 0, dirCount: 0, totalBytes: 0 }
        topLevelMap.set(name, row)
      } else {
        rootFiles.push({ name, size: e.size })
        bumpExt(extMap, name, e.size)
      }
      continue
    }

    const top = name.slice(0, slashIdx)
    const row = topLevelMap.get(top) ?? {
      name: top,
      fileCount: 0,
      dirCount: 0,
      totalBytes: 0,
    }
    if (e.isDir) {
      row.dirCount += 1
    } else {
      row.fileCount += 1
      row.totalBytes += e.size
      bumpExt(extMap, name, e.size)
    }
    topLevelMap.set(top, row)
  }

  const topLevel = Array.from(topLevelMap.values()).sort(
    (a, b) => b.totalBytes - a.totalBytes,
  )
  const extStats = Array.from(extMap.values()).sort((a, b) => b.count - a.count)
  rootFiles.sort((a, b) => b.size - a.size)

  return { topLevel, rootFiles, extStats, skipped }
}

function bumpExt(map: Map<string, ExtRow>, name: string, size: number): void {
  const base = name.slice(name.lastIndexOf('/') + 1)
  const dotIdx = base.lastIndexOf('.')
  const ext = dotIdx <= 0 ? '(no ext)' : base.slice(dotIdx).toLowerCase()
  const row = map.get(ext) ?? { ext, count: 0, totalBytes: 0 }
  row.count += 1
  row.totalBytes += size
  map.set(ext, row)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
