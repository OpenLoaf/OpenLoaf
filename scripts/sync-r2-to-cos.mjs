#!/usr/bin/env node

/**
 * R2 → COS 同步脚本：将 R2 中的内容同步到腾讯云 COS。
 *
 * 默认增量同步（跳过 COS 中已存在的文件），--force 全量覆盖。
 *
 * 用法：
 *   node scripts/sync-r2-to-cos.mjs                        # 增量同步所有内容
 *   node scripts/sync-r2-to-cos.mjs --dry-run              # 仅列出待同步文件，不实际传输
 *   node scripts/sync-r2-to-cos.mjs --prefix=desktop/      # 仅同步 desktop 目录
 *   node scripts/sync-r2-to-cos.mjs --force                # 全量覆盖（忽略已存在）
 *
 * 配置来自 apps/desktop/.env.prod（需同时包含 R2_* 和 COS_* 变量）
 *
 * 首次运行前：
 *   cd scripts/shared && npm init -y && npm install @aws-sdk/client-s3
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import {
  loadEnvFile,
  validateR2Config,
  validateCosConfig,
  createS3Client,
  createCosS3Client,
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
const prefixArg = args.find((a) => a.startsWith('--prefix='))
const prefix = prefixArg ? prefixArg.split('=')[1] : ''

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

async function syncObject(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: r2Config.bucket, Key: key }))
  const body = await res.Body.transformToByteArray()
  await cos.send(
    new PutObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: res.ContentType,
    })
  )
}

function formatSize(bytes) {
  if (bytes == null) return '? B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n📋 Listing R2 objects${prefix ? ` (prefix: ${prefix})` : ''}...`)
  const r2Objects = await listAllObjects(r2, r2Config.bucket, prefix)
  console.log(`   Found ${r2Objects.length} object(s)`)

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
    for (const obj of r2Objects) {
      checked++
      process.stdout.write(`\r   Checking ${checked}/${r2Objects.length}...`)
      const exists = await existsInCos(obj.key)
      if (!exists) toSync.push(obj)
    }
    console.log(
      `\r   ${toSync.length} new, ${r2Objects.length - toSync.length} already exist          `
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

  console.log('\n🚀 Syncing R2 → COS ...')
  let synced = 0
  let failCount = 0
  for (const obj of toSync) {
    const label = `[${synced + failCount + 1}/${toSync.length}]`
    process.stdout.write(`   ${label} ${obj.key} (${formatSize(obj.size)})...`)
    try {
      await syncObject(obj.key)
      synced++
      console.log(' ✅')
    } catch (err) {
      failCount++
      console.log(` ❌ ${err.message ?? err}`)
    }
  }

  console.log(`\n🎉 Done! Synced ${synced} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}.`)
  if (failCount > 0) process.exit(1)
}

main().catch((err) => {
  console.error('❌ Sync failed:', err)
  process.exit(1)
})
