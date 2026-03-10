/**
 * 从 R2 中删除指定版本的 server/web 构件，并回滚 manifest 到上一版本。
 *
 * 用法:
 *   node scripts/cleanup-r2-version.mjs --server=0.2.9-beta.3 --web=0.2.9-beta.4
 *   node scripts/cleanup-r2-version.mjs --server=0.2.9-beta.3
 *   node scripts/cleanup-r2-version.mjs --web=0.2.9-beta.4
 *   node scripts/cleanup-r2-version.mjs --server=0.2.9-beta.3 --web=0.2.9-beta.4 --dry-run
 */

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  loadEnvFile,
  validateR2Config,
  createS3Client,
  downloadJson,
  uploadJson,
} from './shared/publishUtils.mjs'
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

function getArg(name) {
  for (const arg of args) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`))
    if (match) return match[1]
  }
  return null
}

const serverVersion = getArg('server')
const webVersion = getArg('web')
const dryRun = args.includes('--dry-run')

if (!serverVersion && !webVersion) {
  console.error('用法: node scripts/cleanup-r2-version.mjs --server=VERSION --web=VERSION [--dry-run]')
  console.error('示例: node scripts/cleanup-r2-version.mjs --server=0.2.9-beta.3 --web=0.2.9-beta.4')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 初始化 R2 客户端
// ---------------------------------------------------------------------------

loadEnvFile(path.join(rootDir, 'apps/server/.env.prod'))
loadEnvFile(path.join(rootDir, 'apps/desktop/.env.prod'))

const r2Config = validateR2Config()
const s3 = createS3Client(r2Config)
const bucket = r2Config.bucket

// ---------------------------------------------------------------------------
// R2 操作工具
// ---------------------------------------------------------------------------

async function listKeys(prefix) {
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

async function deleteKeys(keys) {
  if (keys.length === 0) return
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

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function cleanupVersion(component, version) {
  const prefix = `${component}/${version}/`
  console.log(`\n🔍 查找 R2 中 ${prefix} 的文件...`)

  const keys = await listKeys(prefix)
  if (keys.length === 0) {
    console.log(`   ⚠️  未找到任何文件，可能已被删除或版本号有误`)
    return
  }

  console.log(`   找到 ${keys.length} 个文件:`)
  keys.forEach(key => console.log(`     - ${key}`))

  if (dryRun) {
    console.log(`   [dry-run] 跳过删除`)
    return
  }

  console.log(`   🗑️  删除中...`)
  await deleteKeys(keys)
  console.log(`   ✅ 已删除 ${keys.length} 个文件`)
}

async function rollbackManifest(component, version) {
  const channels = ['beta', 'stable']

  for (const channel of channels) {
    const manifestKey = `${channel}/manifest.json`
    console.log(`\n🔍 检查 ${manifestKey} 中的 ${component} 版本...`)

    let manifest
    try {
      manifest = await downloadJson(s3, bucket, manifestKey)
    } catch {
      console.log(`   ⚠️  ${manifestKey} 不存在，跳过`)
      continue
    }

    const entry = manifest[component]
    if (!entry) {
      console.log(`   ⚠️  ${manifestKey} 中无 ${component} 条目，跳过`)
      continue
    }

    if (entry.version !== version) {
      console.log(`   ℹ️  当前版本是 ${entry.version}，不是 ${version}，无需回滚`)
      continue
    }

    console.log(`   ⚠️  当前版本匹配 ${version}，需要回滚`)
    console.log(`   当前 ${component} 条目:`)
    console.log(`     ${JSON.stringify(entry, null, 2).split('\n').join('\n     ')}`)

    if (dryRun) {
      console.log(`   [dry-run] 跳过 manifest 回滚`)
      continue
    }

    // 删除该 component 的条目（让客户端跳过该组件的更新检查）
    delete manifest[component]
    await uploadJson(s3, bucket, manifestKey, manifest)
    console.log(`   ✅ 已从 ${manifestKey} 中移除 ${component} 条目`)
  }
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

console.log('═══════════════════════════════════════════════════')
console.log('  R2 版本清理工具')
console.log('═══════════════════════════════════════════════════')
if (serverVersion) console.log(`  Server: ${serverVersion}`)
if (webVersion) console.log(`  Web:    ${webVersion}`)
if (dryRun) console.log(`  模式:   dry-run（仅预览，不执行删除）`)
console.log('═══════════════════════════════════════════════════')

try {
  // 1. 删除构件文件
  if (serverVersion) await cleanupVersion('server', serverVersion)
  if (webVersion) await cleanupVersion('web', webVersion)

  // 2. 回滚 manifest
  if (serverVersion) await rollbackManifest('server', serverVersion)
  if (webVersion) await rollbackManifest('web', webVersion)

  console.log('\n✅ 清理完成！')

  console.log('\n📋 后续操作（如需要）:')
  const tags = []
  if (serverVersion) tags.push(`server-v${serverVersion}`)
  if (webVersion) tags.push(`web-v${webVersion}`)
  console.log(`  # 删除 git tag`)
  console.log(`  git push origin ${tags.map(t => `:refs/tags/${t}`).join(' ')}`)
  console.log(`  git tag -d ${tags.join(' ')}`)
} catch (error) {
  console.error('\n❌ 清理失败:', error.message)
  process.exit(1)
}
