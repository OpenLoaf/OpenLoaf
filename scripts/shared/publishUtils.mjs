/**
 * 发布脚本共享工具模块。
 * 提供 R2 操作、SHA-256 计算、changelog 上传、渠道检测等通用能力。
 */

import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

// ---------------------------------------------------------------------------
// env 文件加载
// ---------------------------------------------------------------------------

/**
 * 加载 .env 文件中的变量到 process.env（不覆盖已有值）。
 */
export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const raw = readFileSync(filePath, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

// ---------------------------------------------------------------------------
// R2 / S3 客户端
// ---------------------------------------------------------------------------

/**
 * 创建 S3 客户端（兼容 Cloudflare R2）。
 */
export function createS3Client({ endpoint, accessKeyId, secretAccessKey }) {
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
}

/**
 * 校验必要的 R2 环境变量并返回配置对象。
 * 缺少时直接 process.exit(1)。
 */
export function validateR2Config() {
  const R2_BUCKET = process.env.R2_BUCKET
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL
  const R2_ENDPOINT = process.env.R2_ENDPOINT
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

  const missing = []
  if (!R2_BUCKET) missing.push('R2_BUCKET')
  if (!R2_PUBLIC_URL) missing.push('R2_PUBLIC_URL')
  if (!R2_ENDPOINT) missing.push('R2_ENDPOINT')
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID')
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY')

  if (missing.length > 0) {
    console.error(`❌ 缺少配置: ${missing.join(', ')}`)
    console.error('   请在 .env.prod 中设置以上变量')
    process.exit(1)
  }

  return {
    bucket: R2_BUCKET,
    publicUrl: R2_PUBLIC_URL,
    endpoint: R2_ENDPOINT,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  }
}

// ---------------------------------------------------------------------------
// 文件操作
// ---------------------------------------------------------------------------

/**
 * 上传本地文件到 R2。
 */
export async function uploadFile(s3, bucket, key, filePath) {
  const body = readFileSync(filePath)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
    })
  )
}

/**
 * 从 R2 下载 JSON 文件。
 */
export async function downloadJson(s3, bucket, key) {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  )
  const text = await res.Body.transformToString()
  return JSON.parse(text)
}

/**
 * 上传 JSON 到 R2。
 */
export async function uploadJson(s3, bucket, key, data) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    })
  )
}

/**
 * 计算文件 SHA-256 哈希值。
 */
export function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// 渠道检测
// ---------------------------------------------------------------------------

/**
 * 从版本号推断渠道：包含 -beta 则为 beta，否则为 stable。
 */
export function detectChannel(version) {
  return version.includes('-beta') ? 'beta' : 'stable'
}

/**
 * 解析 CLI 参数中的 --channel=xxx。
 * 未指定时根据版本号自动检测。
 */
export function resolveChannel(args, version) {
  for (const arg of args) {
    const match = arg.match(/^--channel=(.+)$/)
    if (match) return match[1]
  }
  return detectChannel(version)
}

// ---------------------------------------------------------------------------
// Changelog 上传
// ---------------------------------------------------------------------------

/**
 * 扫描本地 changelogs 目录并上传到 R2。
 * 本地结构：changelogs/{version}/{lang}.md（如 changelogs/0.1.0/zh.md）
 * R2 结构：changelogs/{component}/{version}/{lang}.md
 * 同时更新 changelogs/index.json。
 *
 * @param {object} opts
 * @param {S3Client} opts.s3
 * @param {string} opts.bucket
 * @param {string} opts.component - 'server' | 'web' | 'electron'
 * @param {string} opts.changelogsDir - 本地 changelogs 目录路径
 * @param {string} opts.publicUrl - R2 公共 URL
 */
export async function uploadChangelogs({ s3, bucket, component, changelogsDir, publicUrl }) {
  if (!existsSync(changelogsDir)) {
    console.log(`   (No changelogs directory found at ${changelogsDir})`)
    return
  }

  // 扫描版本子目录
  const versionDirs = readdirSync(changelogsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  if (versionDirs.length === 0) {
    console.log('   (No changelog version directories found)')
    return
  }

  /** @type {Array<{ version: string, date: string, langs: string[] }>} */
  const entries = []

  for (const version of versionDirs) {
    const versionDir = path.join(changelogsDir, version)
    const mdFiles = readdirSync(versionDir).filter((f) => f.endsWith('.md'))
    if (mdFiles.length === 0) continue

    const langs = []
    let date = new Date().toISOString().slice(0, 10)

    for (const file of mdFiles) {
      const lang = file.replace(/\.md$/, '')
      langs.push(lang)

      const filePath = path.join(versionDir, file)
      const r2Key = `changelogs/${component}/${version}/${file}`
      console.log(`   Uploading changelog: ${r2Key}`)
      const content = readFileSync(filePath)
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: r2Key,
          Body: content,
          ContentType: 'text/markdown',
        })
      )

      // 从 frontmatter 提取 date（取第一个文件的即可）
      if (langs.length === 1) {
        const raw = readFileSync(filePath, 'utf-8')
        const dateMatch = raw.match(/^---[\s\S]*?date:\s*(\S+)[\s\S]*?---/)
        if (dateMatch) date = dateMatch[1]
      }
    }

    entries.push({ version, date, langs })
  }

  // 按版本号降序排列
  entries.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))

  // 更新 changelogs/index.json
  let index = {}
  try {
    index = await downloadJson(s3, bucket, 'changelogs/index.json')
  } catch {
    // 首次创建
  }
  index[component] = entries
  await uploadJson(s3, bucket, 'changelogs/index.json', index)
  console.log(`   Updated changelogs/index.json for ${component}`)
}

/**
 * 为组件的 manifest 条目生成 changelogUrl（不含语言）。
 * 客户端拼接 /{lang}.md 获取对应语言版本。
 */
export function buildChangelogUrl(publicUrl, component, version) {
  return `${publicUrl}/changelogs/${component}/${version}`
}
