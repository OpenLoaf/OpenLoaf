#!/usr/bin/env node

/**
 * R2 → COS 同步脚本：将 R2 中最新版本的内容同步到腾讯云 COS。
 *
 * 默认只同步最新版本（从 stable/manifest.json 读取版本号）+ 可变文件。
 * 使用 --all 同步所有版本，--force 全量覆盖。
 *
 * 用法：
 *   node scripts/sync-r2-to-cos.mjs                        # 同步 stable + beta 最新版本（增量）
 *   node scripts/sync-r2-to-cos.mjs --channel=stable       # 仅同步 stable 渠道最新版本
 *   node scripts/sync-r2-to-cos.mjs --channel=beta         # 仅同步 beta 渠道最新版本
 *   node scripts/sync-r2-to-cos.mjs --all                  # 同步所有版本（增量）
 *   node scripts/sync-r2-to-cos.mjs --dry-run              # 仅列出待同步文件，不实际传输
 *   node scripts/sync-r2-to-cos.mjs --prefix=desktop/      # 仅同步 desktop 目录
 *   node scripts/sync-r2-to-cos.mjs --force                # 全量覆盖（忽略已存在）
 *   node scripts/sync-r2-to-cos.mjs --concurrency=5        # 5 个并发（默认 3）
 *
 * 配置来自 apps/desktop/.env.prod（需同时包含 R2_* 和 COS_* 变量）
 *
 * 首次运行前：
 *   cd scripts/shared && npm init -y && npm install @aws-sdk/client-s3
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import cliProgress from 'cli-progress'
import {
  loadEnvFile,
  validateR2Config,
  validateCosConfig,
  createS3Client,
  createCosS3Client,
  downloadJson,
} from './shared/publishUtils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 加载环境变量
// ---------------------------------------------------------------------------

loadEnvFile(path.join(rootDir, 'apps', 'desktop', '.env.prod'))

// ---------------------------------------------------------------------------
// 解析 CLI 参数
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const forceAll = args.includes('--force')
const syncAll = args.includes('--all')
const channelArg = args.find((a) => a.startsWith('--channel='))
const channel = channelArg ? channelArg.split('=')[1] : null // null = 两个渠道都读
const prefixArg = args.find((a) => a.startsWith('--prefix='))
const prefix = prefixArg ? prefixArg.split('=')[1] : ''
const concurrencyArg = args.find((a) => a.startsWith('--concurrency='))
const concurrency = concurrencyArg ? Math.max(1, parseInt(concurrencyArg.split('=')[1], 10)) : 3

// ---------------------------------------------------------------------------
// 校验配置
// ---------------------------------------------------------------------------

const r2Config = validateR2Config()
const r2 = createS3Client(r2Config)

const cosConfig = validateCosConfig()
if (!cosConfig) {
  console.error('❌ COS 配置不完整，请在 apps/desktop/.env.prod 中设置 COS_* 变量：')
  console.error('   COS_BUCKET, COS_ENDPOINT, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY')
  process.exit(1)
}
const cos = createCosS3Client(cosConfig)

console.log(`📡 R2:  ${r2Config.bucket}`)
console.log(`☁️  COS: ${cosConfig.bucket}`)

// ---------------------------------------------------------------------------
// 可变文件判断
// ---------------------------------------------------------------------------

/**
 * 判断一个 key 是否是可变文件（每次发布都会更新）。
 *
 * 可变文件（增量模式下也总是覆盖）：
 *   - stable/manifest.json, beta/manifest.json — 渠道指针，每次发布都更新
 *   - desktop/latest-*.yml, desktop/latest.yml — 根目录向后兼容，promote 时更新
 *   - desktop/stable/latest-*.yml, desktop/beta/latest-*.yml — 渠道目录，每次发布更新
 *
 * 不可变文件（版本目录内产物，写入后永远不变）：
 *   - desktop/{version}/...（安装包、manifest、changelog、yml）
 *   - server/{version}/server.mjs.gz
 *   - web/{version}/web.tar.gz
 */
function isMutable(key) {
  // 渠道级 manifest
  if (/^(stable|beta)\/manifest\.json$/.test(key)) return true

  // desktop 根目录或渠道目录（stable/ / beta/）下的 latest-*.yml
  // 注意：版本目录（如 desktop/0.1.1-beta.1/latest-mac.yml）不匹配
  if (/^desktop\/(stable\/|beta\/)?latest(-[a-z0-9-]+)?\.yml$/.test(key)) return true

  return false
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

async function listAllObjects(s3, bucket, pfx) {
  const objects = []
  let continuationToken
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: pfx,
        ContinuationToken: continuationToken,
      })
    )
    for (const obj of res.Contents ?? []) {
      objects.push({ key: obj.Key, size: obj.Size })
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

async function existsInCos(key) {
  try {
    await cos.send(new HeadObjectCommand({ Bucket: cosConfig.bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

const tmpDir = '/tmp/openloaf-r2-cos-sync'
fs.mkdirSync(tmpDir, { recursive: true })

/**
 * 获取本地缓存路径
 */
function getCachePath(key) {
  return path.join(tmpDir, key)
}

/**
 * 检查本地缓存是否存在且大小匹配
 */
function hasCachedFile(key, expectedSize) {
  const localPath = getCachePath(key)
  try {
    const stat = fs.statSync(localPath)
    return expectedSize != null ? stat.size === expectedSize : stat.size > 0
  } catch {
    return false
  }
}

/**
 * 流式下载到本地缓存，通过 fileBar 显示进度。返回 { localPath, size, downloadMs }
 */
async function downloadToCache(key, expectedSize, fileBar, totalBar) {
  const localPath = getCachePath(key)
  fs.mkdirSync(path.dirname(localPath), { recursive: true })

  const res = await r2.send(new GetObjectCommand({ Bucket: r2Config.bucket, Key: key }))
  const totalSize = expectedSize || res.ContentLength || 0
  let received = 0
  const t0 = Date.now()
  const ws = fs.createWriteStream(localPath)

  if (fileBar && totalSize > 0) fileBar.setTotal(totalSize)

  for await (const chunk of res.Body) {
    ws.write(chunk)
    received += chunk.length
    if (fileBar) {
      const elapsed = Date.now() - t0
      fileBar.update(received, { speed: `↓ ${formatSpeed(received, elapsed, 10)}`, filename: path.basename(key) })
    }
    // 实时更新总进度（下载部分）
    if (totalBar) totalBar.increment(chunk.length)
  }

  await new Promise((resolve, reject) => {
    ws.end(() => resolve())
    ws.on('error', reject)
  })

  const downloadMs = Date.now() - t0
  return { localPath, size: received, downloadMs }
}

/**
 * 上传本地文件到 COS。返回 { uploadMs }
 * 注：S3 PutObject 无字节级回调，进度条显示 spinning 动画 + 已耗时，完成后显示速度。
 */
async function uploadFromCache(key, localPath, fileBar) {
  const buffer = fs.readFileSync(localPath)
  const totalSize = buffer.length
  const t0 = Date.now()
  const fname = path.basename(key)
  const spinner = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
  let tick = 0

  if (fileBar) {
    fileBar.setTotal(1)
    fileBar.update(0, { speed: `↑ uploading...`, filename: fname })
  }

  const timer = setInterval(() => {
    if (fileBar) {
      const elapsed = Date.now() - t0
      const s = spinner[tick++ % spinner.length]
      fileBar.update(0, { speed: `↑ ${s} ${formatSize(totalSize)} ${formatDuration(elapsed)}`, filename: fname })
    }
  }, 100)

  try {
    await cos.send(
      new PutObjectCommand({
        Bucket: cosConfig.bucket,
        Key: key,
        Body: buffer,
        ContentLength: totalSize,
      })
    )
  } finally {
    clearInterval(timer)
  }

  const uploadMs = Date.now() - t0
  if (fileBar) {
    fileBar.setTotal(totalSize)
    fileBar.update(totalSize, { speed: `↑ ${formatSpeed(totalSize, uploadMs, 10)}`, filename: fname })
  }

  return { uploadMs }
}

/**
 * 同步单个文件，返回 { size, downloadMs, uploadMs, cached }
 */
async function syncObject(key, expectedSize, { multibar, totalBar, fileBar }) {
  let size
  let downloadMs = 0
  const cached = hasCachedFile(key, expectedSize)

  if (cached) {
    size = expectedSize ?? fs.statSync(getCachePath(key)).size
    if (fileBar) fileBar.update(0, { speed: '↓ cached', filename: path.basename(key) })
    // cached 文件跳过下载，直接把下载那一半加到总进度
    if (totalBar) totalBar.increment(size)
  } else {
    // downloadToCache 内部会实时 increment totalBar（下载那一半）
    const dl = await downloadToCache(key, expectedSize, fileBar, totalBar)
    size = dl.size
    downloadMs = dl.downloadMs
  }

  const localPath = getCachePath(key)
  const { uploadMs } = await uploadFromCache(key, localPath, fileBar)

  // 上传完成，加上传那一半到总进度
  if (totalBar) totalBar.increment(size)

  return { size, downloadMs, uploadMs, cached }
}

function formatSize(bytes, pad = 0) {
  let s
  if (bytes == null) s = '? B'
  else if (bytes < 1024) s = `${bytes} B`
  else if (bytes < 1024 * 1024) s = `${(bytes / 1024).toFixed(1)} KB`
  else if (bytes < 1024 * 1024 * 1024) s = `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  else s = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  return pad > 0 ? s.padStart(pad) : s
}

function formatSpeed(bytes, ms, pad = 0) {
  let s
  if (!ms || ms <= 0) s = '   -- MB/s'
  else {
    const speed = bytes / (ms / 1000)
    if (speed < 1024) s = `${speed.toFixed(0)} B/s`
    else if (speed < 1024 * 1024) s = `${(speed / 1024).toFixed(1)} KB/s`
    else s = `${(speed / (1024 * 1024)).toFixed(2)} MB/s`
  }
  return pad > 0 ? s.padStart(pad) : s
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60000)
  const sec = Math.round((ms % 60000) / 1000)
  return `${min}m${sec}s`
}


// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  // -----------------------------------------------------------------------
  // 读取最新版本号（除非 --all）
  // -----------------------------------------------------------------------
  let latestVersions = null // { component: [ver1, ver2, ...] } 或 null 表示同步全部
  if (!syncAll) {
    console.log('\n📖 Reading manifests for latest versions...')
    latestVersions = {}

    // 读取渠道 manifest（默认两个都读，--channel 可指定单个）
    const channels = channel ? [channel] : ['stable', 'beta']
    for (const ch of channels) {
      const manifestKey = `${ch}/manifest.json`
      try {
        const manifest = await downloadJson(r2, r2Config.bucket, manifestKey)
        for (const [component, info] of Object.entries(manifest)) {
          if (component === 'schemaVersion' || component === 'electron') continue
          const ver = typeof info === 'string' ? info : info?.version
          if (!ver) continue
          if (!latestVersions[component]) latestVersions[component] = []
          if (!latestVersions[component].includes(ver)) {
            latestVersions[component].push(ver)
          }
        }
        console.log(`   ${ch}: ${JSON.stringify(manifest)}`)
      } catch (err) {
        console.log(`   ${ch}: (failed: ${err.message})`)
      }
    }

    // desktop promote 后 stable manifest 写纯版本号（如 0.2.4），
    // 但安装包在 beta 目录（如 desktop/0.2.4-beta.3/）。
    // 读取 redirect manifest 找到实际目录。
    for (const ver of latestVersions.desktop ?? []) {
      try {
        const redirectManifest = await downloadJson(r2, r2Config.bucket, `desktop/${ver}/manifest.json`)
        if (redirectManifest.redirectTo && !latestVersions.desktop.includes(redirectManifest.redirectTo)) {
          console.log(`   Desktop redirect: ${ver} → ${redirectManifest.redirectTo}`)
          latestVersions.desktop.push(redirectManifest.redirectTo)
        }
      } catch {
        // 无 redirect
      }
    }

    console.log('   Versions to sync:', JSON.stringify(latestVersions))
  }

  console.log(`\n📋 Listing R2 objects${prefix ? ` (prefix: ${prefix})` : ''}...`)
  let r2Objects = await listAllObjects(r2, r2Config.bucket, prefix)
  console.log(`   Found ${r2Objects.length} object(s)`)

  // 只保留最新版本的文件 + 可变文件 + 渠道目录
  if (latestVersions) {
    const versionPrefixes = []
    for (const [component, versions] of Object.entries(latestVersions)) {
      for (const ver of versions) {
        versionPrefixes.push(`${component}/${ver}/`)
      }
    }
    // desktop 的渠道目录（desktop/stable/、desktop/beta/）包含 latest-*.yml 和安装包引用
    const channelDirPrefixes = ['desktop/stable/', 'desktop/beta/']
    // changelogs 目录也需要同步
    const extraPrefixes = [...channelDirPrefixes, 'changelogs/']

    const before = r2Objects.length
    r2Objects = r2Objects.filter((obj) => {
      if (isMutable(obj.key)) return true
      if (versionPrefixes.some((vp) => obj.key.startsWith(vp))) return true
      if (extraPrefixes.some((ep) => obj.key.startsWith(ep))) return true
      return false
    })
    console.log(`   Filtered to ${r2Objects.length} object(s) for latest version (was ${before})`)
  }

  if (r2Objects.length === 0) {
    console.log('   Nothing to sync.')
    return
  }

  // 确定需要同步的文件
  let toSync
  if (forceAll) {
    toSync = r2Objects
    console.log(`\n🔄 Force mode: will sync all ${toSync.length} object(s)`)
  } else {
    console.log('\n🔍 Checking COS for existing objects...')
    toSync = []
    let checked = 0
    let mutableCount = 0
    for (const obj of r2Objects) {
      checked++
      process.stdout.write(`\r   Checking ${checked}/${r2Objects.length}...`)
      // 可变文件（manifest.json、latest-*.yml）总是覆盖，无需检查 COS 是否存在
      if (isMutable(obj.key)) {
        toSync.push(obj)
        mutableCount++
        continue
      }
      const exists = await existsInCos(obj.key)
      if (!exists) toSync.push(obj)
    }
    const newCount = toSync.length - mutableCount
    const skipCount = r2Objects.length - toSync.length
    console.log(
      `\r   ${mutableCount} mutable (always overwrite), ${newCount} new, ${skipCount} already exist          `
    )
  }

  if (toSync.length === 0) {
    console.log('\n✅ COS is already up to date!')
    return
  }

  const totalSize = toSync.reduce((s, o) => s + (o.size ?? 0), 0)
  console.log(`\n📦 Files to sync (${toSync.length}, ${formatSize(totalSize)}):`)
  for (const obj of toSync) {
    console.log(`   ${obj.key}  (${formatSize(obj.size)})`)
  }

  if (dryRun) {
    console.log('\n⏭️  Dry run mode — no files transferred.')
    return
  }

  console.log(`\n🚀 Syncing R2 → COS ... (concurrency: ${concurrency})\n`)

  const fileBarFormat = (options, params, payload) => {
    const bar = options.barCompleteString.substring(0, Math.round(params.progress * options.barsize))
      + options.barIncompleteString.substring(0, Math.round((1 - params.progress) * options.barsize))
    const pct = `${Math.round(params.progress * 100)}%`.padStart(4)
    const val = formatSize(params.value, 10)
    const tot = formatSize(params.total, 10)
    const spd = (payload.speed || '').padEnd(20)
    const name = payload.filename || ''
    return ` ${bar} ${pct} | ${val}/${tot} | ${spd} | ${name}`
  }

  const totalBarFormat = (options, params, payload) => {
    const bar = options.barCompleteString.substring(0, Math.round(params.progress * options.barsize))
      + options.barIncompleteString.substring(0, Math.round((1 - params.progress) * options.barsize))
    const pct = `${Math.round(params.progress * 100)}%`.padStart(4)
    // totalBar 的 total 是 totalSize×2，显示时除以 2
    const val = formatSize(Math.round(params.value / 2), 10)
    const tot = formatSize(Math.round(params.total / 2), 10)
    const spd = (payload.speed || '').padEnd(20)
    const name = payload.filename || ''
    return ` ${bar} ${pct} | ${val}/${tot} | ${spd} | ${name}`
  }

  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    barCompleteChar: '█',
    barIncompleteChar: '░',
    barsize: 25,
    format: fileBarFormat,
  }, cliProgress.Presets.shades_classic)

  // 总进度 = totalSize×2（下载一半 + 上传一半），下载实时 increment，上传完成后 increment
  const totalBar = multibar.create(totalSize * 2, 0, { filename: 'Total', speed: '' })
  totalBar.options.format = totalBarFormat

  let synced = 0
  let failCount = 0
  let transferredBytes = 0
  let completed = 0
  const syncStartTime = Date.now()

  // 并发执行：维护一个 worker pool，每个文件按需创建 fileBar
  let nextIdx = 0
  const workers = Array.from({ length: Math.min(concurrency, toSync.length) }, () => {
    return (async () => {
      while (true) {
        const i = nextIdx++
        if (i >= toSync.length) break

        const obj = toSync[i]
        const idx = i + 1

        // 按需创建 fileBar，完成后移除
        const fileBar = multibar.create(obj.size || 1, 0, {
          filename: path.basename(obj.key),
          speed: 'starting...',
        })

        multibar.log(`   [${idx}/${toSync.length}] ${obj.key} (${formatSize(obj.size)})\n`)

        try {
          const { size, downloadMs, uploadMs, cached } = await syncObject(obj.key, obj.size, { multibar, totalBar, fileBar })
          synced++
          transferredBytes += size
          completed++

          const elapsed = Date.now() - syncStartTime
          const eta = completed < toSync.length
            ? formatDuration((elapsed / completed) * (toSync.length - completed))
            : '0s'

          const dlInfo = cached ? 'cached' : `↓${formatSpeed(size, downloadMs)}(${formatDuration(downloadMs)})`
          const ulInfo = `↑${formatSpeed(size, uploadMs)}(${formatDuration(uploadMs)})`
          multibar.log(`      ✅ ${dlInfo} ${ulInfo}  ETA ${eta}\n`)

          totalBar.increment(0, { speed: `avg ${formatSpeed(transferredBytes, elapsed)}`, filename: `Total [${completed}/${toSync.length}]` })
        } catch (err) {
          failCount++
          completed++
          multibar.log(`      ❌ ${obj.key}: ${err.message ?? err}\n`)
        }

        multibar.remove(fileBar)
      }
    })()
  })

  await Promise.all(workers)
  multibar.stop()

  const totalElapsed = Date.now() - syncStartTime
  const avgSpeed = formatSpeed(transferredBytes, totalElapsed)

  console.log(`\n🎉 Done! Synced ${synced} file(s) (${formatSize(transferredBytes)}) in ${formatDuration(totalElapsed)}, avg ${avgSpeed}${failCount > 0 ? `, ${failCount} failed` : ''}`)
  console.log(`📂 本地缓存目录: ${tmpDir}`)

  // 显示 COS 下载地址
  if (cosConfig.publicUrl) {
    console.log(`\n🔗 COS 下载地址:`)
    for (const obj of toSync) {
      console.log(`   ${cosConfig.publicUrl}/${obj.key}`)
    }
  }

  if (failCount > 0) process.exit(1)
}

main().catch((err) => {
  console.error('❌ Sync failed:', err)
  process.exit(1)
})
