/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { homedir, platform } from 'node:os'
import { getProjectRootPath } from '@openloaf/api'

const LOG_PREFIX = '[ExternalSkills]'

/** External skill source definition. */
type ExternalSkillSource = {
  sourceId: string
  label: string
  /** Directories to scan (absolute paths). */
  paths: string[]
  /** File pattern to detect skills. */
  skillIndicator: 'SKILL.md' | '.mdc' | '.md' | '.instructions.md'
  /** Whether each subfolder is a skill, or each file is a skill. */
  mode: 'folder' | 'file'
}

/** Detected external skill. */
type DetectedSkill = {
  name: string
  targetName: string
  description: string
  sourcePath: string
  alreadyImported: boolean
}

/** Result of external skill detection. */
type DetectedSource = {
  sourceId: string
  label: string
  skills: DetectedSkill[]
}

/** Build the list of external sources to scan. */
export function buildExternalSources(projectRootPath?: string): ExternalSkillSource[] {
  const home = homedir()
  const sources: ExternalSkillSource[] = []

  // Claude Code — user skills + project skills + marketplace skills
  const claudePaths = [path.join(home, '.claude', 'skills')]
  if (projectRootPath) {
    claudePaths.push(path.join(projectRootPath, '.claude', 'skills'))
  }
  // Expand marketplace repos: ~/.claude/plugins/marketplaces/{repo}/skills/
  const marketplacesDir = path.join(home, '.claude', 'plugins', 'marketplaces')
  if (existsSync(marketplacesDir)) {
    try {
      for (const repo of readdirSync(marketplacesDir, { withFileTypes: true })) {
        if (!repo.isDirectory()) continue
        const repoSkillsDir = path.join(marketplacesDir, repo.name, 'skills')
        if (existsSync(repoSkillsDir)) {
          claudePaths.push(repoSkillsDir)
        }
      }
    } catch {
      // ignore read errors
    }
  }
  sources.push({
    sourceId: 'claude-code',
    label: 'Claude Code',
    paths: claudePaths,
    skillIndicator: 'SKILL.md',
    mode: 'folder',
  })

  // Codex (uses .agents/skills — the old OpenLoaf path, and ~/.codex/skills)
  const codexPaths = [path.join(home, '.codex', 'skills')]
  if (projectRootPath) {
    codexPaths.push(path.join(projectRootPath, '.agents', 'skills'))
  }
  sources.push({
    sourceId: 'codex',
    label: 'Codex',
    paths: codexPaths,
    skillIndicator: 'SKILL.md',
    mode: 'folder',
  })

  // Cursor
  const cursorPaths: string[] = []
  if (projectRootPath) {
    cursorPaths.push(path.join(projectRootPath, '.cursor', 'rules'))
  }
  sources.push({
    sourceId: 'cursor',
    label: 'Cursor',
    paths: cursorPaths,
    skillIndicator: '.mdc',
    mode: 'file',
  })

  // Windsurf
  const windsurfPaths = [path.join(home, '.codeium', 'windsurf', 'memories')]
  if (projectRootPath) {
    windsurfPaths.push(path.join(projectRootPath, '.windsurf', 'rules'))
  }
  sources.push({
    sourceId: 'windsurf',
    label: 'Windsurf',
    paths: windsurfPaths,
    skillIndicator: '.md',
    mode: 'file',
  })

  // GitHub Copilot
  const copilotPaths: string[] = []
  if (projectRootPath) {
    copilotPaths.push(path.join(projectRootPath, '.github', 'instructions'))
  }
  sources.push({
    sourceId: 'copilot',
    label: 'GitHub Copilot',
    paths: copilotPaths,
    skillIndicator: '.instructions.md',
    mode: 'file',
  })

  // Legacy OpenLoaf (old global path)
  sources.push({
    sourceId: 'other',
    label: '其他',
    paths: [path.join(home, '.agents', 'skills')],
    skillIndicator: 'SKILL.md',
    mode: 'folder',
  })

  return sources
}

/** Resolve the current OpenLoaf skills directory for a given scope. */
function resolveCurrentSkillsDir(scope: 'global' | 'project', projectRootPath?: string): string {
  if (scope === 'global') {
    return path.join(homedir(), '.openloaf', 'agents', 'skills')
  }
  if (!projectRootPath) return ''
  return path.join(projectRootPath, '.openloaf', 'agents', 'skills')
}

/** Check if a skill is already imported (exists as symlink or folder in target dir). */
export async function isAlreadyImported(
  targetSkillsDir: string,
  skillName: string,
  sourcePath: string,
): Promise<boolean> {
  if (!targetSkillsDir) return false
  const targetPath = path.join(targetSkillsDir, skillName)
  try {
    const stat = await fs.lstat(targetPath)
    if (stat.isSymbolicLink()) {
      const linkTarget = await fs.realpath(targetPath)
      const realSource = await fs.realpath(sourcePath)
      return linkTarget === realSource
    }
    return stat.isDirectory() || stat.isFile()
  } catch {
    return false
  }
}

/** Extract description from SKILL.md frontmatter or first content line. */
async function extractSkillDescription(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    // Try frontmatter description
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m)
    if (fmMatch) {
      const descMatch = fmMatch[1]?.match(/^description:\s*(.+)$/m)
      if (descMatch?.[1]) {
        const desc = descMatch[1].trim().replace(/^["']|["']$/g, '')
        if (desc) return desc
      }
    }
    // Fallback: first non-empty line after frontmatter
    const body = fmMatch ? content.slice(fmMatch[0].length) : content
    const firstLine = body.split('\n').find((l) => l.trim() && !l.startsWith('#'))
    return firstLine?.trim().slice(0, 120) ?? ''
  } catch {
    return ''
  }
}

/** Extract a short description from a non-SKILL.md file (first meaningful line). */
async function extractFileDescription(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const firstLine = content.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
    return firstLine?.trim().slice(0, 120) ?? ''
  } catch {
    return ''
  }
}

/** Scan a folder-based source (each subfolder with SKILL.md is a skill). */
export async function scanFolderSource(
  dirPath: string,
  targetSkillsDir: string,
  prefix: string,
): Promise<DetectedSkill[]> {
  const skills: DetectedSkill[] = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const skillDir = path.join(dirPath, entry.name)
      const skillMd = path.join(skillDir, 'SKILL.md')
      try {
        await fs.access(skillMd)
      } catch {
        continue
      }
      const targetName = prefix ? `${prefix}-${entry.name}` : entry.name
      const description = await extractSkillDescription(skillMd)
      const alreadyImported = await isAlreadyImported(targetSkillsDir, targetName, skillDir)
      skills.push({
        name: entry.name,
        targetName,
        description,
        sourcePath: skillDir,
        alreadyImported,
      })
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return skills
}

/** Scan a file-based source (each matching file is a skill). */
export async function scanFileSource(
  dirPath: string,
  extension: string,
  targetSkillsDir: string,
  prefix: string,
): Promise<DetectedSkill[]> {
  const skills: DetectedSkill[] = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      // Handle both regular files and symlinks pointing to files
      let isFile = entry.isFile()
      if (!isFile && entry.isSymbolicLink()) {
        try {
          const realStat = await fs.stat(path.join(dirPath, entry.name))
          isFile = realStat.isFile()
        } catch {
          continue
        }
      }
      if (!isFile) continue
      if (!entry.name.endsWith(extension)) continue
      // Strip extension to get skill name
      const baseName = entry.name.slice(0, -extension.length)
      if (!baseName) continue
      const filePath = path.join(dirPath, entry.name)
      const targetName = prefix ? `${prefix}-${baseName}` : baseName
      const description = await extractFileDescription(filePath)
      const alreadyImported = await isAlreadyImported(targetSkillsDir, targetName, filePath)
      skills.push({
        name: baseName,
        targetName,
        description,
        sourcePath: filePath,
        alreadyImported,
      })
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return skills
}

/**
 * Detect external skills from known AI tool paths.
 */
export async function detectExternalSkills(input: {
  projectId?: string
}): Promise<{ sources: DetectedSource[] }> {
  const projectRootPath = input.projectId
    ? getProjectRootPath(input.projectId) ?? undefined
    : undefined
  const sources = buildExternalSources(projectRootPath)

  // Determine target skills dir (project-scoped if projectId, otherwise global)
  const targetSkillsDir = input.projectId && projectRootPath
    ? resolveCurrentSkillsDir('project', projectRootPath)
    : resolveCurrentSkillsDir('global')

  const results: DetectedSource[] = []

  for (const source of sources) {
    const allSkills: DetectedSkill[] = []

    // Use source-appropriate prefix mapping
    const namePrefix = source.sourceId === 'other'
      ? ''
      : source.sourceId === 'claude-code'
        ? 'claude'
        : source.sourceId

    for (const dirPath of source.paths) {
      let skills: DetectedSkill[]
      if (source.mode === 'folder') {
        skills = await scanFolderSource(dirPath, targetSkillsDir, namePrefix)
      } else {
        skills = await scanFileSource(dirPath, source.skillIndicator, targetSkillsDir, namePrefix)
      }
      // Deduplicate by sourcePath
      for (const skill of skills) {
        if (!allSkills.some((s) => s.sourcePath === skill.sourcePath)) {
          allSkills.push(skill)
        }
      }
    }

    if (allSkills.length > 0) {
      results.push({
        sourceId: source.sourceId,
        label: source.label,
        skills: allSkills,
      })
    }
  }

  console.log(`${LOG_PREFIX} 检测到 ${results.reduce((n, s) => n + s.skills.length, 0)} 个外部技能`)
  return { sources: results }
}

/**
 * Import external skills via symlink (macOS/Linux) or copy (Windows).
 */
export async function importExternalSkills(input: {
  skills: Array<{
    sourceId: string
    sourcePath: string
    targetName: string
  }>
  method: 'link' | 'copy'
  scope: 'global' | 'project'
  projectId?: string
}): Promise<{
  ok: boolean
  importedSkills: string[]
  errors?: string[]
}> {
  const projectRootPath = input.projectId
    ? getProjectRootPath(input.projectId) ?? undefined
    : undefined
  const targetSkillsDir = input.scope === 'global'
    ? resolveCurrentSkillsDir('global')
    : resolveCurrentSkillsDir('project', projectRootPath)

  if (!targetSkillsDir) {
    return { ok: false, importedSkills: [], errors: ['无法确定目标技能目录'] }
  }

  await fs.mkdir(targetSkillsDir, { recursive: true })

  // 构建允许的源路径白名单（所有已知外部技能源目录）
  const allowedSourceDirs = buildExternalSources(projectRootPath)
    .flatMap((s) => s.paths)
    .map((p) => path.resolve(p))

  const imported: string[] = []
  const errors: string[] = []
  const useSymlink = input.method === 'link' && platform() !== 'win32'

  for (const skill of input.skills) {
    // sourcePath 白名单校验：必须位于已知的外部技能源目录内
    const resolvedSource = path.resolve(skill.sourcePath)
    const isAllowed = allowedSourceDirs.some((dir) =>
      resolvedSource === dir || resolvedSource.startsWith(dir + path.sep),
    )
    if (!isAllowed) {
      errors.push(`来源路径不在允许范围内: ${skill.sourcePath}`)
      continue
    }

    // 路径遍历安全校验：targetName 只允许为简单文件夹名
    const sanitizedName = path.basename(skill.targetName)
    if (!sanitizedName || sanitizedName !== skill.targetName || sanitizedName.includes('..')) {
      errors.push(`非法目标名称: ${skill.targetName}`)
      continue
    }
    const destPath = path.join(targetSkillsDir, sanitizedName)
    // 二次校验: 确保 destPath 在 targetSkillsDir 内
    if (!path.resolve(destPath).startsWith(path.resolve(targetSkillsDir) + path.sep)) {
      errors.push(`路径越界: ${skill.targetName}`)
      continue
    }

    try {
      // Check if destination already exists
      try {
        await fs.lstat(destPath)
        errors.push(`「${skill.targetName}」已存在，已跳过`)
        continue
      } catch {
        // Doesn't exist, safe to create
      }

      // Resolve the real source path (in case source is already a symlink)
      let realSourcePath: string
      try {
        realSourcePath = await fs.realpath(skill.sourcePath)
      } catch {
        realSourcePath = skill.sourcePath
      }

      // Check if source is a directory or a single file
      const sourceStat = await fs.stat(realSourcePath)
      const isSourceDir = sourceStat.isDirectory()

      if (isSourceDir) {
        // Directory-based skill (has SKILL.md inside)
        if (useSymlink) {
          await fs.symlink(realSourcePath, destPath)
          console.log(`${LOG_PREFIX} 创建链接: ${destPath} → ${realSourcePath}`)
        } else {
          await fs.cp(realSourcePath, destPath, { recursive: true })
          console.log(`${LOG_PREFIX} 复制技能: ${realSourcePath} → ${destPath}`)
        }
      } else {
        // Single-file skill (Cursor .mdc, Windsurf .md, Copilot .instructions.md):
        // Always create a folder with SKILL.md, optionally symlink the original file inside.
        await fs.mkdir(destPath, { recursive: true })
        const content = await fs.readFile(realSourcePath, 'utf8')
        const skillMdContent = wrapAsSkillMd(skill.targetName, content)
        await fs.writeFile(path.join(destPath, 'SKILL.md'), skillMdContent)
        // Also keep a link/copy of the original file for reference
        const originalFileName = path.basename(realSourcePath)
        const originalDest = path.join(destPath, originalFileName)
        if (useSymlink) {
          await fs.symlink(realSourcePath, originalDest)
        } else {
          await fs.copyFile(realSourcePath, originalDest)
        }
        console.log(`${LOG_PREFIX} 包装单文件技能: ${realSourcePath} → ${destPath}`)
      }

      imported.push(skill.targetName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`导入「${skill.targetName}」失败: ${msg}`)
    }
  }

  return {
    ok: imported.length > 0 || errors.length === 0,
    importedSkills: imported,
    errors: errors.length > 0 ? errors : undefined,
  }
}

/** Wrap a non-SKILL.md file content into SKILL.md format. */
export function wrapAsSkillMd(name: string, content: string): string {
  // Strip source prefix and sanitize: remove newlines and control characters to prevent YAML injection
  const cleanName = name
    .replace(/^(claude|codex|cursor|windsurf|copilot)-/, '')
    .replace(/[\r\n\t\0]/g, ' ')
    .trim()
  // YAML-safe: quote name if it contains special characters
  const safeName = /[:#\[\]{}&*!|>'"`,@\\]/u.test(cleanName) ? `"${cleanName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : cleanName
  return `---
name: ${safeName}
description: Imported from external tool
---

${content}
`
}
