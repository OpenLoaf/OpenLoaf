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
 *    - 上传指定平台的文件到 R2
 *    - 保存平台元数据到 dist/platform-meta-{platform}.json（供 --manifest-only 兜底读取）
 *    - 从 R2 读取已有 manifest，合并当前平台信息后写回（每平台独立完成，先完成先可测）
 *    - 更新渠道指针 {channel}/manifest.json
 *
 * 3. manifest 模式（CI 收尾步骤）：node publish-update.mjs --manifest-only
 *    - 从 R2 读取各平台已写入的 manifest，合并本地 platform-meta-*.json 作为兜底
 *    - 写 desktop/{version}/manifest.json（确保所有平台数据完整）
 *    - 更新渠道指针 {channel}/manifest.json
 *    - 上传 changelogs + 清理旧版本
 *
 * R2 存储结构（Beta-first 格式）：
 *   beta/manifest.json              ← 轻量渠道指针: { "desktop": { "version": "0.1.1-beta.1" } }
 *   desktop/
 *     beta/
 *       latest-mac.yml              ← macOS x64 更新清单
 *       latest-mac-arm64.yml        ← macOS arm64 更新清单（electron-updater 6.x ARM Mac 优先读取）
 *       latest.yml
 *       latest-linux.yml
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

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, createReadStream } from 'node:fs'
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

const AUTO_UPDATE_YMLS = ['latest-mac.yml', 'latest-mac-arm64.yml', 'latest.yml', 'latest-linux.yml']

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
    ymls: ['latest-mac-arm64.yml'],
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
// 生成 electron-updater yml
// ---------------------------------------------------------------------------

/**
 * electron-builder 在 --publish=never 时不生成 latest-*.yml，
 * 所以我们在上传产物后自行生成，供 electron-updater 读取。
 */

/** 计算文件 SHA-512（base64 编码，electron-updater yml 格式要求）。 */
function computeSha512Base64(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
    stream.on('error', reject)
  })
}

/**
 * 从上传的安装包列表中，按平台生成 electron-updater 格式的 yml 文件。
 *
 * 平台 → yml 文件名映射：
 * - mac-arm64 → latest-mac-arm64.yml（electron-updater 6.x ARM Mac 优先读取）
 * - mac-x64   → latest-mac.yml（x64 Mac 读取）
 * - win-x64   → latest.yml（使用 .exe）
 * - linux-x64 → latest-linux.yml（使用 .AppImage）
 */
const YML_PLATFORM_MAP = {
  'mac-arm64':  { yml: 'latest-mac-arm64.yml', ext: '.zip' },
  'mac-x64':    { yml: 'latest-mac.yml',       ext: '.zip' },
  'win-x64':    { yml: 'latest.yml',           ext: '.exe' },
  'linux-x64':  { yml: 'latest-linux.yml',     ext: '.AppImage' },
}

async function generateAndUploadYmls(version, channel, installerFiles, distDir, publicUrl = r2Config.publicUrl) {
  // 按 yml 文件名分组（mac-arm64 → latest-mac-arm64.yml, mac-x64 → latest-mac.yml）
  /** @type {Map<string, Array<{file: string, platform: string}>>} */
  const ymlGroups = new Map()

  for (const file of installerFiles) {
    if (file.endsWith('.blockmap')) continue
    const platform = inferPlatform(file)
    if (!platform) continue
    const mapping = YML_PLATFORM_MAP[platform]
    if (!mapping) continue
    // 只取对应扩展名的文件作为更新源
    if (!file.endsWith(mapping.ext)) continue

    if (!ymlGroups.has(mapping.yml)) ymlGroups.set(mapping.yml, [])
    ymlGroups.get(mapping.yml).push({ file, platform })
  }

  for (const [ymlName, entries] of ymlGroups) {
    const files = []
    let primaryFile = null
    let primarySha512 = null

    for (const { file } of entries) {
      const filePath = path.join(distDir, file)
      const fileSize = statSync(filePath).size
      const sha512 = await computeSha512Base64(filePath)

      files.push({ url: `${publicUrl}/desktop/${version}/${file}`, sha512, size: fileSize })

      // blockmap 大小（如果存在）
      const blockmapPath = `${filePath}.blockmap`
      if (existsSync(blockmapPath)) {
        files[files.length - 1].blockMapSize = statSync(blockmapPath).size
      }

      if (!primaryFile) {
        primaryFile = file
        primarySha512 = sha512
      }
    }

    // 生成 yml 内容
    let yml = `version: ${version}\n`
    yml += 'files:\n'
    for (const f of files) {
      yml += `  - url: ${f.url}\n`
      yml += `    sha512: ${f.sha512}\n`
      yml += `    size: ${f.size}\n`
      if (f.blockMapSize) {
        yml += `    blockMapSize: ${f.blockMapSize}\n`
      }
    }
    yml += `path: ${publicUrl}/desktop/${version}/${primaryFile}\n`
    yml += `sha512: ${primarySha512}\n`
    yml += `releaseDate: '${new Date().toISOString()}'\n`

    // 上传到版本目录 + 渠道目录
    const ymlPath = path.join(distDir, ymlName)
    writeFileSync(ymlPath, yml, 'utf-8')

    await uploadToAll(`desktop/${version}/${ymlName}`, ymlPath)
    await uploadToAll(`desktop/${channel}/${ymlName}`, ymlPath)
    console.log(`   ✅ Generated & uploaded ${ymlName}`)

    // electron-updater 6.x 在 ARM Mac 上优先读取 latest-mac-arm64.yml，
    // x64 Mac 读取 latest-mac.yml。两个文件由各自平台的构建步骤独立生成，互不覆盖。
  }
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

  // 读取 web/server 版本，写入 manifest 的 bundledVersions 字段
  const serverPkg = JSON.parse(readFileSync(path.resolve(electronRoot, '..', 'server', 'package.json'), 'utf-8'))
  const webPkg = JSON.parse(readFileSync(path.resolve(electronRoot, '..', 'web', 'package.json'), 'utf-8'))
  const bundledVersions = { server: serverPkg.version, web: webPkg.version }
  console.log(`📦 Bundled versions: server=${bundledVersions.server}, web=${bundledVersions.web}`)

  const isBeta = version.includes('-beta')
  const channel = isBeta ? 'beta' : 'stable'
  console.log(`📡 Channel: ${channel}`)

  const distDir = path.join(electronRoot, 'dist')

  // -------------------------------------------------------------------------
  // Manifest-only 模式：读取元数据 → 写 manifest → 更新渠道指针
  // -------------------------------------------------------------------------
  if (manifestOnly) {
    console.log('\n📝 Manifest-only mode: merging platform metadata as fallback...')

    // 从本地 platform-meta 文件读取（CI artifact 下载）
    const localPlatforms = {}
    if (existsSync(distDir)) {
      for (const f of readdirSync(distDir)) {
        if (f.startsWith('platform-meta-') && f.endsWith('.json')) {
          const meta = JSON.parse(readFileSync(path.join(distDir, f), 'utf-8'))
          Object.assign(localPlatforms, meta)
          console.log(`   Read: ${f} → ${Object.keys(meta).join(', ')}`)
        }
      }
    }

    // 从 R2 读取已有 manifest（各平台 --upload-only 已各自写入）
    const versionManifestKey = `desktop/${version}/manifest.json`
    let existingManifest = null
    try {
      existingManifest = await downloadJson(s3, r2Config.bucket, versionManifestKey)
      console.log(`   R2 manifest: ${Object.keys(existingManifest.platforms || {}).join(', ') || '(empty)'}`)
    } catch {
      console.log('   No existing R2 manifest found')
    }

    // 合并：R2 已有 + 本地 meta（本地覆盖，确保兜底完整性）
    const mergedPlatforms = {
      ...(existingManifest?.platforms || {}),
      ...localPlatforms,
    }

    if (Object.keys(mergedPlatforms).length === 0) {
      console.warn('⚠️  No platform data found (neither R2 nor local). Version manifest will have empty platforms.')
    }

    // 写 desktop/{version}/manifest.json（合并后的最终版本）
    const versionManifest = {
      version,
      bundledVersions,
      publishedAt: new Date().toISOString(),
      channel,
      platforms: mergedPlatforms,
    }
    await uploadJsonToAll(versionManifestKey, versionManifest)
    console.log(`\n✅ Written version manifest: ${versionManifestKey} (platforms: ${Object.keys(mergedPlatforms).join(', ')})`)

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

    console.log(`\n🎉 Finalized v${version} (${channel} channel)`)
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
  // 上传 yml 到：版本目录 + 渠道目录
  // -------------------------------------------------------------------------
  for (const file of ymlFiles) {
    const filePath = path.join(distDir, file)

    // 版本目录
    await uploadToAll(`desktop/${version}/${file}`, filePath)

    // 渠道目录
    await uploadToAll(`desktop/${channel}/${file}`, filePath)
  }

  // -------------------------------------------------------------------------
  // upload-only 模式：保存元数据 + 合并写入 manifest（每平台独立完成）
  // -------------------------------------------------------------------------
  if (uploadOnly) {
    // 保存 localMeta（向后兼容，publish-manifest 仍可用作兜底）
    const metaFilename = platformArg
      ? `platform-meta-${platformArg}.json`
      : `platform-meta-${Object.keys(platforms)[0] || 'unknown'}.json`
    const metaPath = path.join(distDir, metaFilename)
    writeFileSync(metaPath, JSON.stringify(platforms, null, 2))
    console.log(`\n✅ Saved platform metadata: dist/${metaFilename}`)
    console.log(JSON.stringify(platforms, null, 2))

    // 从 R2 读取已有 manifest，合并当前平台信息，写回
    const versionManifestKey = `desktop/${version}/manifest.json`
    let existingManifest = null
    try {
      existingManifest = await downloadJson(s3, r2Config.bucket, versionManifestKey)
      console.log(`\n📖 Read existing manifest: ${Object.keys(existingManifest.platforms || {}).join(', ') || '(empty)'}`)
    } catch {
      // 首个平台写入时 manifest 不存在
      console.log('\n📖 No existing manifest found, creating new one')
    }

    const mergedPlatforms = {
      ...(existingManifest?.platforms || {}),
      ...platforms,
    }

    const versionManifest = {
      version,
      bundledVersions,
      publishedAt: new Date().toISOString(),
      channel,
      platforms: mergedPlatforms,
    }
    await uploadJsonToAll(versionManifestKey, versionManifest)
    console.log(`✅ Written version manifest: ${versionManifestKey} (platforms: ${Object.keys(mergedPlatforms).join(', ')})`)

    // 更新渠道指针 {channel}/manifest.json
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

    // 生成 electron-updater yml 并上传到渠道目录
    console.log('\n📝 Generating electron-updater yml files...')
    await generateAndUploadYmls(version, channel, installerFiles, distDir)

    return
  }

  // -------------------------------------------------------------------------
  // 完整模式：写版本 manifest + 更新渠道指针 + changelogs + 清理
  // -------------------------------------------------------------------------

  // 写 desktop/{version}/manifest.json
  const versionManifest = {
    version,
    bundledVersions,
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

  // 生成 electron-updater yml（兜底，确保渠道目录有 yml）
  console.log('\n📝 Generating electron-updater yml files...')
  await generateAndUploadYmls(version, channel, installerFiles, distDir)

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
