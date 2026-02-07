#!/usr/bin/env node

/**
 * Server 增量更新发布脚本：
 * 1. 运行 build-prod.mjs 构建 server.mjs
 * 2. gzip 压缩
 * 3. 计算 SHA-256
 * 4. 上传到 Cloudflare R2
 * 5. 更新 ${channel}/manifest.json
 * 6. 上传 changelogs
 *
 * 用法：
 *   node scripts/publish-update.mjs                   # 自动检测渠道
 *   node scripts/publish-update.mjs --channel=beta    # 强制 beta 渠道
 *   node scripts/publish-update.mjs --channel=stable  # 强制 stable 渠道
 *
 * 配置来自 apps/server/.env.prod（自动加载，命令行环境变量优先）
 */

import { createReadStream, createWriteStream, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { execSync } from 'node:child_process'
import {
  loadEnvFile,
  validateR2Config,
  createS3Client,
  uploadFile,
  downloadJson,
  uploadJson,
  computeSha256,
  resolveChannel,
  uploadChangelogs,
  buildChangelogUrl,
} from '../../../scripts/shared/publishUtils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serverRoot = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 自动加载 .env.prod
// ---------------------------------------------------------------------------

loadEnvFile(path.join(serverRoot, '.env.prod'))

// ---------------------------------------------------------------------------
// 配置校验
// ---------------------------------------------------------------------------

const r2Config = validateR2Config()
const s3 = createS3Client(r2Config)

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

async function gzipFile(srcPath, destPath) {
  const src = createReadStream(srcPath)
  const gzip = createGzip({ level: 9 })
  const dest = createWriteStream(destPath)
  await pipeline(src, gzip, dest)
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  // 1. 读取版本号
  const pkg = JSON.parse(readFileSync(path.join(serverRoot, 'package.json'), 'utf-8'))
  const version = pkg.version
  if (!version) {
    console.error('❌ package.json 缺少 version 字段。请先执行 npm version patch')
    process.exit(1)
  }

  // 解析渠道
  const channel = resolveChannel(process.argv.slice(2), version)
  console.log(`📦 Server version: ${version}`)
  console.log(`📡 Channel: ${channel}`)

  // 2. 构建
  console.log('🔨 Building server...')
  execSync('node scripts/build-prod.mjs', { cwd: serverRoot, stdio: 'inherit' })

  const serverMjsPath = path.join(serverRoot, 'dist', 'server.mjs')
  if (!existsSync(serverMjsPath)) {
    console.error('❌ 构建产物 dist/server.mjs 不存在')
    process.exit(1)
  }

  // 3. gzip 压缩
  const gzPath = path.join(serverRoot, 'dist', 'server.mjs.gz')
  console.log('📝 Compressing with gzip...')
  await gzipFile(serverMjsPath, gzPath)

  // 4. 计算 SHA-256
  const sha256 = await computeSha256(gzPath)
  const size = statSync(gzPath).size
  console.log(`✅ SHA-256: ${sha256}`)
  console.log(`✅ Size: ${(size / 1024 / 1024).toFixed(2)} MB`)

  // 5. 上传到 R2（共享构件池，不分渠道）
  const r2Key = `server/${version}/server.mjs.gz`
  console.log(`☁️  Uploading to R2: ${r2Key}`)
  await uploadFile(s3, r2Config.bucket, r2Key, gzPath)

  // 6. 更新 ${channel}/manifest.json
  const manifestKey = `${channel}/manifest.json`
  console.log(`📋 Updating ${manifestKey}...`)
  let manifest = { schemaVersion: 1 }
  try {
    manifest = await downloadJson(s3, r2Config.bucket, manifestKey)
  } catch {
    console.log('   (No existing manifest found, creating new one)')
  }

  const updatedAt = new Date().toISOString()
  const changelogUrl = buildChangelogUrl(r2Config.publicUrl, 'server', version)
  manifest.server = {
    version,
    url: `${r2Config.publicUrl}/${r2Key}`,
    sha256,
    size,
    updatedAt,
    changelogUrl,
  }

  await uploadJson(s3, r2Config.bucket, manifestKey, manifest)

  // 7. 上传 changelogs
  console.log('📝 Uploading changelogs...')
  await uploadChangelogs({
    s3,
    bucket: r2Config.bucket,
    component: 'server',
    changelogsDir: path.join(serverRoot, 'changelogs'),
    publicUrl: r2Config.publicUrl,
  })

  console.log(`\n🎉 Server v${version} published to ${channel} successfully!`)
  console.log(`   URL: ${r2Config.publicUrl}/${r2Key}`)
}

main().catch((err) => {
  console.error('❌ Publish failed:', err)
  process.exit(1)
})
