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
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.skill', '.tar', '.tar.gz', '.tgz'])

/** Archive format detected by magic bytes. */
type ArchiveFormat = 'zip' | 'tar' | 'gzip' | 'unknown'

/** Detect archive format from file header magic bytes. */
function detectArchiveFormat(header: Buffer): ArchiveFormat {
  // ZIP: starts with PK\x03\x04
  if (header.length >= 4 && header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04) {
    return 'zip'
  }
  // GZIP: starts with \x1f\x8b
  if (header.length >= 2 && header[0] === 0x1F && header[1] === 0x8B) {
    return 'gzip'
  }
  // TAR: "ustar" at offset 257
  if (header.length >= 262 && header.toString('ascii', 257, 262) === 'ustar') {
    return 'tar'
  }
  return 'unknown'
}

/** Check if a filename has a double extension like .tar.gz */
function hasDoubleExt(name: string): boolean {
  return /\.tar\.gz$/i.test(name)
}

/** Resolve the target skills directory for the given scope. */
function resolveSkillsDir(scope: 'global' | 'project', projectId?: string): string {
  if (scope === 'global') {
    return path.join(homedir(), '.openloaf', 'skills')
  }
  if (!projectId) throw new Error('项目 ID 不能为空')
  const rootPath = getProjectRootPath(projectId)
  if (!rootPath) throw new Error('未找到项目')
  return path.join(rootPath, '.openloaf', 'skills')
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
 * Import a skill from an archive file (zip, tar, tar.gz, tgz, .skill).
 * Auto-detects format by file magic bytes.
 */
async function importFromArchive(
  archivePath: string,
  targetSkillsDir: string,
): Promise<string[]> {
  const buffer = await fs.readFile(archivePath)
  const format = detectArchiveFormat(buffer)

  if (format === 'zip') {
    return importFromZipBuffer(buffer, archivePath, targetSkillsDir)
  }
  if (format === 'gzip' || format === 'tar') {
    return importFromTar(archivePath, targetSkillsDir, format === 'gzip')
  }

  throw new Error(
    `无法识别文件「${path.basename(archivePath)}」的压缩格式，支持 ZIP、TAR、TAR.GZ 格式`,
  )
}

/** Import from a ZIP buffer. */
async function importFromZipBuffer(
  buffer: Buffer,
  archivePath: string,
  targetSkillsDir: string,
): Promise<string[]> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error(
      `无法解压文件「${path.basename(archivePath)}」，文件已损坏或不是有效的 ZIP 压缩包`,
    )
  }

  const entries = Object.keys(zip.files)
  if (entries.length === 0) {
    throw new Error('压缩文件为空')
  }

  const skillMdEntries = entries.filter((e) => {
    const name = e.toUpperCase()
    return name.endsWith('/SKILL.MD') || name === 'SKILL.MD'
  })

  if (skillMdEntries.length === 0) {
    throw new Error('压缩文件中未找到 SKILL.md')
  }

  const skillRoots = new Set<string>()
  for (const entry of skillMdEntries) {
    const parts = entry.split('/')
    if (parts.length === 1) {
      skillRoots.add('')
    } else {
      skillRoots.add(parts[0] ?? '')
    }
  }

  await fs.mkdir(targetSkillsDir, { recursive: true })

  const imported: string[] = []
  for (const root of skillRoots) {
    const prefix = root ? `${root}/` : ''
    let folderName = root || stripArchiveExt(archivePath)
    let destDir = path.join(targetSkillsDir, folderName)

    try {
      await fs.access(destDir)
      const suffix = Date.now().toString(36)
      folderName = `${folderName}-${suffix}`
      destDir = path.join(targetSkillsDir, folderName)
    } catch {
      // safe
    }

    await fs.mkdir(destDir, { recursive: true })

    for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue
      const relevant = root ? entryPath.startsWith(prefix) : true
      if (!relevant) continue

      const relativePath = root ? entryPath.slice(prefix.length) : entryPath
      if (!relativePath) continue

      const targetPath = path.join(destDir, relativePath)
      const resolved = path.resolve(targetPath)
      if (!resolved.startsWith(path.resolve(destDir) + path.sep) && resolved !== path.resolve(destDir)) {
        continue // Skip malicious entries with path traversal
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      const content = await zipEntry.async('nodebuffer')
      await fs.writeFile(targetPath, content)
    }

    imported.push(folderName)
  }

  return imported
}

/** Import from a TAR or TAR.GZ file using system tar command. */
async function importFromTar(
  archivePath: string,
  targetSkillsDir: string,
  isGzipped: boolean,
): Promise<string[]> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  const tmpDir = path.join(targetSkillsDir, `.tmp-tar-${Date.now().toString(36)}`)
  await fs.mkdir(tmpDir, { recursive: true })

  try {
    const args = ['-xf', archivePath, '-C', tmpDir]
    if (isGzipped) args.splice(1, 0, '-z')
    await execFileAsync('tar', args, { timeout: 30_000 })

    const skillFolders = await findSkillFolders(tmpDir)
    if (skillFolders.length === 0) {
      throw new Error('压缩文件中未找到 SKILL.md')
    }

    return await importFromFolder(tmpDir, targetSkillsDir)
  } catch (err) {
    if (err instanceof Error && err.message.includes('SKILL.md')) throw err
    throw new Error(
      `无法解压文件「${path.basename(archivePath)}」，文件已损坏或不是有效的 TAR 压缩包`,
    )
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Strip archive extension(s) from filename to get a clean folder name. */
function stripArchiveExt(archivePath: string): string {
  const base = path.basename(archivePath)
  // Handle .tar.gz first
  if (/\.tar\.gz$/i.test(base)) return base.slice(0, -7)
  return path.basename(base, path.extname(base))
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
      // Check extension (.tar.gz needs special handling)
      const lower = sourcePath.toLowerCase()
      const isArchive = [...ARCHIVE_EXTENSIONS].some(
        (ext) => lower.endsWith(ext),
      )
      if (!isArchive) {
        const ext = path.extname(sourcePath).toLowerCase()
        throw new Error(`不支持的文件类型 ${ext}，支持 .zip、.tar、.tar.gz、.tgz、.skill 格式`)
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
    const tmpPath = path.join(tmpDir, path.basename(fileName))
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
