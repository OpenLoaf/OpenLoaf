#!/usr/bin/env node

/**
 * Web 增量更新发布脚本：
 * 1. 运行 next build 构建静态导出
 * 2. tar.gz 压缩 out/ 目录
 * 3. 计算 SHA-256
 * 4. 上传到 Cloudflare R2
 * 5. 更新 manifest.json
 *
 * 配置来自 apps/web/.env.prod（自动加载，命令行环境变量优先）
 */

import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const webRoot = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 自动加载 .env.prod
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const raw = readFileSync(filePath, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile(path.join(webRoot, '.env.prod'))

// ---------------------------------------------------------------------------
// 配置校验
// ---------------------------------------------------------------------------

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
  console.error('   请在 apps/web/.env.prod 中设置：')
  console.error('   R2_BUCKET=tenas-updates')
  console.error('   R2_PUBLIC_URL=https://pub-xxx.r2.dev')
  console.error('   R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com')
  console.error('   R2_ACCESS_KEY_ID=xxx')
  console.error('   R2_SECRET_ACCESS_KEY=xxx')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// S3 Client（兼容 Cloudflare R2）
// ---------------------------------------------------------------------------

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

async function uploadFile(key, filePath) {
  const body = readFileSync(filePath)
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
  }))
}

async function downloadJson(key) {
  const res = await s3.send(new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  }))
  const text = await res.Body.transformToString()
  return JSON.parse(text)
}

async function uploadJson(key, data) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  }))
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

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
  console.log(`📦 Web version: ${version}`)

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
  const tarPath = path.join(distDir, 'out.tar.gz')
  console.log('📝 Compressing with tar.gz...')
  // -C 指向 out/ 目录内部，打包 "." 而非 "out"，避免解压后双层嵌套
  execSync(`tar -czf "${tarPath}" -C "${outDir}" .`, { stdio: 'inherit' })

  // 4. 计算 SHA-256
  const sha256 = await computeSha256(tarPath)
  const size = statSync(tarPath).size
  console.log(`✅ SHA-256: ${sha256}`)
  console.log(`✅ Size: ${(size / 1024 / 1024).toFixed(2)} MB`)

  // 5. 上传到 R2
  const r2Key = `web/${version}/out.tar.gz`
  console.log(`☁️  Uploading to R2: ${r2Key}`)
  await uploadFile(r2Key, tarPath)

  // 6. 更新 manifest.json
  console.log('📋 Updating manifest.json...')
  let manifest = { schemaVersion: 1 }
  try {
    manifest = await downloadJson('manifest.json')
  } catch {
    console.log('   (No existing manifest found, creating new one)')
  }

  const updatedAt = new Date().toISOString()
  manifest.web = {
    version,
    url: `${R2_PUBLIC_URL}/${r2Key}`,
    sha256,
    size,
    // 更新时间（UTC ISO 8601）
    updatedAt,
  }

  await uploadJson('manifest.json', manifest)

  console.log(`\n🎉 Web v${version} published successfully!`)
  console.log(`   URL: ${R2_PUBLIC_URL}/${r2Key}`)
}

main().catch((err) => {
  console.error('❌ Publish failed:', err)
  process.exit(1)
})
