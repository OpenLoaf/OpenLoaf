// ─── 类型 ───

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

// ─── 解析器 ───

export function parsePatch(patch: string): Hunk[] {
  const lines = patch.split('\n')
  const hunks: Hunk[] = []
  let i = 0

  // 跳到 *** Begin Patch
  while (i < lines.length && lines[i]!.trim() !== '*** Begin Patch') {
    i++
  }
  if (i >= lines.length) return hunks
  i++ // 跳过 Begin Patch 行

  while (i < lines.length) {
    const line = lines[i]!.trim()
    if (line === '*** End Patch') break

    if (line.startsWith('*** Add File:')) {
      const filePath = line.slice('*** Add File:'.length).trim()
      i++
      const contentLines: string[] = []
      while (i < lines.length) {
        const cur = lines[i]!
        if (cur.trimEnd().startsWith('***')) break
        // 每行以 + 开头，去掉前缀
        contentLines.push(cur.startsWith('+') ? cur.slice(1) : cur)
        i++
      }
      hunks.push({ type: 'add', path: filePath, contents: contentLines.join('\n') })
    } else if (line.startsWith('*** Delete File:')) {
      const filePath = line.slice('*** Delete File:'.length).trim()
      hunks.push({ type: 'delete', path: filePath })
      i++
    } else if (line.startsWith('*** Update File:')) {
      const filePath = line.slice('*** Update File:'.length).trim()
      i++
      let movePath: string | null = null
      // 检查 Move to
      if (i < lines.length && lines[i]!.trim().startsWith('*** Move to:')) {
        movePath = lines[i]!.trim().slice('*** Move to:'.length).trim()
        i++
      }
      const chunks: UpdateFileChunk[] = []
      while (i < lines.length) {
        const cur = lines[i]!
        if (cur.trimEnd().startsWith('***') && !cur.trimEnd().startsWith('*** End of File')) break
        if (cur.trimEnd().startsWith('@@') || cur.trimEnd() === '*** End of File') {
          const chunk = parseChunk(lines, i)
          chunks.push(chunk.chunk)
          i = chunk.nextIndex
        } else {
          // 隐式 chunk（无 @@ 头）
          const chunk = parseChunk(lines, i)
          chunks.push(chunk.chunk)
          i = chunk.nextIndex
        }
      }
      hunks.push({ type: 'update', path: filePath, movePath, chunks })
    } else {
      i++
    }
  }

  return hunks
}

function parseChunk(
  lines: string[],
  startIndex: number,
): { chunk: UpdateFileChunk; nextIndex: number } {
  let i = startIndex
  let changeContext: string | null = null
  let isEndOfFile = false

  // 解析 @@ 上下文标识符
  if (i < lines.length && lines[i]!.trimEnd().startsWith('@@')) {
    const ctxLine = lines[i]!.trimEnd()
    changeContext = ctxLine.slice(2).trim() || null
    i++
  }

  // 检查 *** End of File
  if (i < lines.length && lines[i]!.trimEnd() === '*** End of File') {
    isEndOfFile = true
    i++
  }

  const oldLines: string[] = []
  const newLines: string[] = []

  while (i < lines.length) {
    const cur = lines[i]!
    const trimmed = cur.trimEnd()
    if (trimmed.startsWith('***') || trimmed.startsWith('@@')) break

    if (cur.startsWith('+')) {
      newLines.push(cur.slice(1))
      i++
    } else if (cur.startsWith('-')) {
      oldLines.push(cur.slice(1))
      i++
    } else if (cur.startsWith(' ')) {
      // 上下文行：同时加入 old 和 new
      const text = cur.slice(1)
      oldLines.push(text)
      newLines.push(text)
      i++
    } else if (trimmed === '*** End of File') {
      isEndOfFile = true
      i++
      break
    } else {
      // 空行或无前缀行视为上下文
      oldLines.push(cur)
      newLines.push(cur)
      i++
    }
  }

  return {
    chunk: { changeContext, oldLines, newLines, isEndOfFile },
    nextIndex: i,
  }
}

// ─── 模糊匹配 ───

/**
 * 在 lines 中从 start 位置开始搜索 pattern 序列。
 * 支持 4 级模糊匹配：
 * 1. 精确匹配
 * 2. 忽略尾部空白
 * 3. 忽略前导/尾部空白
 * 4. 忽略所有空白
 * 如果 eof 为 true，从文件末尾向前搜索。
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

  for (const cmp of comparators) {
    const result = eof
      ? seekFromEnd(lines, pattern, cmp)
      : seekForward(lines, pattern, start, cmp)
    if (result !== null) return result
  }

  return null
}

function seekForward(
  lines: string[],
  pattern: string[],
  start: number,
  cmp: (a: string, b: string) => boolean,
): number | null {
  const maxStart = lines.length - pattern.length
  for (let i = start; i <= maxStart; i++) {
    let match = true
    for (let j = 0; j < pattern.length; j++) {
      if (!cmp(lines[i + j]!, pattern[j]!)) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return null
}

function seekFromEnd(
  lines: string[],
  pattern: string[],
  cmp: (a: string, b: string) => boolean,
): number | null {
  const maxStart = lines.length - pattern.length
  for (let i = maxStart; i >= 0; i--) {
    let match = true
    for (let j = 0; j < pattern.length; j++) {
      if (!cmp(lines[i + j]!, pattern[j]!)) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return null
}

// ─── 替换计算 ───

/**
 * 计算每个 chunk 在文件中的替换区间。
 * 返回 [startLine, endLine, newLines][] 数组。
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

    // 如果有 @@ 上下文标识符，先定位到该上下文
    if (changeContext) {
      const ctxIndex = seekSequence(lines, [changeContext], searchStart, false)
      if (ctxIndex !== null) {
        searchStart = ctxIndex
      }
    }

    if (oldLines.length === 0) {
      // 纯插入：在 searchStart 位置插入
      const insertAt = isEndOfFile ? lines.length : searchStart
      replacements.push([insertAt, insertAt, newLines])
    } else {
      const matchIndex = seekSequence(lines, oldLines, searchStart, isEndOfFile)
      if (matchIndex === null) {
        throw new Error(
          `Patch failed: could not find matching lines in ${filePath}.\n` +
            `Looking for:\n${oldLines.map((l) => `  ${l}`).join('\n')}`,
        )
      }
      replacements.push([matchIndex, matchIndex + oldLines.length, newLines])
      searchStart = matchIndex + oldLines.length
    }
  }

  return replacements
}

// ─── 应用替换 ───

/**
 * 逆序应用替换，避免索引偏移。
 */
export function applyReplacements(
  lines: string[],
  replacements: [number, number, string[]][],
): string[] {
  const result = [...lines]
  // 逆序应用，从后往前
  const sorted = [...replacements].sort((a, b) => b[0] - a[0])
  for (const [start, end, newLines] of sorted) {
    result.splice(start, end - start, ...newLines)
  }
  return result
}
