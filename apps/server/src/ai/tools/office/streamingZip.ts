/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { resolveToolPath } from '@/ai/tools/toolScope'
import type { OfficeEdit } from './types'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

// ---------------------------------------------------------------------------
// yauzl promisification helpers
// ---------------------------------------------------------------------------

type YauzlZipFile = yauzl.ZipFile
type YauzlEntry = yauzl.Entry

function openZip(filePath: string): Promise<YauzlZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) reject(err)
      else resolve(zipfile!)
    })
  })
}

function readEntryStream(zipfile: YauzlZipFile, entry: YauzlEntry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err)
      else resolve(stream!)
    })
  })
}

async function readEntryBuffer(zipfile: YauzlZipFile, entry: YauzlEntry): Promise<Buffer> {
  const stream = await readEntryStream(zipfile, entry)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function iterateEntries(zipfile: YauzlZipFile): AsyncIterable<YauzlEntry> {
  return {
    [Symbol.asyncIterator]() {
      let resolveNext: ((result: IteratorResult<YauzlEntry>) => void) | null = null
      let done = false

      zipfile.on('entry', (entry: YauzlEntry) => {
        if (resolveNext) {
          const r = resolveNext
          resolveNext = null
          r({ value: entry, done: false })
        }
      })

      zipfile.on('end', () => {
        done = true
        if (resolveNext) {
          const r = resolveNext
          resolveNext = null
          r({ value: undefined as any, done: true })
        }
      })

      return {
        next(): Promise<IteratorResult<YauzlEntry>> {
          if (done) return Promise.resolve({ value: undefined as any, done: true })
          return new Promise((resolve) => {
            resolveNext = resolve
            zipfile.readEntry()
          })
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Normalize a filename for fuzzy matching: lowercase, strip all whitespace. */
function normalizeForFuzzyMatch(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

/** Validate and resolve an Office file path. Returns absolute path. */
export async function resolveOfficeFile(filePath: string, allowedExts: string[]): Promise<string> {
  const { absPath } = resolveToolPath({ target: filePath })
  let resolvedPath = absPath
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(resolvedPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // AI 经常把中文文件名里的空格幻觉进去（或少写）。扫同目录做归一化匹配兜底。
      const dir = path.dirname(resolvedPath)
      const base = path.basename(resolvedPath)
      const wanted = normalizeForFuzzyMatch(base)
      try {
        const siblings = await fs.readdir(dir)
        const hit = siblings.find(n => normalizeForFuzzyMatch(n) === wanted)
        if (hit) {
          resolvedPath = path.join(dir, hit)
          stat = await fs.stat(resolvedPath)
        } else {
          throw err
        }
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }
  if (!stat.isFile()) throw new Error('Path is not a file.')
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size (${(stat.size / 1024 / 1024).toFixed(1)} MB) exceeds 100 MB limit.`,
    )
  }
  const ext = path.extname(resolvedPath).toLowerCase()
  if (!allowedExts.includes(ext)) {
    throw new Error(
      `Unsupported file format "${ext}". Expected: ${allowedExts.join(', ')}`,
    )
  }
  return resolvedPath
}

/** List all entries in a ZIP file. */
export async function listZipEntries(absPath: string): Promise<string[]> {
  const zipfile = await openZip(absPath)
  const entries: string[] = []
  for await (const entry of iterateEntries(zipfile)) {
    entries.push(entry.fileName)
  }
  zipfile.close()
  return entries
}

/** Read a single entry from a ZIP file as a UTF-8 string. */
export async function readZipEntryText(absPath: string, entryPath: string): Promise<string> {
  const buf = await readZipEntryBuffer(absPath, entryPath)
  return buf.toString('utf-8')
}

/** Read a single entry from a ZIP file as a Buffer. */
export async function readZipEntryBuffer(absPath: string, entryPath: string): Promise<Buffer> {
  const zipfile = await openZip(absPath)
  try {
    for await (const entry of iterateEntries(zipfile)) {
      if (entry.fileName === entryPath) {
        const buf = await readEntryBuffer(zipfile, entry)
        zipfile.close()
        return buf
      }
    }
    throw new Error(`Entry "${entryPath}" not found in ZIP.`)
  } catch (err) {
    zipfile.close()
    throw err
  }
}

/** Read multiple entries from a ZIP file. Returns a Map of path → Buffer. */
export async function readZipEntries(
  absPath: string,
  entryPaths: string[],
): Promise<Map<string, Buffer>> {
  const needed = new Set(entryPaths)
  const result = new Map<string, Buffer>()
  if (needed.size === 0) return result

  const zipfile = await openZip(absPath)
  try {
    for await (const entry of iterateEntries(zipfile)) {
      if (needed.has(entry.fileName)) {
        result.set(entry.fileName, await readEntryBuffer(zipfile, entry))
        needed.delete(entry.fileName)
        if (needed.size === 0) break
      }
    }
  } finally {
    zipfile.close()
  }
  return result
}

/** Apply edits to a ZIP file (streaming copy + modifications). */
export async function editZip(
  srcPath: string,
  dstPath: string,
  edits: OfficeEdit[],
): Promise<void> {
  // Build lookup maps for edits
  const xmlEdits = new Map<string, OfficeEdit[]>()
  const writeOps = new Map<string, string>() // path → source
  const deleteSet = new Set<string>()

  for (const edit of edits) {
    if (edit.op === 'delete') {
      deleteSet.add(edit.path)
    } else if (edit.op === 'write') {
      writeOps.set(edit.path, edit.source)
    } else {
      // replace, insert, remove — grouped by ZIP entry path
      const existing = xmlEdits.get(edit.path) ?? []
      existing.push(edit)
      xmlEdits.set(edit.path, existing)
    }
  }

  // Lazy import xpathEditor to avoid circular deps
  const { applyXmlEdits } = await import('./xpathEditor')

  const zipfile = await openZip(srcPath)
  const output = new yazl.ZipFile()
  const tmpPath = dstPath + '.tmp'

  try {
    // Process existing entries
    for await (const entry of iterateEntries(zipfile)) {
      const entryName = entry.fileName
      if (deleteSet.has(entryName)) continue

      if (xmlEdits.has(entryName)) {
        // Entry needs XML edits
        const buf = await readEntryBuffer(zipfile, entry)
        const xmlStr = buf.toString('utf-8')
        const editOps = xmlEdits.get(entryName)!
        const modified = await applyXmlEdits(xmlStr, editOps, entryName)
        output.addBuffer(Buffer.from(modified, 'utf-8'), entryName)
        xmlEdits.delete(entryName)
      } else if (writeOps.has(entryName)) {
        // Entry will be overwritten by write op — skip original, handle below
        continue
      } else {
        // Copy entry as-is
        const buf = await readEntryBuffer(zipfile, entry)
        output.addBuffer(buf, entryName)
      }
    }
    zipfile.close()

    // Add write ops (new or overwritten entries)
    for (const [entryPath, source] of writeOps) {
      const buf = await resolveSource(source)
      output.addBuffer(buf, entryPath)
    }

    // Write output
    output.end()
    await fs.mkdir(path.dirname(tmpPath), { recursive: true })
    const writeStream = createWriteStream(tmpPath)
    await pipeline(output.outputStream, writeStream)

    // Atomic replace
    await fs.rename(tmpPath, dstPath)
  } catch (err) {
    zipfile.close()
    await fs.unlink(tmpPath).catch(() => {})
    throw err
  }
}

/** Create a new ZIP file from a map of entry path → Buffer. */
export async function createZip(
  dstPath: string,
  entries: Map<string, Buffer>,
): Promise<void> {
  const output = new yazl.ZipFile()
  for (const [entryPath, buf] of entries) {
    output.addBuffer(buf, entryPath)
  }
  output.end()
  await fs.mkdir(path.dirname(dstPath), { recursive: true })
  const writeStream = createWriteStream(dstPath)
  await pipeline(output.outputStream, writeStream)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve a source (file path or URL) to a Buffer. */
async function resolveSource(source: string): Promise<Buffer> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const resp = await fetch(source)
    if (!resp.ok) throw new Error(`Failed to download: ${source} (${resp.status})`)
    return Buffer.from(await resp.arrayBuffer())
  }
  // Local file path
  const { absPath } = resolveToolPath({ target: source })
  return fs.readFile(absPath)
}
