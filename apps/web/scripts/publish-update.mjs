#!/usr/bin/env node

/**
 * Web 增量更新发布脚本：
 * 1. 运行 next build 构建静态导出
 * 2. tar.gz 压缩 out/ 目录
 * 3. 计算 SHA-256
 * 4. 上传到 Cloudflare R2
 * 5. 更新 ${channel}/manifest.json
 *
 * 用法：
 *   node scripts/publish-update.mjs                   # 自动检测渠道
 *   node scripts/publish-update.mjs --channel=beta    # 强制 beta 渠道
 *   node scripts/publish-update.mjs --channel=stable  # 强制 stable 渠道
 *
 * 配置来自 apps/web/.env.prod（自动加载，命令行环境变量优先）
 */

import { readFileSync, statSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  buildChangelogUrl,
  uploadChangelogs,
} from '../../../scripts/shared/publishUtils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const webRoot = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 自动加载 .env.prod
// ---------------------------------------------------------------------------

loadEnvFile(path.join(webRoot, '.env.prod'))

// ---------------------------------------------------------------------------
// 配置校验
// ---------------------------------------------------------------------------

const r2Config = validateR2Config()
const s3 = createS3Client(r2Config)

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  // 1. 读取版本号
  const pkg = JSON.parse(readFileSync(path.join(webRoot, 'package.json'), 'utf-8'))
  const version = pkg.version
  if (!version) {
    console.error('❌ package.json 缺少 version 字段')
    process.exit(1)
  }

  // 解析渠道
  const channel = resolveChannel(process.argv.slice(2), version)
  console.log(`📦 Web version: ${version}`)
  console.log(`📡 Channel: ${channel}`)

  // 2. 构建
  console.log('🔨 Building web...')
  execSync('pnpm run build', { cwd: webRoot, stdio: 'inherit' })

  const outDir = path.join(webRoot, 'out')
  if (!existsSync(outDir)) {
    console.error('❌ 构建产物 out/ 目录不存在')
    process.exit(1)
  }

  // 3. tar.gz 压缩
  const distDir = path.join(webRoot, 'dist')
  mkdirSync(distDir, { recursive: true })
  const tarPath = path.join(distDir, 'web.tar.gz')
  console.log('📝 Compressing with tar.gz...')
  // -C 指向 out/ 目录内部，打包 "." 而非 "out"，避免解压后双层嵌套
  execSync(`tar -czf "${tarPath}" -C "${outDir}" .`, { stdio: 'inherit' })

  // 4. 计算 SHA-256
  const sha256 = await computeSha256(tarPath)
  const size = statSync(tarPath).size
  console.log(`✅ SHA-256: ${sha256}`)
  console.log(`✅ Size: ${(size / 1024 / 1024).toFixed(2)} MB`)

  // 5. 上传到 R2（共享构件池，不分渠道）
  const r2Key = `web/${version}/web.tar.gz`
  console.log(`☁️  Uploading to R2: ${r2Key}`)
  await uploadFile(s3, r2Config.bucket, r2Key, tarPath)

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
  const changelogUrl = buildChangelogUrl(r2Config.publicUrl, 'web', version)
  manifest.web = {
    version,
    url: `${r2Config.publicUrl}/${r2Key}`,
    sha256,
    size,
    updatedAt,
    changelogUrl,
  }

  await uploadJson(s3, r2Config.bucket, manifestKey, manifest)

  // 上传 changelogs
  const changelogsDir = path.join(webRoot, 'changelogs')
  await uploadChangelogs({
    s3,
    bucket: r2Config.bucket,
    component: 'web',
    changelogsDir,
    publicUrl: r2Config.publicUrl,
    versionDirPrefix: `web/${version}`,
  })

  console.log(`\n/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
🎉 Web v${version} published to ${channel} successfully!`)
  console.log(`   URL: ${r2Config.publicUrl}/${r2Key}`)
}

main().catch((err) => {
  console.error('❌ Publish failed:', err)
  process.exit(1)
})
