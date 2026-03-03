#!/usr/bin/env node

/**
 * Electron 整包更新发布脚本（Beta-first 模式）：
 *
 * 三种运行模式：
 *
 * 1. 默认（完整）模式：node publish-update.mjs [--skip-build]
 *    - 构建（可跳过） → 上传所有平台文件 → 写 manifest → 更新渠道指针
 *
 * 2. 上传模式（per-build CI）：node publish-update.mjs --skip-build --upload-only --platform=<p>
 *    - 仅上传指定平台的文件到 R2
 *    - 保存平台元数据到 dist/platform-meta-{platform}.json（供 --manifest-only 读取）
 *    - 跳过 manifest 写入
 *
 * 3. manifest 模式（CI 汇总步骤）：node publish-update.mjs --manifest-only
 *    - 读取 dist/platform-meta-*.json（各平台上传后保存的元数据）
 *    - 写 desktop/{version}/manifest.json
 *    - 更新渠道指针 {channel}/manifest.json
 *    - 上传 changelogs + 清理旧版本
 *
 * R2 存储结构（Beta-first 格式）：
 *   beta/manifest.json              ← 轻量渠道指针: { "desktop": { "version": "0.1.1-beta.1" } }
 *   desktop/
 *     beta/
 *       latest-mac.yml              ← beta 渠道更新清单
 *       latest.yml
 *       latest-linux.yml
 *     latest-mac.yml                ← 根目录（向后兼容）
 *     latest.yml
 *     latest-linux.yml
 *     0.1.1-beta.1/
 *       manifest.json               ← 完整版本信息（sha256、url、size、platforms）
 *       CHANGELOG.md                ← 本版本更新记录
 *       OpenLoaf-0.1.1-beta.1-MacOS-arm64.dmg
 *       OpenLoaf-0.1.1-beta.1.exe
 *       OpenLoaf-0.1.1-beta.1.AppImage
 *       latest-mac.yml              ← electron-updater 兼容文件（版本目录内）
 *       latest.yml
 *       latest-linux.yml
 *
 * 配置来自 apps/desktop/.env.prod（自动加载，命令行环境变量优先）
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  loadEnvFile,
  validateR2Config,
  validateCosConfig,
  createS3Client,
  createCosS3Client,
  uploadFile,
  uploadJson,
  downloadJson,
  uploadChangelogs,
  computeSha256,
  cleanupOldVersions,
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

const cosConfig = validateCosConfig()
const cos = cosConfig ? createCosS3Client(cosConfig) : null

if (cosConfig) {
  console.log(`☁️  COS sync enabled: ${cosConfig.bucket}`)
} else {
  console.log('   COS sync disabled (COS_* env vars not set)')
}

// ---------------------------------------------------------------------------
// 全平台产物匹配规则
// ---------------------------------------------------------------------------

const AUTO_UPDATE_YMLS = ['latest-mac.yml', 'latest.yml', 'latest-linux.yml']

function isAutoUpdateYml(filename) {
  return AUTO_UPDATE_YMLS.includes(filename)
}

function isInstallerArtifact(filename) {
  const exts = ['.dmg', '.dmg.blockmap', '.zip', '.zip.blockmap',
                '.exe', '.exe.blockmap', '.AppImage', '.AppImage.blockmap']
  return exts.some((ext) => filename.endsWith(ext))
}

function isDesktopArtifact(filename) {
  return isAutoUpdateYml(filename) || isInstallerArtifact(filename)
}

// ---------------------------------------------------------------------------
// 平台归类
// ---------------------------------------------------------------------------

/**
 * 平台过滤规则（--upload-only --platform=xxx 时使用）
 */
const PLATFORM_FILTERS = {
  'mac-arm64': {
    installerFilter: (f) =>
      /[-_]arm64[-_.]/.test(f) || f.includes('-MacOS-arm64'),
    ymls: ['latest-mac.yml'],
  },
  'mac-x64': {
    installerFilter: (f) =>
      (/[-_]x64[-_.]/.test(f) && (f.endsWith('.dmg') || f.endsWith('.dmg.blockmap') || f.endsWith('.zip') || f.endsWith('.zip.blockmap'))),
    ymls: ['latest-mac.yml'],
  },
  'win-x64': {
    installerFilter: (f) => f.endsWith('.exe') || f.endsWith('.exe.blockmap'),
    ymls: ['latest.yml'],
  },
  'linux-x64': {
    installerFilter: (f) => f.endsWith('.AppImage') || f.endsWith('.AppImage.blockmap'),
    ymls: ['latest-linux.yml'],
  },
}

/**
 * 从文件名推断 platform key（用于 versionManifest.platforms）。
 */
function inferPlatform(filename) {
  if ((filename.includes('-arm64') || filename.includes('_arm64')) &&
      (filename.endsWith('.dmg') || filename.endsWith('.zip'))) {
    return 'mac-arm64'
  }
  if ((filename.includes('-x64') || filename.includes('_x64') || filename.includes('-MacOS-x64')) &&
      (filename.endsWith('.dmg') || filename.endsWith('.zip'))) {
    return 'mac-x64'
  }
  if (filename.endsWith('.exe')) return 'win-x64'
  if (filename.endsWith('.AppImage')) return 'linux-x64'
  return null
}

// ---------------------------------------------------------------------------
// yml url 前缀修改
// ---------------------------------------------------------------------------

/**
 * 修改 latest-*.yml 中的 url 字段，加上 {version}/ 前缀。
 * electron-builder 生成的 yml 中 url 是裸文件名（如 OpenLoaf-0.2.3.dmg），
 * 需要改为 0.2.3/OpenLoaf-0.2.3.dmg 才能匹配版本化的目录结构。
 */
function patchYmlUrls(ymlPath, version) {
  const content = readFileSync(ymlPath, 'utf-8')
  const patched = content.replace(
    /^(\s*-?\s*url:\s*)(.+)$/gm,
    (match, prefix, url) => {
      const trimmedUrl = url.trim()
      if (trimmedUrl.startsWith('http') || trimmedUrl.includes('/')) return match
      return `${prefix}${version}/${trimmedUrl}`
    }
  )
  const patchedPath = patched.replace(
    /^(path:\s*)(.+)$/m,
    (match, prefix, p) => {
      const trimmedPath = p.trim()
      if (trimmedPath.startsWith('http') || trimmedPath.includes('/')) return match
      return `${prefix}${version}/${trimmedPath}`
    }
  )
  writeFileSync(ymlPath, patchedPath, 'utf-8')
}

// ---------------------------------------------------------------------------
// 上传文件（R2 + COS 同步）
// ---------------------------------------------------------------------------

async function uploadToAll(key, filePath) {
  const uploads = [
    uploadFile(s3, r2Config.bucket, key, filePath).then(() => console.log(`   [R2]  ${key}`)),
  ]
  if (cos && cosConfig) {
    uploads.push(
      uploadFile(cos, cosConfig.bucket, key, filePath).then(() => console.log(`   [COS] ${key}`)),
    )
  }
  await Promise.all(uploads)
}

async function uploadJsonToAll(key, data) {
  await uploadJson(s3, r2Config.bucket, key, data)
  console.log(`   [R2]  ${key}`)
  if (cos && cosConfig) {
    await uploadJson(cos, cosConfig.bucket, key, data)
    console.log(`   [COS] ${key}`)
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const skipBuild = args.includes('--skip-build')
  const uploadOnly = args.includes('--upload-only')
  const manifestOnly = args.includes('--manifest-only')
  const platformArg = args.find((a) => a.startsWith('--platform='))?.split('=')[1]

  // 1. 读取版本号
  const pkg = JSON.parse(readFileSync(path.join(electronRoot, 'package.json'), 'utf-8'))
  const version = pkg.version
  console.log(`📦 Electron version: ${version}`)

  const isBeta = version.includes('-beta')
  const channel = isBeta ? 'beta' : 'stable'
  console.log(`📡 Channel: ${channel}`)

  const distDir = path.join(electronRoot, 'dist')

  // -------------------------------------------------------------------------
  // Manifest-only 模式：读取元数据 → 写 manifest → 更新渠道指针
  // -------------------------------------------------------------------------
  if (manifestOnly) {
    console.log('\n📝 Manifest-only mode: reading platform metadata...')

    const platforms = {}
    if (existsSync(distDir)) {
      for (const f of readdirSync(distDir)) {
        if (f.startsWith('platform-meta-') && f.endsWith('.json')) {
          const meta = JSON.parse(readFileSync(path.join(distDir, f), 'utf-8'))
          Object.assign(platforms, meta)
          console.log(`   Read: ${f} → ${Object.keys(meta).join(', ')}`)
        }
      }
    }

    if (Object.keys(platforms).length === 0) {
      console.warn('⚠️  No platform metadata found in dist/. Version manifest will have empty platforms.')
    }

    // 写 desktop/{version}/manifest.json
    const versionManifest = {
      version,
      publishedAt: new Date().toISOString(),
      channel,
      platforms,
    }
    const versionManifestKey = `desktop/${version}/manifest.json`
    await uploadJsonToAll(versionManifestKey, versionManifest)
    console.log(`\n✅ Written version manifest: ${versionManifestKey}`)

    // 更新渠道指针 {channel}/manifest.json（只写 desktop.version，保留其他字段）
    const channelManifestKey = `${channel}/manifest.json`
    let channelManifest = {}
    try {
      channelManifest = await downloadJson(s3, r2Config.bucket, channelManifestKey)
    } catch {
      // 首次创建
    }
    channelManifest.desktop = { version }
    await uploadJsonToAll(channelManifestKey, channelManifest)
    console.log(`✅ Updated ${channelManifestKey}: desktop.version = "${version}"`)

    // 上传 changelogs
    console.log('\n📝 Uploading changelogs...')
    const changelogsDir = path.join(electronRoot, 'changelogs')
    await uploadChangelogs({
      s3,
      bucket: r2Config.bucket,
      component: 'desktop',
      changelogsDir,
      publicUrl: r2Config.publicUrl,
      versionDirPrefix: `desktop/${version}`,
    })
    if (cos && cosConfig) {
      await uploadChangelogs({
        s3: cos,
        bucket: cosConfig.bucket,
        component: 'desktop',
        changelogsDir,
        publicUrl: cosConfig.publicUrl,
        versionDirPrefix: `desktop/${version}`,
      })
    }

    // 清理旧版本（保留最近 3 个）
    await cleanupOldVersions({ s3, bucket: r2Config.bucket, prefix: 'desktop/', keep: 3 })
    if (cos && cosConfig) {
      await cleanupOldVersions({ s3: cos, bucket: cosConfig.bucket, prefix: 'desktop/', keep: 3 })
    }

    console.log(`\n🎉 Manifest written for v${version} (${channel} channel)`)
    return
  }

  // -------------------------------------------------------------------------
  // 构建（可选）
  // -------------------------------------------------------------------------
  if (!skipBuild) {
    console.log('🔨 Building Electron app (dist:mac)...')
    execSync('pnpm run dist:mac', { cwd: electronRoot, stdio: 'inherit' })
  }

  // -------------------------------------------------------------------------
  // 扫描 dist/ 目录
  // -------------------------------------------------------------------------
  if (!existsSync(distDir)) {
    console.error('❌ dist/ 目录不存在。请先运行构建或去掉 --skip-build')
    process.exit(1)
  }

  const allFiles = readdirSync(distDir)
  let installerFiles = allFiles.filter(isInstallerArtifact)
  let ymlFiles = allFiles.filter(isAutoUpdateYml)

  // 如果指定了 --platform，过滤只处理该平台的文件
  if (platformArg && PLATFORM_FILTERS[platformArg]) {
    const filter = PLATFORM_FILTERS[platformArg]
    installerFiles = installerFiles.filter(filter.installerFilter)
    ymlFiles = ymlFiles.filter((f) => filter.ymls.includes(f))
    console.log(`\n🎯 Platform filter: ${platformArg}`)
  }

  if (installerFiles.length === 0 && ymlFiles.length === 0) {
    console.error('❌ dist/ 目录中没有找到可上传的构建产物')
    process.exit(1)
  }

  console.log(`\n📋 将上传 ${installerFiles.length} 个安装包：`)
  for (const f of installerFiles) console.log(`   - ${f}`)
  if (ymlFiles.length > 0) {
    console.log(`📋 将上传 ${ymlFiles.length} 个更新清单：`)
    for (const f of ymlFiles) console.log(`   - ${f}`)
  }

  // -------------------------------------------------------------------------
  // 修改 yml 中的 url 路径（加版本前缀）
  // -------------------------------------------------------------------------
  for (const file of ymlFiles) {
    const ymlPath = path.join(distDir, file)
    patchYmlUrls(ymlPath, version)
    console.log(`   ✏️  Patched ${file} urls with ${version}/ prefix`)
  }

  // -------------------------------------------------------------------------
  // 上传安装包到 desktop/{version}/
  // -------------------------------------------------------------------------
  const platforms = {}
  for (const file of installerFiles) {
    const key = `desktop/${version}/${file}`
    const filePath = path.join(distDir, file)
    const fileSize = statSync(filePath).size

    await uploadToAll(key, filePath)

    // 收集平台信息（仅对主安装包，跳过 blockmap 等）
    if (!file.endsWith('.blockmap')) {
      const platform = inferPlatform(file)
      if (platform) {
        const sha256 = await computeSha256(filePath)
        platforms[platform] = {
          url: `${r2Config.publicUrl}/desktop/${version}/${file}`,
          sha256,
          size: fileSize,
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 上传 yml 到：版本目录 + 渠道目录 + 根目录（向后兼容）
  // -------------------------------------------------------------------------
  for (const file of ymlFiles) {
    const filePath = path.join(distDir, file)

    // 版本目录
    await uploadToAll(`desktop/${version}/${file}`, filePath)

    // 渠道目录
    await uploadToAll(`desktop/${channel}/${file}`, filePath)

    // 根目录（向后兼容旧版客户端）
    await uploadFile(s3, r2Config.bucket, `desktop/${file}`, filePath)
    console.log(`   [R2]  desktop/${file} (compat)`)
    if (cos && cosConfig) {
      await uploadFile(cos, cosConfig.bucket, `desktop/${file}`, filePath)
      console.log(`   [COS] desktop/${file} (compat)`)
    }
  }

  // -------------------------------------------------------------------------
  // upload-only 模式：保存元数据，不写 manifest
  // -------------------------------------------------------------------------
  if (uploadOnly) {
    const metaFilename = platformArg
      ? `platform-meta-${platformArg}.json`
      : `platform-meta-${Object.keys(platforms)[0] || 'unknown'}.json`
    const metaPath = path.join(distDir, metaFilename)
    writeFileSync(metaPath, JSON.stringify(platforms, null, 2))
    console.log(`\n✅ Saved platform metadata: dist/${metaFilename}`)
    console.log(JSON.stringify(platforms, null, 2))
    return
  }

  // -------------------------------------------------------------------------
  // 完整模式：写版本 manifest + 更新渠道指针 + changelogs + 清理
  // -------------------------------------------------------------------------

  // 写 desktop/{version}/manifest.json
  const versionManifest = {
    version,
    publishedAt: new Date().toISOString(),
    channel,
    platforms,
  }
  const versionManifestKey = `desktop/${version}/manifest.json`
  await uploadJsonToAll(versionManifestKey, versionManifest)
  console.log(`\n✅ Written version manifest: ${versionManifestKey}`)

  // 更新渠道指针
  const channelManifestKey = `${channel}/manifest.json`
  let channelManifest = {}
  try {
    channelManifest = await downloadJson(s3, r2Config.bucket, channelManifestKey)
  } catch {
    // 首次创建
  }
  channelManifest.desktop = { version }
  await uploadJsonToAll(channelManifestKey, channelManifest)
  console.log(`✅ Updated ${channelManifestKey}: desktop.version = "${version}"`)

  // 上传 changelogs
  console.log('\n📝 Uploading changelogs...')
  const changelogsDir = path.join(electronRoot, 'changelogs')
  await uploadChangelogs({
    s3,
    bucket: r2Config.bucket,
    component: 'desktop',
    changelogsDir,
    publicUrl: r2Config.publicUrl,
    versionDirPrefix: `desktop/${version}`,
  })
  if (cos && cosConfig) {
    await uploadChangelogs({
      s3: cos,
      bucket: cosConfig.bucket,
      component: 'desktop',
      changelogsDir,
      publicUrl: cosConfig.publicUrl,
      versionDirPrefix: `desktop/${version}`,
    })
  }

  // 清理旧版本（保留最近 3 个）
  await cleanupOldVersions({ s3, bucket: r2Config.bucket, prefix: 'desktop/', keep: 3 })
  if (cos && cosConfig) {
    await cleanupOldVersions({ s3: cos, bucket: cosConfig.bucket, prefix: 'desktop/', keep: 3 })
  }

  console.log(`\n🎉 Electron v${version} published to ${channel} channel!`)
  console.log(`   R2:  ${r2Config.publicUrl}/desktop/${version}/`)
  if (cosConfig) console.log(`   COS: ${cosConfig.publicUrl}/desktop/${version}/`)
  console.log(`\n📥 Download URLs:`)
  for (const [platform, info] of Object.entries(platforms)) {
    console.log(`   [${platform}] ${info.url}`)
  }
}

main().catch((err) => {
  console.error('❌ Publish failed:', err)
  process.exit(1)
})
