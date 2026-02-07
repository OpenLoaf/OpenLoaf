#!/usr/bin/env node

/**
 * Electron 整包更新发布脚本：
 * 1. （可选）运行 dist:production 构建签名后的安装包
 * 2. 扫描 dist/ 目录中的构建产物和 latest-*.yml
 * 3. 上传到 Cloudflare R2 的 electron/ 路径下
 * 4. 上传 changelogs
 *
 * 用法：
 *   node scripts/publish-update.mjs                   # 先构建再上传
 *   node scripts/publish-update.mjs --skip-build      # 跳过构建，仅上传已有产物
 *
 * 配置来自 apps/electron/.env.prod（自动加载，命令行环境变量优先）
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  loadEnvFile,
  validateR2Config,
  createS3Client,
  uploadFile,
  uploadChangelogs,
} from '../../../scripts/shared/publishUtils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const electronRoot = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 自动加载 .env.prod
// ---------------------------------------------------------------------------

loadEnvFile(path.join(electronRoot, '.env.prod'))

// ---------------------------------------------------------------------------
// 配置校验
// ---------------------------------------------------------------------------

const r2Config = validateR2Config()
const s3 = createS3Client(r2Config)

// ---------------------------------------------------------------------------
// macOS 产物匹配规则
// ---------------------------------------------------------------------------

function isMacArtifact(filename) {
  if (filename === 'latest-mac.yml') return true
  if (filename.endsWith('.dmg')) return true
  if (filename.endsWith('.dmg.blockmap')) return true
  if (filename.endsWith('-mac.zip')) return true
  if (filename.endsWith('-mac.zip.blockmap')) return true
  return false
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const skipBuild = args.includes('--skip-build')

  // 1. 读取版本号
  const pkg = JSON.parse(readFileSync(path.join(electronRoot, 'package.json'), 'utf-8'))
  const version = pkg.version
  console.log(`📦 Electron version: ${version}`)

  // 2. 构建（可选）
  if (!skipBuild) {
    console.log('🔨 Building Electron app (dist:production)...')
    execSync('pnpm run dist:production', { cwd: electronRoot, stdio: 'inherit' })
  }

  // 3. 扫描 dist/ 目录
  const distDir = path.join(electronRoot, 'dist')
  if (!existsSync(distDir)) {
    console.error('❌ dist/ 目录不存在。请先运行构建或去掉 --skip-build')
    process.exit(1)
  }

  const allFiles = readdirSync(distDir)
  const filesToUpload = allFiles.filter(isMacArtifact)

  if (filesToUpload.length === 0) {
    console.error('❌ dist/ 目录中没有找到可上传的构建产物')
    process.exit(1)
  }

  console.log(`\n📋 将上传 ${filesToUpload.length} 个文件到 R2 electron/ 路径：`)
  for (const f of filesToUpload) {
    console.log(`   - ${f}`)
  }
  console.log()

  // 4. 上传到 R2
  for (const file of filesToUpload) {
    const r2Key = `electron/${file}`
    const filePath = path.join(distDir, file)
    console.log(`☁️  Uploading: ${r2Key}`)
    await uploadFile(s3, r2Config.bucket, r2Key, filePath)
  }

  // 5. 上传 changelogs
  console.log('\n📝 Uploading changelogs...')
  await uploadChangelogs({
    s3,
    bucket: r2Config.bucket,
    component: 'electron',
    changelogsDir: path.join(electronRoot, 'changelogs'),
    publicUrl: r2Config.publicUrl,
  })

  console.log(`\n🎉 Electron v${version} published successfully!`)
  console.log(`   Feed URL: ${r2Config.publicUrl}/electron/`)
}

main().catch((err) => {
  console.error('❌ Publish failed:', err)
  process.exit(1)
})
