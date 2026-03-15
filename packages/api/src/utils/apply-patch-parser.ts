/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export type UpdateFileChunk = {
  changeContext: string | null
  oldLines: string[]
  newLines: string[]
  isEndOfFile: boolean
}

export type Hunk =
  | { type: 'add'; path: string; contents: string }
  | { type: 'delete'; path: string }
  | {
      type: 'update'
      path: string
      movePath: string | null
      chunks: UpdateFileChunk[]
    }

/**
 * Parse an apply_patch patch string into structured hunks.
 */
export function parsePatch(patch: string): Hunk[] {
  const lines = patch.split('\n')
  const hunks: Hunk[] = []
  let i = 0

  // 逻辑：允许 patch 文本前面带有额外说明，只从 Begin Patch 开始解析。
  while (i < lines.length && lines[i]!.trim() !== '*** Begin Patch') {
    i++
  }
  if (i >= lines.length) return hunks
  i++

  while (i < lines.length) {
    const line = lines[i]!.trim()
    if (line === '*** End Patch') break

    if (line.startsWith('*** Add File:')) {
      const filePath = line.slice('*** Add File:'.length).trim()
      i++
      const contentLines: string[] = []
      while (i < lines.length) {
        const currentLine = lines[i]!
        if (currentLine.trimEnd().startsWith('***')) break
        // 逻辑：新增文件 patch 每行通常带 +，这里统一去掉前缀，兼容少量无前缀输入。
        contentLines.push(currentLine.startsWith('+') ? currentLine.slice(1) : currentLine)
        i++
      }
      hunks.push({ type: 'add', path: filePath, contents: contentLines.join('\n') })
      continue
    }

    if (line.startsWith('*** Delete File:')) {
      const filePath = line.slice('*** Delete File:'.length).trim()
      hunks.push({ type: 'delete', path: filePath })
      i++
      continue
    }

    if (line.startsWith('*** Update File:')) {
      const filePath = line.slice('*** Update File:'.length).trim()
      i++
      let movePath: string | null = null
      if (i < lines.length && lines[i]!.trim().startsWith('*** Move to:')) {
        movePath = lines[i]!.trim().slice('*** Move to:'.length).trim()
        i++
      }
      const chunks: UpdateFileChunk[] = []
      while (i < lines.length) {
        const currentLine = lines[i]!
        if (
          currentLine.trimEnd().startsWith('***') &&
          !currentLine.trimEnd().startsWith('*** End of File')
        ) {
          break
        }
        const chunk = parseChunk(lines, i)
        chunks.push(chunk.chunk)
        i = chunk.nextIndex
      }
      hunks.push({ type: 'update', path: filePath, movePath, chunks })
      continue
    }

    i++
  }

  return hunks
}

/**
 * Parse a single update chunk starting at the given line index.
 */
function parseChunk(
  lines: string[],
  startIndex: number,
): { chunk: UpdateFileChunk; nextIndex: number } {
  let i = startIndex
  let changeContext: string | null = null
  let isEndOfFile = false

  if (i < lines.length && lines[i]!.trimEnd().startsWith('@@')) {
    const contextLine = lines[i]!.trimEnd()
    changeContext = contextLine.slice(2).trim() || null
    i++
  }

  if (i < lines.length && lines[i]!.trimEnd() === '*** End of File') {
    isEndOfFile = true
    i++
  }

  const oldLines: string[] = []
  const newLines: string[] = []

  while (i < lines.length) {
    const currentLine = lines[i]!
    const trimmedLine = currentLine.trimEnd()
    if (trimmedLine.startsWith('***') || trimmedLine.startsWith('@@')) break

    if (currentLine.startsWith('+')) {
      newLines.push(currentLine.slice(1))
      i++
      continue
    }

    if (currentLine.startsWith('-')) {
      oldLines.push(currentLine.slice(1))
      i++
      continue
    }

    if (currentLine.startsWith(' ')) {
      const text = currentLine.slice(1)
      oldLines.push(text)
      newLines.push(text)
      i++
      continue
    }

    if (trimmedLine === '*** End of File') {
      isEndOfFile = true
      i++
      break
    }

    // 逻辑：空行或无前缀文本按上下文行处理，兼容非标准 patch 片段。
    oldLines.push(currentLine)
    newLines.push(currentLine)
    i++
  }

  return {
    chunk: { changeContext, oldLines, newLines, isEndOfFile },
    nextIndex: i,
  }
}

/**
 * Seek a line sequence from the current search window.
 */
export function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | null {
  if (pattern.length === 0) return start

  type Comparator = (a: string, b: string) => boolean
  const comparators: Comparator[] = [
    (a, b) => a === b,
    (a, b) => a.trimEnd() === b.trimEnd(),
    (a, b) => a.trim() === b.trim(),
    (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, ''),
  ]

  for (const compare of comparators) {
    const result = eof
      ? seekFromEnd(lines, pattern, compare)
      : seekForward(lines, pattern, start, compare)
    if (result !== null) return result
  }

  return null
}

/**
 * Seek a sequence by scanning forward.
 */
function seekForward(
  lines: string[],
  pattern: string[],
  start: number,
  compare: (a: string, b: string) => boolean,
): number | null {
  const maxStart = lines.length - pattern.length
  for (let i = start; i <= maxStart; i++) {
    let matched = true
    for (let j = 0; j < pattern.length; j++) {
      if (!compare(lines[i + j]!, pattern[j]!)) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return null
}

/**
 * Seek a sequence by scanning from the end of the file.
 */
function seekFromEnd(
  lines: string[],
  pattern: string[],
  compare: (a: string, b: string) => boolean,
): number | null {
  const maxStart = lines.length - pattern.length
  for (let i = maxStart; i >= 0; i--) {
    let matched = true
    for (let j = 0; j < pattern.length; j++) {
      if (!compare(lines[i + j]!, pattern[j]!)) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return null
}

/**
 * Compute concrete replacement ranges for update chunks.
 */
export function computeReplacements(
  lines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
): [number, number, string[]][] {
  const replacements: [number, number, string[]][] = []
  let searchStart = 0

  for (const chunk of chunks) {
    const { changeContext, oldLines, newLines, isEndOfFile } = chunk

    if (changeContext) {
      const contextIndex = seekSequence(lines, [changeContext], searchStart, false)
      if (contextIndex !== null) {
        searchStart = contextIndex
      }
    }

    if (oldLines.length === 0) {
      const insertAt = isEndOfFile ? lines.length : searchStart
      replacements.push([insertAt, insertAt, newLines])
      continue
    }

    const matchIndex = seekSequence(lines, oldLines, searchStart, isEndOfFile)
    if (matchIndex === null) {
      throw new Error(
        `Patch failed: could not find matching lines in ${filePath}.\n` +
          `Looking for:\n${oldLines.map((line) => `  ${line}`).join('\n')}`,
      )
    }
    replacements.push([matchIndex, matchIndex + oldLines.length, newLines])
    searchStart = matchIndex + oldLines.length
  }

  return replacements
}

/**
 * Apply replacements from back to front to avoid index drift.
 */
export function applyReplacements(
  lines: string[],
  replacements: [number, number, string[]][],
): string[] {
  const result = [...lines]
  const sorted = [...replacements].sort((left, right) => right[0] - left[0])
  for (const [start, end, newLines] of sorted) {
    result.splice(start, end - start, ...newLines)
  }
  return result
}
