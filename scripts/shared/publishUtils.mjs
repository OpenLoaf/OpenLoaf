/**
 * 发布脚本共享工具模块。
 * 提供 R2 操作、SHA-256 计算、changelog 上传、渠道检测等通用能力。
 */

import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

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
 * 创建腾讯 COS S3 兼容客户端。
 * COS_ENDPOINT 应设为虚拟主机式地址：https://{bucket}.cos.{region}.myqcloud.com
 * 不使用 forcePathStyle，否则 bucket 名会出现在 URL path 中导致路径错误。
 */
export function createCosS3Client({ endpoint, region, accessKeyId, secretAccessKey }) {
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  })
}

/**
 * 读取 COS 环境变量，配置不完整时返回 null（不强制退出，COS 为可选目标）。
 */
export function validateCosConfig() {
  const COS_BUCKET = process.env.COS_BUCKET
  const COS_PUBLIC_URL = process.env.COS_PUBLIC_URL
  const COS_ENDPOINT = process.env.COS_ENDPOINT
  const COS_REGION = process.env.COS_REGION
  const COS_SECRET_ID = process.env.COS_SECRET_ID
  const COS_SECRET_KEY = process.env.COS_SECRET_KEY

  if (!COS_BUCKET || !COS_ENDPOINT || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) {
    return null
  }

  return {
    bucket: COS_BUCKET,
    publicUrl: (COS_PUBLIC_URL ?? '').trim().replace(/\/$/, ''),
    endpoint: COS_ENDPOINT,
    region: COS_REGION,
    accessKeyId: COS_SECRET_ID,
    secretAccessKey: COS_SECRET_KEY,
  }
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
 * 如果提供了 versionDirPrefix，还会将当前版本的 changelog 额外写到版本目录下的 CHANGELOG.md。
 *
 * @param {object} opts
 * @param {S3Client} opts.s3
 * @param {string} opts.bucket
 * @param {string} opts.component - 'server' | 'web' | 'electron'
 * @param {string} opts.changelogsDir - 本地 changelogs 目录路径
 * @param {string} opts.publicUrl - R2 公共 URL
 * @param {string} [opts.versionDirPrefix] - 版本目录前缀（如 "desktop/0.1.1-beta.1"），
 *   若提供则把当前版本的 en.md（或 zh.md）额外写到 {versionDirPrefix}/CHANGELOG.md
 */
export async function uploadChangelogs({ s3, bucket, component, changelogsDir, publicUrl, versionDirPrefix }) {
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

  // 额外：把当前版本的 changelog 写到版本目录下的 CHANGELOG.md（仅 en.md 或第一个文件）
  if (versionDirPrefix && entries.length > 0) {
    // 找到版本目录对应的版本（取 prefix 中的版本号部分，如 "desktop/0.1.1-beta.1" → "0.1.1-beta.1"）
    const prefixVersion = versionDirPrefix.split('/').pop()
    const matchedEntry = entries.find((e) => e.version === prefixVersion)
    if (matchedEntry) {
      const versionDir = path.join(changelogsDir, prefixVersion)
      // 优先 en.md，其次第一个文件
      const preferredFile = matchedEntry.langs.includes('en') ? 'en.md'
        : matchedEntry.langs[0] ? `${matchedEntry.langs[0]}.md` : null
      if (preferredFile) {
        const filePath = path.join(versionDir, preferredFile)
        const content = readFileSync(filePath)
        const changelogKey = `${versionDirPrefix}/CHANGELOG.md`
        console.log(`   Uploading changelog to version dir: ${changelogKey}`)
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: changelogKey,
            Body: content,
            ContentType: 'text/markdown',
          })
        )
      }
    }
  }
}

/**
 * 为组件的 manifest 条目生成 changelogUrl（不含语言）。
 * 客户端拼接 /{lang}.md 获取对应语言版本。
 * 直接指向 GitHub raw content（公开仓库），无需额外上传到 R2。
 */
export function buildChangelogUrl(publicUrl, component, version) {
  return `https://raw.githubusercontent.com/OpenLoaf/OpenLoaf/main/apps/${component}/changelogs/${version}`
}

// ---------------------------------------------------------------------------
// 旧版本清理
// ---------------------------------------------------------------------------

/**
 * 列出 R2 bucket 中指定前缀下的所有对象 Key。
 */
async function listAllKeys(s3, bucket, prefix) {
  const keys = []
  let continuationToken
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return keys
}

/**
 * 批量删除 R2 对象（每批最多 1000 个）。
 */
async function deleteKeys(s3, bucket, keys) {
  const batchSize = 1000
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      })
    )
  }
}

/**
 * 从 R2 对象 Key 中提取版本号。
 * 支持两种结构：
 *   - 版本文件夹：desktop/0.2.3/OpenLoaf-0.2.3.dmg → "0.2.3"
 *   - 版本文件夹：server/0.2.3/server.mjs.gz → "0.2.3"
 *   - 旧平铺结构：desktop/OpenLoaf-0.2.3.dmg → "0.2.3"（向后兼容）
 * latest-*.yml 等根目录文件返回 null（不参与清理）。
 * @returns {string|null} 版本号，如 "0.2.3" 或 "0.3.0-beta.1"
 */
function extractVersionFromKey(key) {
  const parts = key.split('/')
  // 版本文件夹结构：prefix/X.Y.Z/filename → parts[1] 是版本号
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2]
    if (/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(candidate)) {
      return candidate
    }
  }
  // 旧平铺结构回退：从文件名提取
  // pre-release 标识以小写字母开头（beta、rc 等），平台名以大写开头（MacOS、Windows）
  const filename = parts.pop() ?? ''
  const match = filename.match(/^OpenLoaf-(\d+\.\d+\.\d+(?:-[a-z][a-zA-Z0-9.]*)?)/)
  return match ? match[1] : null
}

/**
 * 按语义化版本降序排序。
 * 正确处理 prerelease：0.2.4 > 0.2.4-beta.10 > 0.2.4-beta.9
 */
function compareVersionsDesc(a, b) {
  // 分离主版本号和 prerelease 部分
  const [aMain, aPre] = a.split('-', 2)
  const [bMain, bPre] = b.split('-', 2)

  // 比较主版本号（X.Y.Z）
  const aMainParts = aMain.split('.').map(Number)
  const bMainParts = bMain.split('.').map(Number)
  for (let i = 0; i < Math.max(aMainParts.length, bMainParts.length); i++) {
    const na = aMainParts[i] ?? 0
    const nb = bMainParts[i] ?? 0
    if (na !== nb) return nb - na
  }

  // 主版本号相同，比较 prerelease：
  // 无 prerelease（正式版）> 有 prerelease（如 beta.10）
  if (!aPre && bPre) return -1  // a 是正式版，排前面
  if (aPre && !bPre) return 1   // b 是正式版，排前面
  if (!aPre && !bPre) return 0

  // 都有 prerelease：逐段比较
  const aPreParts = aPre.split('.')
  const bPreParts = bPre.split('.')
  for (let i = 0; i < Math.max(aPreParts.length, bPreParts.length); i++) {
    const ap = aPreParts[i]
    const bp = bPreParts[i]
    if (ap === undefined && bp !== undefined) return 1  // 更短的 prerelease 排后面
    if (ap !== undefined && bp === undefined) return -1
    const an = Number(ap)
    const bn = Number(bp)
    // 都是数字：按数值比较
    if (!isNaN(an) && !isNaN(bn)) {
      if (an !== bn) return bn - an
      continue
    }
    // 字符串比较
    if (ap !== bp) return (bp ?? '').localeCompare(ap ?? '')
  }
  return 0
}

/**
 * 清理 R2 中旧版本文件，仅保留最近 N 个版本。
 * latest-*.yml 等非版本化文件不受影响。
 *
 * @param {object} opts
 * @param {S3Client} opts.s3 - S3 客户端
 * @param {string} opts.bucket - Bucket 名称
 * @param {string} opts.prefix - 对象前缀，如 "desktop/"
 * @param {number} [opts.keep=3] - 保留最近版本数
 */
export async function cleanupOldVersions({ s3, bucket, prefix, keep = 3 }) {
  console.log(`\n🧹 Cleaning up old versions in ${prefix} (keeping latest ${keep})...`)

  const allKeys = await listAllKeys(s3, bucket, prefix)

  // 按版本号分组
  /** @type {Map<string, string[]>} */
  const versionMap = new Map()
  for (const key of allKeys) {
    const ver = extractVersionFromKey(key)
    if (!ver) continue // latest-*.yml 等跳过
    if (!versionMap.has(ver)) versionMap.set(ver, [])
    versionMap.get(ver).push(key)
  }

  const sortedVersions = [...versionMap.keys()].sort(compareVersionsDesc)
  console.log(`   Found ${sortedVersions.length} version(s): ${sortedVersions.join(', ')}`)

  if (sortedVersions.length <= keep) {
    console.log(`   Nothing to clean up (${sortedVersions.length} <= ${keep})`)
    return
  }

  const toRemoveVersions = sortedVersions.slice(keep)
  const keysToDelete = toRemoveVersions.flatMap((ver) => versionMap.get(ver) ?? [])

  console.log(`   Removing ${toRemoveVersions.length} old version(s): ${toRemoveVersions.join(', ')}`)
  console.log(`   Deleting ${keysToDelete.length} file(s)...`)

  await deleteKeys(s3, bucket, keysToDelete)
  console.log(`   Done.`)
}
