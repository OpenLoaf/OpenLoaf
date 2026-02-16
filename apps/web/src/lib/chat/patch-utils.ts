/** 从 patch 文本提取文件信息（供 WriteFileTool 和 toolParts 共用） */
export function extractPatchFileInfo(patch: string): {
  fileName: string
  fileCount: number
  firstPath: string
} {
  const re = /\*\*\* (?:Add|Update|Delete) File: (.+)/g
  const paths: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(patch)) !== null) {
    paths.push(m[1]!)
  }
  const firstPath = paths[0] ?? ''
  const fileName = firstPath
    ? (firstPath.split('/').pop() || firstPath)
    : '写入文件'
  return { fileName, fileCount: paths.length, firstPath }
}

/** 从 patch 文本统计新增/删除行数 */
export function extractPatchDiffStats(patch: string): {
  added: number
  removed: number
  type: 'add' | 'delete' | 'update' | 'unknown'
} {
  let added = 0
  let removed = 0
  let type: 'add' | 'delete' | 'update' | 'unknown' = 'unknown'
  let inPatch = false

  for (const line of patch.split('\n')) {
    if (line.startsWith('*** Begin Patch')) {
      inPatch = true
      continue
    }
    if (line.startsWith('*** End Patch')) break
    if (!inPatch) continue

    // 逻辑：从指令行提取操作类型（取第一个）
    if (line.startsWith('*** Add File:')) {
      if (type === 'unknown') type = 'add'
      continue
    }
    if (line.startsWith('*** Update File:')) {
      if (type === 'unknown') type = 'update'
      continue
    }
    if (line.startsWith('*** Delete File:')) {
      if (type === 'unknown') type = 'delete'
      continue
    }
    // 逻辑：跳过其他指令行
    if (line.startsWith('***') || line.startsWith('@@')) continue

    if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }

  return { added, removed, type }
}

export type DiffLine = { type: '+' | '-' | ' '; text: string; lineNo: number | null }

/** 从 patch 文本提取变更行（仅 +/- 行，用于预览） */
export function extractPatchDiffLines(
  patch: string,
  maxLines = 6,
): DiffLine[] {
  const lines: DiffLine[] = []
  let inPatch = false
  let oldLine: number | null = null
  let newLine: number | null = null

  for (const line of patch.split('\n')) {
    if (line.startsWith('*** Begin Patch')) {
      inPatch = true
      continue
    }
    if (line.startsWith('*** End Patch')) break
    if (!inPatch) continue
    if (line.startsWith('***')) continue

    // 逻辑：从 @@ 行解析起始行号（描述性 @@ 行无数字则保持 null）
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/)
      if (m) {
        oldLine = Number(m[1])
        newLine = Number(m[2])
      }
      continue
    }

    if (line.startsWith('+')) {
      lines.push({ type: '+', text: line.slice(1), lineNo: newLine })
      if (newLine !== null) newLine++
    } else if (line.startsWith('-')) {
      lines.push({ type: '-', text: line.slice(1), lineNo: oldLine })
      if (oldLine !== null) oldLine++
    } else {
      // 逻辑：上下文行，两边行号都递增
      if (oldLine !== null) oldLine++
      if (newLine !== null) newLine++
    }
    if (lines.length >= maxLines) break
  }
  return lines
}

/** 根据文件扩展名检测 Monaco 语言 ID */
const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  java: 'java',
  py: 'python',
  go: 'go',
  rs: 'rust',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  bat: 'bat',
  ps1: 'powershell',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  dart: 'dart',
  lua: 'lua',
  r: 'r',
  dockerfile: 'dockerfile',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'graphql',
  vue: 'html',
  svelte: 'html',
}

export function detectLanguageFromPath(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() ?? ''
  // 逻辑：处理无扩展名的特殊文件名（如 Dockerfile）
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'shell'
  const ext = name.split('.').pop() ?? ''
  return EXT_LANG_MAP[ext] ?? 'plaintext'
}
