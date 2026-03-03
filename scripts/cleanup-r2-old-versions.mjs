#!/usr/bin/env node

/**
 * R2 旧版本清理脚本（一次性手动执行）
 *
 * 用法：
 *   node scripts/cleanup-r2-old-versions.mjs --keep-from=0.2.4 [--dry-run]
 *
 * 示例：
 *   # 预览：列出将被删除的版本（不实际删除）
 *   node scripts/cleanup-r2-old-versions.mjs --keep-from=0.2.4 --dry-run
 *
 *   # 实际删除 0.2.4 之前的所有版本
 *   node scripts/cleanup-r2-old-versions.mjs --keep-from=0.2.4
 *
 * 环境变量来自 apps/desktop/.env.prod（或 .env.local）
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { loadEnvFile, validateR2Config } from './shared/publishUtils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnvFile(path.join(__dirname, '../apps/desktop/.env.prod'))
loadEnvFile(path.join(__dirname, '../.env.local'))

const r2Config = validateR2Config()
const s3 = new S3Client({
  region: 'auto',
  endpoint: r2Config.endpoint,
  credentials: { accessKeyId: r2Config.accessKeyId, secretAccessKey: r2Config.secretAccessKey },
})

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const keepFromArg = args.find((a) => a.startsWith('--keep-from='))?.split('=')[1]

if (!keepFromArg) {
  console.error('❌ 请指定 --keep-from=<version>（如 --keep-from=0.2.4）')
  process.exit(1)
}

console.log(`🔍 Scanning R2 bucket: ${r2Config.bucket}`)
console.log(`📌 Keep versions >= ${keepFromArg}`)
if (dryRun) console.log('🧪 DRY RUN mode: no actual deletion')
console.log()

/**
 * 列出指定前缀下的所有对象
 */
async function listAllKeys(prefix) {
  const keys = []
  let continuationToken
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: r2Config.bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return keys
}

/**
 * 批量删除
 */
async function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000)
    await s3.send(new DeleteObjectsCommand({
      Bucket: r2Config.bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })) },
    }))
    console.log(`   Deleted batch of ${batch.length} objects`)
  }
}

/**
 * 语义化版本比较：返回 true 表示 a >= b
 */
function versionGte(a, b) {
  const normalize = (v) => v.split(/[.-]/).map((s) => {
    const n = parseInt(s, 10)
    return isNaN(n) ? s : n
  })
  const pa = normalize(a)
  const pb = normalize(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (typeof na === 'number' && typeof nb === 'number') {
      if (na !== nb) return na > nb
    } else {
      const sa = String(na)
      const sb = String(nb)
      if (sa !== sb) return sa > sb
    }
  }
  return true // equal
}

/**
 * 从 R2 key 中提取版本号（适用于 desktop/ 和 server/、web/ 目录）
 */
function extractVersion(key) {
  const parts = key.split('/')
  if (parts.length >= 3) {
    const candidate = parts[1]
    if (/^\d+\.\d+\.\d+/.test(candidate)) return candidate
  }
  return null
}

async function main() {
  // 扫描 desktop/、server/、web/ 下的版本目录
  const prefixes = ['desktop/', 'server/', 'web/']
  const toDelete = []
  const summary = {}

  for (const prefix of prefixes) {
    const allKeys = await listAllKeys(prefix)
    const versionMap = new Map()

    for (const key of allKeys) {
      const ver = extractVersion(key)
      if (!ver) continue
      if (!versionMap.has(ver)) versionMap.set(ver, [])
      versionMap.get(ver).push(key)
    }

    const versions = [...versionMap.keys()].sort()
    const toDeleteVersions = versions.filter((v) => !versionGte(v, keepFromArg))
    const toKeepVersions = versions.filter((v) => versionGte(v, keepFromArg))

    console.log(`📁 ${prefix}`)
    console.log(`   Keep (>= ${keepFromArg}): ${toKeepVersions.join(', ') || '(none)'}`)
    console.log(`   Delete (< ${keepFromArg}): ${toDeleteVersions.join(', ') || '(none)'}`)

    const keysToDelete = toDeleteVersions.flatMap((v) => versionMap.get(v) ?? [])
    toDelete.push(...keysToDelete)
    summary[prefix] = { toDelete: toDeleteVersions, toKeep: toKeepVersions, fileCount: keysToDelete.length }
    console.log()
  }

  console.log('─'.repeat(60))
  console.log(`Total files to delete: ${toDelete.length}`)
  console.log()

  if (toDelete.length === 0) {
    console.log('✅ Nothing to delete.')
    return
  }

  if (dryRun) {
    console.log('🧪 DRY RUN: would delete the following files:')
    toDelete.slice(0, 20).forEach((k) => console.log(`   - ${k}`))
    if (toDelete.length > 20) console.log(`   ... and ${toDelete.length - 20} more`)
    return
  }

  console.log('🗑️  Deleting...')
  await deleteKeys(toDelete)
  console.log(`\n✅ Done. Deleted ${toDelete.length} files from R2.`)
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
