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
import { homedir } from 'node:os'
import JSZip from 'jszip'
import { getProjectRootPath } from '@openloaf/api'

const LOG_PREFIX = '[SkillImport]'

/** Supported archive extensions. */
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.skill'])

/** Resolve the target skills directory for the given scope. */
function resolveSkillsDir(scope: 'global' | 'project', projectId?: string): string {
  if (scope === 'global') {
    return path.join(homedir(), '.agents', 'skills')
  }
  if (!projectId) throw new Error('项目 ID 不能为空')
  const rootPath = getProjectRootPath(projectId)
  if (!rootPath) throw new Error('未找到项目')
  return path.join(rootPath, '.agents', 'skills')
}

/** Check if a directory contains SKILL.md (case-insensitive). */
async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir)
    return entries.some((e) => e.toUpperCase() === 'SKILL.MD')
  } catch {
    return false
  }
}

/** Find skill folders within a directory (including itself). */
async function findSkillFolders(dir: string): Promise<string[]> {
  // Check if dir itself has SKILL.md
  if (await hasSkillMd(dir)) {
    return [dir]
  }
  // Check immediate subdirectories
  const results: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const subDir = path.join(dir, entry.name)
      if (await hasSkillMd(subDir)) {
        results.push(subDir)
      }
    }
  } catch {
    // ignore
  }
  return results
}

/** Copy a directory recursively. */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  await fs.cp(src, dest, { recursive: true })
}

/**
 * Import a skill from a local folder path.
 * The folder must contain SKILL.md directly, or have subdirectories that do.
 */
async function importFromFolder(
  sourcePath: string,
  targetSkillsDir: string,
): Promise<string[]> {
  const skillFolders = await findSkillFolders(sourcePath)
  if (skillFolders.length === 0) {
    throw new Error('未找到 SKILL.md 文件，请确保拖入的是技能文件夹')
  }

  const imported: string[] = []
  for (const skillFolder of skillFolders) {
    const folderName = path.basename(skillFolder)
    const destDir = path.join(targetSkillsDir, folderName)

    // Avoid overwriting if destination already exists
    try {
      await fs.access(destDir)
      // Already exists — use a suffixed name
      const suffix = Date.now().toString(36)
      const altDestDir = path.join(targetSkillsDir, `${folderName}-${suffix}`)
      await copyDir(skillFolder, altDestDir)
      imported.push(path.basename(altDestDir))
    } catch {
      // Doesn't exist, safe to copy
      await copyDir(skillFolder, destDir)
      imported.push(folderName)
    }
  }
  return imported
}

/**
 * Import a skill from a zip/archive file.
 * The archive should contain a folder with SKILL.md inside it.
 */
async function importFromArchive(
  archivePath: string,
  targetSkillsDir: string,
): Promise<string[]> {
  const buffer = await fs.readFile(archivePath)
  const zip = await JSZip.loadAsync(buffer)

  const entries = Object.keys(zip.files)
  if (entries.length === 0) {
    throw new Error('压缩文件为空')
  }

  // Find SKILL.md entries
  const skillMdEntries = entries.filter((e) => {
    const name = e.toUpperCase()
    return name.endsWith('/SKILL.MD') || name === 'SKILL.MD'
  })

  if (skillMdEntries.length === 0) {
    throw new Error('压缩文件中未找到 SKILL.md')
  }

  // Determine skill root folders from SKILL.md locations
  const skillRoots = new Set<string>()
  for (const entry of skillMdEntries) {
    const parts = entry.split('/')
    if (parts.length === 1) {
      // SKILL.md at root of zip → use archive filename as folder name
      skillRoots.add('')
    } else {
      // nested/SKILL.md → use first path segment
      skillRoots.add(parts[0] ?? '')
    }
  }

  await fs.mkdir(targetSkillsDir, { recursive: true })

  const imported: string[] = []
  for (const root of skillRoots) {
    const prefix = root ? `${root}/` : ''
    // Determine folder name
    let folderName = root || path.basename(archivePath, path.extname(archivePath))
    let destDir = path.join(targetSkillsDir, folderName)

    // Avoid overwriting
    try {
      await fs.access(destDir)
      const suffix = Date.now().toString(36)
      folderName = `${folderName}-${suffix}`
      destDir = path.join(targetSkillsDir, folderName)
    } catch {
      // safe
    }

    await fs.mkdir(destDir, { recursive: true })

    // Extract all files under this root
    for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue
      const relevant = root ? entryPath.startsWith(prefix) : true
      if (!relevant) continue

      const relativePath = root ? entryPath.slice(prefix.length) : entryPath
      if (!relativePath) continue

      const targetPath = path.join(destDir, relativePath)
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      const content = await zipEntry.async('nodebuffer')
      await fs.writeFile(targetPath, content)
    }

    imported.push(folderName)
  }

  return imported
}

/**
 * Import skill(s) from a source path (folder or archive) into the skills directory.
 */
export async function importSkill(input: {
  sourcePath: string
  scope: 'global' | 'project'
  projectId?: string
}): Promise<{
  ok: boolean
  importedSkills: string[]
  error?: string
}> {
  try {
    const { sourcePath, scope, projectId } = input

    if (!sourcePath?.trim()) {
      throw new Error('源路径不能为空')
    }

    const targetSkillsDir = resolveSkillsDir(scope, projectId)
    await fs.mkdir(targetSkillsDir, { recursive: true })

    const stat = await fs.stat(sourcePath)
    let imported: string[]

    if (stat.isDirectory()) {
      console.log(`${LOG_PREFIX} 导入技能文件夹: ${sourcePath}`)
      imported = await importFromFolder(sourcePath, targetSkillsDir)
    } else if (stat.isFile()) {
      const ext = path.extname(sourcePath).toLowerCase()
      if (!ARCHIVE_EXTENSIONS.has(ext)) {
        throw new Error(`不支持的文件类型 ${ext}，支持 .zip 和 .skill 格式`)
      }
      console.log(`${LOG_PREFIX} 导入技能压缩包: ${sourcePath}`)
      imported = await importFromArchive(sourcePath, targetSkillsDir)
    } else {
      throw new Error('不支持的文件类型')
    }

    console.log(`${LOG_PREFIX} 导入完成: ${imported.join(', ')}`)
    return { ok: true, importedSkills: imported }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} 导入失败:`, message)
    return { ok: false, importedSkills: [], error: message }
  }
}

/**
 * Import skill from an uploaded zip buffer (for web non-Electron mode).
 */
export async function importSkillFromBuffer(input: {
  buffer: Buffer
  fileName: string
  scope: 'global' | 'project'
  projectId?: string
}): Promise<{
  ok: boolean
  importedSkills: string[]
  error?: string
}> {
  try {
    const { buffer, fileName, scope, projectId } = input

    const targetSkillsDir = resolveSkillsDir(scope, projectId)
    await fs.mkdir(targetSkillsDir, { recursive: true })

    // Write buffer to temp file and import
    const tmpDir = path.join(targetSkillsDir, '.tmp-import')
    await fs.mkdir(tmpDir, { recursive: true })
    const tmpPath = path.join(tmpDir, fileName)
    await fs.writeFile(tmpPath, buffer)

    try {
      const result = await importSkill({
        sourcePath: tmpPath,
        scope,
        projectId,
      })
      return result
    } finally {
      // Clean up temp file
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, importedSkills: [], error: message }
  }
}
