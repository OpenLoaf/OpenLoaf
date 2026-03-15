/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { generateText } from 'ai'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { readAuxiliaryModelConf } from '@/modules/settings/auxiliaryModelConfStore'
import { getSaasClient } from '@/modules/saas/client'

const LOG_PREFIX = '[SkillTranslation]'

/** Translation status for a skill. */
export type SkillTranslationStatus = 'not-translated' | 'translated' | 'needs-update'

const META_FILE_NAME = 'openloaf.json'

/** openloaf.json metadata format. */
interface SkillTranslationMeta {
  /** Translated skill name (from front matter `name`). */
  name?: string
  /** Translated skill description (from front matter `description`). */
  description?: string
  /** Skill version (from front matter `version`). */
  version?: string
  translatedAt?: string
  targetLanguage: string
  files: Record<
    string,
    {
      originHash: string
      translatedHash: string
    }
  >
}

/** Directories to exclude from translation scanning. */
const EXCLUDED_DIRS = new Set(['origin', 'scripts', 'assets', 'node_modules'])

/** Compute MD5 hash of content. */
function md5(content: string): string {
  return createHash('md5').update(content).digest('hex')
}

/** Recursively find all .md files in a directory, excluding certain subdirs. */
async function findMdFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      const subResults = await findMdFiles(path.join(dir, entry.name), baseDir)
      results.push(...subResults)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const relative = path.relative(baseDir, path.join(dir, entry.name))
      results.push(relative.replace(/\\/g, '/'))
    }
  }
  return results
}

/** Read openloaf.json from a skill folder. */
async function readSkillMeta(skillFolderPath: string): Promise<SkillTranslationMeta | null> {
  try {
    const raw = await fs.readFile(path.join(skillFolderPath, META_FILE_NAME), 'utf-8')
    return JSON.parse(raw) as SkillTranslationMeta
  } catch {
    return null
  }
}

/** Write openloaf.json to a skill folder. */
async function writeSkillMeta(skillFolderPath: string, meta: SkillTranslationMeta): Promise<void> {
  await fs.writeFile(
    path.join(skillFolderPath, META_FILE_NAME),
    JSON.stringify(meta, null, 2),
    'utf-8',
  )
}

/**
 * Get translation status for a skill folder.
 */
export async function getSkillTranslationStatus(skillFolderPath: string): Promise<{
  status: SkillTranslationStatus
  displayName?: string
  description?: string
  translatedAt?: string
}> {
  const meta = await readSkillMeta(skillFolderPath)
  if (!meta) {
    return { status: 'not-translated' }
  }

  // Check SKILL.md as primary indicator
  const skillMdPath = path.join(skillFolderPath, 'SKILL.md')
  let currentContent: string
  try {
    currentContent = await fs.readFile(skillMdPath, 'utf-8')
  } catch {
    return { status: 'not-translated' }
  }

  const currentHash = md5(currentContent)
  const skillMdMeta = meta.files['SKILL.md']

  if (!skillMdMeta) {
    return { status: 'not-translated', displayName: meta.name, description: meta.description }
  }

  if (currentHash === skillMdMeta.translatedHash) {
    return {
      status: 'translated',
      displayName: meta.name,
      description: meta.description,
      translatedAt: meta.translatedAt,
    }
  }

  if (currentHash === skillMdMeta.originHash) {
    return { status: 'not-translated', displayName: meta.name, description: meta.description }
  }

  // Content differs from both origin and translation → needs update
  return {
    status: 'needs-update',
    displayName: meta.name,
    description: meta.description,
    translatedAt: meta.translatedAt,
  }
}

const SKILL_TRANSLATE_PROMPT = `你是专业技术文档翻译专家。将英文 Markdown 技能文档翻译为中文。
规则：
1. YAML front matter 中 name 和 description 都翻译为中文
2. 保留所有 Markdown 格式（标题、列表、表格、链接）
3. 代码块和内联代码不翻译
4. 文件路径、变量名、函数名保持英文
5. 专业术语首次出现时括号标注英文
6. 只输出翻译结果，不要添加任何解释或注释`

/**
 * Translate a skill folder to Chinese.
 */
export async function translateSkill(
  skillFolderPath: string,
  saasAccessToken?: string,
): Promise<{
  ok: boolean
  translatedFiles: number
  skippedFiles: number
  error?: string
}> {
  try {
    console.log(`${LOG_PREFIX} 开始翻译技能: ${skillFolderPath}`)

    // Find all .md files
    const mdFiles = await findMdFiles(skillFolderPath, skillFolderPath)
    if (mdFiles.length === 0) {
      return { ok: true, translatedFiles: 0, skippedFiles: 0 }
    }

    // Read existing meta
    const meta = (await readSkillMeta(skillFolderPath)) ?? {
      targetLanguage: 'zh-CN',
      files: {},
    }

    let translatedFiles = 0
    let skippedFiles = 0

    for (const relPath of mdFiles) {
      const fullPath = path.join(skillFolderPath, relPath)
      const content = await fs.readFile(fullPath, 'utf-8')
      const currentHash = md5(content)

      // Skip if already translated and unchanged
      const fileMeta = meta.files[relPath]
      if (fileMeta && currentHash === fileMeta.translatedHash) {
        console.log(`${LOG_PREFIX} 跳过已翻译文件: ${relPath}`)
        skippedFiles++
        continue
      }

      // Determine origin content: if we have an origin backup and current matches translatedHash,
      // use origin backup; otherwise use current content as origin
      let originContent = content
      const originPath = path.join(skillFolderPath, 'origin', relPath)
      if (fileMeta?.originHash) {
        try {
          const existingOrigin = await fs.readFile(originPath, 'utf-8')
          if (md5(existingOrigin) === fileMeta.originHash) {
            // Origin backup is valid, but current file has changed (new version)
            originContent = content
          }
        } catch {
          // No origin backup exists
        }
      }

      // Backup original to origin/
      const originDir = path.dirname(originPath)
      await fs.mkdir(originDir, { recursive: true })
      await fs.writeFile(originPath, originContent, 'utf-8')
      const originHash = md5(originContent)

      // Translate
      console.log(`${LOG_PREFIX} 翻译文件: ${relPath}`)
      const translated = await callTranslation(originContent, saasAccessToken)

      // Write translated content back
      await fs.writeFile(fullPath, translated, 'utf-8')
      const translatedHash = md5(translated)

      meta.files[relPath] = { originHash, translatedHash }
      translatedFiles++
    }

    // Extract name and description from translated SKILL.md front matter
    const translatedSkillMd = path.join(skillFolderPath, 'SKILL.md')
    try {
      const translatedContent = await fs.readFile(translatedSkillMd, 'utf-8')
      const fields = extractFrontMatterFields(translatedContent)
      if (fields.name) meta.name = fields.name
      if (fields.description) meta.description = fields.description
      if (fields.version) meta.version = fields.version
    } catch {
      // ignore
    }

    meta.translatedAt = new Date().toISOString()
    meta.targetLanguage = 'zh-CN'
    await writeSkillMeta(skillFolderPath, meta)

    console.log(
      `${LOG_PREFIX} 翻译完成: ${translatedFiles} 个文件已翻译, ${skippedFiles} 个跳过`,
    )
    return { ok: true, translatedFiles, skippedFiles }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} 翻译失败:`, message)
    return { ok: false, translatedFiles: 0, skippedFiles: 0, error: message }
  }
}

/**
 * Restore original skill files from origin/ backup.
 */
export async function restoreSkillTranslation(skillFolderPath: string): Promise<{
  ok: boolean
  restoredFiles: number
}> {
  const originDir = path.join(skillFolderPath, 'origin')
  let restoredFiles = 0

  try {
    const originFiles = await findMdFiles(originDir, originDir)
    for (const relPath of originFiles) {
      const originPath = path.join(originDir, relPath)
      const targetPath = path.join(skillFolderPath, relPath)
      const content = await fs.readFile(originPath, 'utf-8')
      await fs.writeFile(targetPath, content, 'utf-8')
      restoredFiles++
    }

    // Remove openloaf.json
    try {
      await fs.unlink(path.join(skillFolderPath, META_FILE_NAME))
    } catch {
      // ignore
    }

    return { ok: true, restoredFiles }
  } catch (err) {
    console.error(`${LOG_PREFIX} 恢复失败:`, err)
    return { ok: false, restoredFiles: 0 }
  }
}

/** Extract name, description, and version from YAML front matter. */
function extractFrontMatterFields(content: string): { name?: string; description?: string; version?: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch?.[1]) return {}
  const fm = fmMatch[1]
  const result: { name?: string; description?: string; version?: string } = {}
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  if (nameMatch?.[1]?.trim()) result.name = nameMatch[1].trim()
  const descMatch = fm.match(/^description:\s*(.+)$/m)
  if (descMatch?.[1]?.trim()) result.description = descMatch[1].trim()
  const versionMatch = fm.match(/^version:\s*(.+)$/m)
  if (versionMatch?.[1]?.trim()) result.version = versionMatch[1].trim()
  return result
}

/** Call AI model for translation. */
async function callTranslation(content: string, saasAccessToken?: string): Promise<string> {
  const conf = readAuxiliaryModelConf()

  // SaaS branch
  if (conf.modelSource === 'saas') {
    const token = saasAccessToken
    if (!token) throw new Error('未登录云端账号，请先登录')
    const saasClient = getSaasClient(token)
    const res = await saasClient.auxiliary.infer({
      capabilityKey: 'text.translate',
      systemPrompt: SKILL_TRANSLATE_PROMPT,
      context: content,
      outputMode: 'text',
    })
    if (!res.ok) throw new Error(res.message)
    return String(res.result)
  }

  // Local/Cloud branch
  const modelIds =
    conf.modelSource === 'cloud' ? conf.cloudModelIds : conf.localModelIds
  const chatModelId = modelIds[0]?.trim() || undefined

  const resolved = await resolveChatModel({
    chatModelId,
    chatModelSource: conf.modelSource,
  })

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 120_000)

  try {
    const result = await generateText({
      model: resolved.model,
      system: SKILL_TRANSLATE_PROMPT,
      prompt: content,
      abortSignal: abortController.signal,
    })
    return result.text
  } finally {
    clearTimeout(timeout)
  }
}
