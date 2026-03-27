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
import { generateText } from 'ai'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { readAuxiliaryModelConf } from '@/modules/settings/auxiliaryModelConfStore'
import { getSaasClient } from '@/modules/saas/client'

const LOG_PREFIX = '[SkillTranslation]'

/** Translation status for a skill. */
export type SkillTranslationStatus = 'not-translated' | 'translated' | 'needs-update'

const META_FILE_NAME = 'openloaf.json'

/** Well-known language folder names (used to exclude from md scanning). */
const LANGUAGE_FOLDER_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/

/** openloaf.json metadata format. */
interface SkillTranslationMeta {
  /** Translated skill name (from front matter `name`). */
  name?: string
  /** Translated skill description (from front matter `description`). */
  description?: string
  /** Skill version (from front matter `version`). */
  version?: string
  /** Detected source language of the skill (e.g. 'en', 'zh-CN'). */
  sourceLanguage?: string
  /** Target language of the translation (e.g. 'zh-CN'). */
  targetLanguage?: string
  /** ISO timestamp of the last translation. */
  translatedAt?: string
  /** List of translated file relative paths. */
  translatedFiles?: string[]
  /** Color palette index (0-7). */
  colorIndex?: number | null
  /** Emoji icon for the skill. */
  icon?: string
}

/** Directories to exclude from translation scanning. */
const EXCLUDED_DIRS = new Set(['origin', 'scripts', 'assets', 'node_modules'])

/** Recursively find all .md files in a directory, excluding certain subdirs and language folders. */
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
      // Skip language folders (e.g. zh-CN, en-US, en)
      if (LANGUAGE_FOLDER_PATTERN.test(entry.name)) continue
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

/** Language display names for prompts. */
const LANGUAGE_NAMES: Record<string, { native: string; english: string }> = {
  'zh-CN': { native: '简体中文', english: 'Simplified Chinese' },
  'zh-TW': { native: '繁體中文', english: 'Traditional Chinese' },
  'en-US': { native: 'English', english: 'English' },
  'en': { native: 'English', english: 'English' },
  'ja': { native: '日本語', english: 'Japanese' },
  'ko': { native: '한국어', english: 'Korean' },
  'fr': { native: 'Français', english: 'French' },
  'de': { native: 'Deutsch', english: 'German' },
  'es': { native: 'Español', english: 'Spanish' },
}

/** Normalize language code to a standard form. */
function normalizeLanguageCode(lang: string): string {
  // zh → zh-CN, en → en-US
  if (lang === 'zh') return 'zh-CN'
  if (lang === 'en') return 'en-US'
  return lang
}

/** Check if two language codes refer to the same language. */
function isSameLanguage(a: string, b: string): boolean {
  const na = normalizeLanguageCode(a)
  const nb = normalizeLanguageCode(b)
  if (na === nb) return true
  // zh-CN and zh-TW are different
  // en and en-US are the same
  const baseA = na.split('-')[0]
  const baseB = nb.split('-')[0]
  // For Chinese, we need exact match (zh-CN ≠ zh-TW)
  if (baseA === 'zh' || baseB === 'zh') return na === nb
  return baseA === baseB
}

// ─── Language Detection ─────────────────────────────────────────────

const LANGUAGE_DETECT_PROMPT = `You are a language detection expert. Analyze the given text and determine what language it is written in.

Output a JSON object with exactly these fields:
- "language": the BCP-47 language code (e.g. "en", "zh-CN", "zh-TW", "ja", "ko", "fr", "de", "es")
- "confidence": a number from 0 to 1 indicating confidence

For Chinese text, distinguish between Simplified Chinese ("zh-CN") and Traditional Chinese ("zh-TW").
Only output the JSON object, nothing else.`

/** Detect the language of the given text using AI. */
async function detectLanguage(
  text: string,
  saasAccessToken?: string,
): Promise<{ language: string; confidence: number }> {
  // Take first ~500 chars for detection (enough for reliable detection)
  const sample = text.slice(0, 500)

  const conf = readAuxiliaryModelConf()

  let responseText: string

  if (conf.modelSource === 'saas') {
    const token = saasAccessToken
    if (!token) throw new Error('未登录云端账号，请先登录')
    const saasClient = getSaasClient(token)
    const res = await saasClient.auxiliary.infer({
      capabilityKey: 'text.translate',
      systemPrompt: LANGUAGE_DETECT_PROMPT,
      context: sample,
      outputMode: 'text',
    })
    if (!res.ok) throw new Error(res.message)
    responseText = String(res.result)
  } else {
    const modelIds =
      conf.modelSource === 'cloud' ? conf.cloudModelIds : conf.localModelIds
    const chatModelId = modelIds[0]?.trim() || undefined

    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource: conf.modelSource,
    })

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 30_000)

    try {
      const result = await generateText({
        model: resolved.model,
        system: LANGUAGE_DETECT_PROMPT,
        prompt: sample,
        abortSignal: abortController.signal,
      })
      responseText = result.text
    } finally {
      clearTimeout(timeout)
    }
  }

  // Parse JSON response
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        language: typeof parsed.language === 'string' ? parsed.language : 'en',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    }
  } catch {
    // fallback
  }
  return { language: 'en', confidence: 0.3 }
}

// ─── Translation ────────────────────────────────────────────────────

/** Build a translation prompt for the given target language. */
function buildTranslatePrompt(targetLang: string): string {
  const langInfo = LANGUAGE_NAMES[targetLang] ?? LANGUAGE_NAMES[normalizeLanguageCode(targetLang)]
  const targetName = langInfo?.native ?? targetLang

  return `You are a professional technical document translator. Translate the given Markdown skill document into ${targetName}.

Rules:
1. Translate the YAML front matter \`name\` and \`description\` fields into ${targetName}
2. Preserve all Markdown formatting (headings, lists, tables, links)
3. Do NOT translate code blocks or inline code
4. Keep file paths, variable names, and function names in their original form
5. For technical terms, annotate the original English term in parentheses on first occurrence
6. Output ONLY the translated result, no explanations or comments`
}

/**
 * Get translation status for a skill folder.
 */
export async function getSkillTranslationStatus(
  skillFolderPath: string,
  targetLanguage?: string,
): Promise<{
  status: SkillTranslationStatus
  displayName?: string
  description?: string
  translatedAt?: string
  sourceLanguage?: string
}> {
  const meta = await readSkillMeta(skillFolderPath)
  if (!meta) {
    return { status: 'not-translated' }
  }

  const effectiveTarget = targetLanguage ?? meta.targetLanguage
  if (!effectiveTarget) {
    return {
      status: 'not-translated',
      displayName: meta.name,
      description: meta.description,
      sourceLanguage: meta.sourceLanguage,
    }
  }

  // If source language is the same as target, it's "translated" (no translation needed)
  if (meta.sourceLanguage && isSameLanguage(meta.sourceLanguage, effectiveTarget)) {
    return {
      status: 'translated',
      displayName: meta.name,
      description: meta.description,
      translatedAt: meta.translatedAt,
      sourceLanguage: meta.sourceLanguage,
    }
  }

  // Check if translation folder exists with files
  const translationDir = path.join(skillFolderPath, normalizeLanguageCode(effectiveTarget))
  const translatedSkillMd = path.join(translationDir, 'SKILL.md')
  try {
    await fs.access(translatedSkillMd)
    return {
      status: 'translated',
      displayName: meta.name,
      description: meta.description,
      translatedAt: meta.translatedAt,
      sourceLanguage: meta.sourceLanguage,
    }
  } catch {
    // Translation folder doesn't exist or SKILL.md not found
    if (meta.translatedAt && meta.targetLanguage === normalizeLanguageCode(effectiveTarget)) {
      // Had a previous translation but files are missing → needs update
      return {
        status: 'needs-update',
        displayName: meta.name,
        description: meta.description,
        translatedAt: meta.translatedAt,
        sourceLanguage: meta.sourceLanguage,
      }
    }
    return {
      status: 'not-translated',
      displayName: meta.name,
      description: meta.description,
      sourceLanguage: meta.sourceLanguage,
    }
  }
}

/**
 * Translate a skill folder to the target language.
 * Translated files are placed in a subdirectory named after the target language code.
 */
export async function translateSkill(
  skillFolderPath: string,
  targetLanguage: string,
  saasAccessToken?: string,
): Promise<{
  ok: boolean
  translatedFiles: number
  skippedFiles: number
  error?: string
}> {
  const normalizedTarget = normalizeLanguageCode(targetLanguage)

  try {
    console.log(`${LOG_PREFIX} 开始翻译技能: ${skillFolderPath} → ${normalizedTarget}`)

    // Find all .md files (source files only, excludes language folders)
    const mdFiles = await findMdFiles(skillFolderPath, skillFolderPath)
    if (mdFiles.length === 0) {
      return { ok: true, translatedFiles: 0, skippedFiles: 0 }
    }

    // Read existing meta
    const meta: SkillTranslationMeta = (await readSkillMeta(skillFolderPath)) ?? {}

    // Detect source language from SKILL.md (or use cached value)
    let sourceLanguage = meta.sourceLanguage
    if (!sourceLanguage) {
      const skillMdPath = path.join(skillFolderPath, 'SKILL.md')
      try {
        const skillContent = await fs.readFile(skillMdPath, 'utf-8')
        console.log(`${LOG_PREFIX} 检测源语言...`)
        const detected = await detectLanguage(skillContent, saasAccessToken)
        sourceLanguage = detected.language
        console.log(`${LOG_PREFIX} 检测到源语言: ${sourceLanguage} (confidence: ${detected.confidence})`)
      } catch {
        sourceLanguage = 'en'
        console.log(`${LOG_PREFIX} 无法读取 SKILL.md，默认源语言: en`)
      }
      // Cache the detected language
      meta.sourceLanguage = sourceLanguage
    }

    // If source language matches target, skip file translation but still translate title via AI
    if (isSameLanguage(sourceLanguage, normalizedTarget)) {
      console.log(`${LOG_PREFIX} 源语言与目标语言相同 (${sourceLanguage}), 跳过文件翻译`)

      await translateTitleToMeta(skillFolderPath, normalizedTarget, meta, saasAccessToken)
      meta.targetLanguage = normalizedTarget
      meta.translatedAt = new Date().toISOString()
      await writeSkillMeta(skillFolderPath, meta)

      return { ok: true, translatedFiles: 0, skippedFiles: mdFiles.length }
    }

    // Create translation output directory
    const translationDir = path.join(skillFolderPath, normalizedTarget)
    await fs.mkdir(translationDir, { recursive: true })

    const translatePrompt = buildTranslatePrompt(normalizedTarget)
    let translatedFiles = 0
    let skippedFiles = 0
    const translatedFileList: string[] = []

    for (const relPath of mdFiles) {
      const fullPath = path.join(skillFolderPath, relPath)
      const content = await fs.readFile(fullPath, 'utf-8')

      // Write translated content to language subdirectory
      const outputPath = path.join(translationDir, relPath)
      const outputDir = path.dirname(outputPath)
      await fs.mkdir(outputDir, { recursive: true })

      // Translate
      console.log(`${LOG_PREFIX} 翻译文件: ${relPath}`)
      const translated = await callTranslation(content, translatePrompt, saasAccessToken)
      await fs.writeFile(outputPath, translated, 'utf-8')

      translatedFileList.push(relPath)
      translatedFiles++
    }

    // Translate title via AI for openloaf.json (same approach as translateSkillTitle)
    await translateTitleToMeta(skillFolderPath, normalizedTarget, meta, saasAccessToken)

    meta.sourceLanguage = sourceLanguage
    meta.targetLanguage = normalizedTarget
    meta.translatedAt = new Date().toISOString()
    meta.translatedFiles = translatedFileList
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
 * Read SKILL.md front matter as raw text and call AI to produce
 * translated name / description / icon, then write them into meta.
 * Reuses the same prompt as translateSkillTitle for consistent output.
 */
async function translateTitleToMeta(
  skillFolderPath: string,
  targetLanguage: string,
  meta: SkillTranslationMeta,
  saasAccessToken?: string,
): Promise<void> {
  const skillMdPath = path.join(skillFolderPath, 'SKILL.md')
  let content: string
  try {
    content = await fs.readFile(skillMdPath, 'utf-8')
  } catch {
    return
  }
  // Extract raw front matter block and send it to AI as-is
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch?.[1]) return
  const rawFrontMatter = fmMatch[1]

  const prompt = buildTitleTranslatePrompt(targetLanguage)
  try {
    const resultText = await callTranslation(rawFrontMatter, prompt, saasAccessToken)
    const jsonMatch = resultText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed.name === 'string' && parsed.name.trim()) meta.name = parsed.name.trim()
      if (typeof parsed.description === 'string' && parsed.description.trim()) meta.description = parsed.description.trim()
      if (typeof parsed.icon === 'string' && parsed.icon.trim()) meta.icon = parsed.icon.trim()
    }
  } catch {
    // AI call failed — fall back to raw extraction
    const fields = extractFrontMatterFields(content)
    if (fields.name) meta.name = fields.name
    if (fields.description) meta.description = fields.description
  }
}

/** Extract name, description, and version from YAML front matter. */
function extractFrontMatterFields(content: string): { name?: string; description?: string; version?: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch?.[1]) return {}
  const fm = fmMatch[1]
  const result: { name?: string; description?: string; version?: string } = {}
  result.name = extractYamlField(fm, 'name')
  result.description = extractYamlField(fm, 'description')
  result.version = extractYamlField(fm, 'version')
  return result
}

/**
 * Extract a single YAML field value, supporting:
 * - inline: `key: value`
 * - block scalar folded: `key: >\n  line1\n  line2` (joined with spaces)
 * - block scalar literal: `key: |\n  line1\n  line2` (joined with newlines)
 */
function extractYamlField(fm: string, key: string): string | undefined {
  const lines = fm.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineMatch = line.match(new RegExp(`^${key}:\\s*(.*)$`))
    if (!lineMatch) continue
    const inlineValue = (lineMatch[1] ?? '').trim()

    // Block scalar: > (folded) or | (literal)
    if (inlineValue === '>' || inlineValue === '|') {
      const isFolded = inlineValue === '>'
      const blockLines: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j] ?? ''
        // Continuation lines must be indented (start with spaces)
        if (/^\s+\S/.test(nextLine)) {
          blockLines.push(nextLine.trim())
        } else {
          break
        }
      }
      if (blockLines.length > 0) {
        return isFolded ? blockLines.join(' ') : blockLines.join('\n')
      }
      return undefined
    }

    // Inline value (strip surrounding quotes if any)
    if (inlineValue) {
      const unquoted = inlineValue.replace(/^["']|["']$/g, '')
      return unquoted || undefined
    }
    return undefined
  }
  return undefined
}

/** Call AI model for translation. */
async function callTranslation(
  content: string,
  systemPrompt: string,
  saasAccessToken?: string,
): Promise<string> {
  const conf = readAuxiliaryModelConf()

  // SaaS branch
  if (conf.modelSource === 'saas') {
    const token = saasAccessToken
    if (!token) throw new Error('未登录云端账号，请先登录')
    const saasClient = getSaasClient(token)
    const res = await saasClient.auxiliary.infer({
      capabilityKey: 'text.translate',
      systemPrompt,
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
      system: systemPrompt,
      prompt: content,
      abortSignal: abortController.signal,
    })
    return result.text
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Set the colorIndex field in a skill's openloaf.json.
 * Creates the file if it doesn't exist.
 */
export async function setSkillColorIndex(
  skillFolderPath: string,
  colorIndex: number | null,
): Promise<void> {
  const meta: SkillTranslationMeta = (await readSkillMeta(skillFolderPath)) ?? {}
  meta.colorIndex = colorIndex
  await writeSkillMeta(skillFolderPath, meta)
}

/**
 * Reset a skill's translation data: delete openloaf.json and any language folders.
 */
export async function resetSkill(skillFolderPath: string): Promise<void> {
  // Delete openloaf.json
  const metaPath = path.join(skillFolderPath, META_FILE_NAME)
  try {
    await fs.unlink(metaPath)
  } catch {
    // ignore if not exists
  }

  // Delete language folders (e.g. zh-CN/, en-US/, etc.)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(skillFolderPath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory() && LANGUAGE_FOLDER_PATTERN.test(entry.name)) {
      await fs.rm(path.join(skillFolderPath, entry.name), { recursive: true, force: true })
    }
  }

  // Also clean up legacy origin/ folder if it exists
  try {
    await fs.rm(path.join(skillFolderPath, 'origin'), { recursive: true, force: true })
  } catch {
    // ignore
  }
}

// ─── Batch Title Translation ────────────────────────────────────────

/** Build a prompt for translating only skill name and description. */
function buildTitleTranslatePrompt(targetLang: string): string {
  const langInfo = LANGUAGE_NAMES[targetLang] ?? LANGUAGE_NAMES[normalizeLanguageCode(targetLang)]
  const targetName = langInfo?.native ?? targetLang

  return `You are a professional translator. Translate the following skill name and description into ${targetName}.

Output a JSON object with exactly these fields:
- "name": the translated skill name — must be a short, human-readable display name in ${targetName}. If the original name is a technical identifier (e.g. kebab-case like "ai-test-development" or camelCase), convert it into a natural, readable name in ${targetName}.
- "description": the translated description in ${targetName}
- "icon": a single emoji character that best represents this skill's purpose (e.g. "🧪" for testing, "📧" for email, "🎨" for design, "🔧" for tools)

Only output the JSON object, nothing else.`
}

/**
 * Translate a single skill's title (name + description).
 * Skips if openloaf.json already exists. Only writes openloaf.json — does NOT translate full content.
 */
export async function translateSkillTitle(
  skillFolderPath: string,
  targetLanguage: string,
  saasAccessToken?: string,
): Promise<{
  ok: boolean
  translated: boolean
  name?: string
  description?: string
  icon?: string
  error?: string
}> {
  const normalizedTarget = normalizeLanguageCode(targetLanguage)

  try {
    // Skip if openloaf.json already exists
    const existingMeta = await readSkillMeta(skillFolderPath)
    if (existingMeta) {
      return { ok: true, translated: false, name: existingMeta.name, description: existingMeta.description }
    }

    // Read SKILL.md front matter
    const skillMdPath = path.join(skillFolderPath, 'SKILL.md')
    let content: string
    try {
      content = await fs.readFile(skillMdPath, 'utf-8')
    } catch {
      return { ok: true, translated: false }
    }

    const fields = extractFrontMatterFields(content)
    if (!fields.name && !fields.description) {
      return { ok: true, translated: false }
    }

    // Detect source language via AI
    const sampleText = [fields.name, fields.description].filter(Boolean).join('\n')
    console.log(`${LOG_PREFIX} 检测标题语言: ${skillFolderPath}`)
    const detected = await detectLanguage(sampleText, saasAccessToken)
    const sourceLanguage = detected.language

    // Always call AI to translate — it handles same-language cases (e.g. humanizing kebab-case names)
    console.log(`${LOG_PREFIX} 翻译标题: ${skillFolderPath} (${sourceLanguage} → ${normalizedTarget})`)
    const prompt = buildTitleTranslatePrompt(normalizedTarget)
    const inputJson = JSON.stringify({ name: fields.name ?? '', description: fields.description ?? '' })
    const resultText = await callTranslation(inputJson, prompt, saasAccessToken)

    let translatedName = fields.name
    let translatedDesc = fields.description
    let icon: string | undefined
    try {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (typeof parsed.name === 'string' && parsed.name.trim()) translatedName = parsed.name.trim()
        if (typeof parsed.description === 'string' && parsed.description.trim()) translatedDesc = parsed.description.trim()
        if (typeof parsed.icon === 'string' && parsed.icon.trim()) icon = parsed.icon.trim()
      }
    } catch {
      // If JSON parse fails, keep original values
    }

    const meta: SkillTranslationMeta = {
      name: translatedName,
      description: translatedDesc,
      version: fields.version,
      icon,
      sourceLanguage,
      targetLanguage: normalizedTarget,
      translatedAt: new Date().toISOString(),
    }
    await writeSkillMeta(skillFolderPath, meta)
    console.log(`${LOG_PREFIX} 标题翻译完成: ${skillFolderPath}`)
    return { ok: true, translated: true, name: translatedName, description: translatedDesc, icon }
  } catch (err) {
    const message = extractErrorMessage(err)
    console.error(`${LOG_PREFIX} 标题翻译失败:`, message)
    return { ok: false, translated: false, error: message }
  }
}

/** Map raw connection/SDK errors to user-friendly messages. */
const FRIENDLY_ERROR_PATTERNS: [RegExp, string][] = [
  [/reconnect/i, 'AI 模型连接失败，请检查模型配置或网络连接'],
  [/ECONNREFUSED/i, 'AI 模型服务未启动，请先启动本地模型'],
  [/ECONNRESET|EPIPE/i, 'AI 模型连接中断，请稍后重试'],
  [/ETIMEDOUT|timeout|aborted/i, 'AI 模型响应超时，请检查模型是否正常运行'],
  [/fetch failed|network/i, '网络连接失败，请检查网络设置'],
  [/unauthorized|401/i, '认证失败，请检查 API 密钥配置'],
  [/rate.?limit|429/i, '请求过于频繁，请稍后重试'],
]

/** Extract a human-readable error message, including nested SDK payload messages. */
function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return mapFriendlyError(String(err))
  const e = err as Record<string, unknown>
  // SDK errors may carry a payload with a message (e.g. { payload: { message: "今日配额已用完" } })
  if (e.payload && typeof e.payload === 'object') {
    const payload = e.payload as Record<string, unknown>
    if (typeof payload.message === 'string' && payload.message) return payload.message
  }
  // Some errors have a cause with a message
  if (e.cause && typeof e.cause === 'object') {
    const cause = e.cause as Record<string, unknown>
    if (typeof cause.message === 'string' && cause.message) return mapFriendlyError(cause.message)
  }
  if (err instanceof Error) return mapFriendlyError(err.message)
  return mapFriendlyError(String(err))
}

/** Replace raw technical error messages with user-friendly text. */
function mapFriendlyError(message: string): string {
  for (const [pattern, friendly] of FRIENDLY_ERROR_PATTERNS) {
    if (pattern.test(message)) return friendly
  }
  return message
}

