#!/usr/bin/env node
/**
 * 验证 publish-update.mjs 的 macOS yml 合并修复。
 *
 * 模拟：
 * 1. CI 构建流程（arm64 先构建，x64 后构建）
 * 2. electron-updater GenericProvider 读取 latest-mac.yml
 * 3. MacUpdater 根据 URL 中的 "arm64" 选择正确架构
 *
 * 运行：node apps/desktop/scripts/test-mac-yml-fix.mjs
 */

import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync, statSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── 测试辅助 ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${message}`)
    failed++
  }
}

// ─── 从 publish-update.mjs 中提取的纯函数（不依赖 S3/R2） ─────────────────

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

const YML_PLATFORM_MAP = {
  'mac-arm64':  { yml: 'latest-mac-arm64.yml', ext: '.zip' },
  'mac-x64':    { yml: 'latest-mac-x64.yml',   ext: '.zip' },
  'win-x64':    { yml: 'latest.yml',           ext: '.exe' },
  'linux-x64':  { yml: 'latest-linux.yml',     ext: '.AppImage' },
}

// fetchRemoteYml 的 yml 解析逻辑
function parseYml(text) {
  const version = text.match(/^version:\s*(.+)$/m)?.[1]?.trim()
  if (!version) return null

  const files = []
  const entryRegex = /^\s*-\s*url:\s*(.+)$\n\s*sha512:\s*(.+)$\n\s*size:\s*(\d+)(?:\n\s*blockMapSize:\s*(\d+))?/gm
  for (const m of text.matchAll(entryRegex)) {
    const entry = { url: m[1].trim(), sha512: m[2].trim(), size: parseInt(m[3].trim()) }
    if (m[4]) entry.blockMapSize = parseInt(m[4].trim())
    files.push(entry)
  }
  return { version, files }
}

// electron-updater MacUpdater.doDownloadUpdate() 中的文件选择逻辑
// 注意：file.url 是 URL 对象，对应 MacUpdater.js 中 file.url.pathname.includes("arm64")
function simulateMacUpdaterFileSelection(files, isArm64Mac) {
  const isArm64 = (file) => file.url.pathname.includes('arm64') || (file.info?.url?.includes('arm64') ?? false)

  if (isArm64Mac && files.some(isArm64)) {
    // ARM Mac + 有 arm64 文件 → 只保留 arm64
    files = files.filter(file => isArm64Mac === isArm64(file))
  } else {
    // 无 arm64 文件 → 保留非 arm64（即 x64）
    files = files.filter(file => !isArm64(file))
  }
  return files
}

// generateAndUploadYmls 的核心逻辑（无 IO）
function generatePerPlatformYml(version, installerFiles, publicUrl) {
  const ymlGroups = new Map()

  for (const file of installerFiles) {
    if (file.name.endsWith('.blockmap')) continue
    const platform = inferPlatform(file.name)
    if (!platform) continue
    const mapping = YML_PLATFORM_MAP[platform]
    if (!mapping) continue
    if (!file.name.endsWith(mapping.ext)) continue

    if (!ymlGroups.has(mapping.yml)) ymlGroups.set(mapping.yml, [])
    ymlGroups.get(mapping.yml).push(file)
  }

  const result = {}
  for (const [ymlName, entries] of ymlGroups) {
    const files = entries.map(f => ({
      url: `${publicUrl}/desktop/${version}/${f.name}`,
      sha512: f.sha512,
      size: f.size,
    }))
    const primary = files[0]

    let yml = `version: ${version}\n`
    yml += 'files:\n'
    for (const f of files) {
      yml += `  - url: ${f.url}\n`
      yml += `    sha512: ${f.sha512}\n`
      yml += `    size: ${f.size}\n`
    }
    yml += `path: ${primary.url}\n`
    yml += `sha512: ${primary.sha512}\n`
    yml += `releaseDate: '2026-03-21T00:00:00.000Z'\n`

    result[ymlName] = yml
  }
  return result
}

// generateCombinedMacYml 的核心逻辑（无 IO）
function generateCombinedMacYml(version, localMacFiles, remoteYmls, publicUrl) {
  const allEntries = []
  const seenUrls = new Set()

  const addEntry = (entry) => {
    if (seenUrls.has(entry.url)) return
    seenUrls.add(entry.url)
    allEntries.push(entry)
  }

  // 本地文件（当前构建）
  for (const file of localMacFiles) {
    const platform = inferPlatform(file.name)
    if (platform !== 'mac-arm64' && platform !== 'mac-x64') continue
    if (!file.name.endsWith('.zip')) continue
    addEntry({
      url: `${publicUrl}/desktop/${version}/${file.name}`,
      sha512: file.sha512,
      size: file.size,
    })
  }

  // 远程 yml（另一个架构）
  for (const [ymlName, ymlContent] of Object.entries(remoteYmls)) {
    const parsed = parseYml(ymlContent)
    if (parsed && parsed.version === version) {
      for (const entry of parsed.files) addEntry(entry)
    }
  }

  if (allEntries.length === 0) return null

  const primary = allEntries.find((f) => f.url.includes('arm64')) || allEntries[0]

  let yml = `version: ${version}\n`
  yml += 'files:\n'
  for (const f of allEntries) {
    yml += `  - url: ${f.url}\n`
    yml += `    sha512: ${f.sha512}\n`
    yml += `    size: ${f.size}\n`
    if (f.blockMapSize) {
      yml += `    blockMapSize: ${f.blockMapSize}\n`
    }
  }
  yml += `path: ${primary.url}\n`
  yml += `sha512: ${primary.sha512}\n`
  yml += `releaseDate: '2026-03-21T00:00:00.000Z'\n`

  return yml
}

// ─── 测试数据 ─────────────────────────────────────────────────────────────────

const VERSION = '0.2.5-beta.25'
const PUBLIC_URL = 'https://openloaf-update.hexems.com'

const arm64Zip = {
  name: 'OpenLoaf-0.2.5-beta.25-MacOS-arm64.zip',
  sha512: 'arm64sha512base64==',
  size: 297251567,
}

const x64Zip = {
  name: 'OpenLoaf-0.2.5-beta.25-MacOS-x64.zip',
  sha512: 'x64sha512base64==',
  size: 298127458,
}

const arm64Dmg = {
  name: 'OpenLoaf-0.2.5-beta.25-MacOS-arm64.dmg',
  sha512: 'arm64dmgsha512==',
  size: 350000000,
}

const x64Dmg = {
  name: 'OpenLoaf-0.2.5-beta.25-MacOS-x64.dmg',
  sha512: 'x64dmgsha512==',
  size: 355000000,
}

// ─── 测试 1：yml 解析正确性 ──────────────────────────────────────────────────

console.log('\n═══ 测试 1：parseYml 解析正确性 ═══')

const sampleYml = `version: 0.2.5-beta.25
files:
  - url: https://openloaf-update.hexems.com/desktop/0.2.5-beta.25/OpenLoaf-0.2.5-beta.25-MacOS-arm64.zip
    sha512: 4WHVCq0C9yL7CWLfFOaEC7b84rFRP4/6dtj+l9vIrV5kMzx38NH9gti1jLhVzSQfVviiGMQa4nf5/mrESIz3Wg==
    size: 297251567
    blockMapSize: 309608
path: https://openloaf-update.hexems.com/desktop/0.2.5-beta.25/OpenLoaf-0.2.5-beta.25-MacOS-arm64.zip
sha512: 4WHVCq0C9yL7CWLfFOaEC7b84rFRP4/6dtj+l9vIrV5kMzx38NH9gti1jLhVzSQfVviiGMQa4nf5/mrESIz3Wg==
releaseDate: '2026-03-20T19:12:39.338Z'`

const parsed = parseYml(sampleYml)
assert(parsed !== null, '解析不为 null')
assert(parsed.version === '0.2.5-beta.25', `版本号正确: ${parsed.version}`)
assert(parsed.files.length === 1, `文件数量正确: ${parsed.files.length}`)
assert(parsed.files[0].url.includes('arm64'), `URL 包含 arm64: ${parsed.files[0].url.slice(-30)}`)
assert(parsed.files[0].size === 297251567, `文件大小正确: ${parsed.files[0].size}`)
assert(parsed.files[0].blockMapSize === 309608, `blockMapSize 正确: ${parsed.files[0].blockMapSize}`)

// 多文件 yml
const multiFileYml = `version: 0.2.5-beta.25
files:
  - url: https://cdn/arm64.zip
    sha512: aaaa==
    size: 100
    blockMapSize: 10
  - url: https://cdn/x64.zip
    sha512: bbbb==
    size: 200
path: https://cdn/arm64.zip
sha512: aaaa==
releaseDate: '2026-03-21T00:00:00.000Z'`

const parsedMulti = parseYml(multiFileYml)
assert(parsedMulti.files.length === 2, `多文件解析: ${parsedMulti.files.length} 个 entries`)
assert(parsedMulti.files[0].url === 'https://cdn/arm64.zip', '第一个文件 URL 正确')
assert(parsedMulti.files[1].url === 'https://cdn/x64.zip', '第二个文件 URL 正确')
assert(parsedMulti.files[0].blockMapSize === 10, '第一个文件有 blockMapSize')
assert(parsedMulti.files[1].blockMapSize === undefined, '第二个文件无 blockMapSize')

// ─── 测试 2：per-platform yml 生成 ──────────────────────────────────────────

console.log('\n═══ 测试 2：per-platform yml 生成 ═══')

// arm64 构建的 installer 文件
const arm64InstallerFiles = [arm64Zip, arm64Dmg]
const arm64Ymls = generatePerPlatformYml(VERSION, arm64InstallerFiles, PUBLIC_URL)

assert('latest-mac-arm64.yml' in arm64Ymls, 'arm64 生成 latest-mac-arm64.yml')
assert(!('latest-mac.yml' in arm64Ymls), 'arm64 不生成 latest-mac.yml（由 combined 函数负责）')
assert(!('latest-mac-x64.yml' in arm64Ymls), 'arm64 不生成 latest-mac-x64.yml')

const arm64YmlParsed = parseYml(arm64Ymls['latest-mac-arm64.yml'])
assert(arm64YmlParsed.files.length === 1, `arm64 yml 只有 1 个 zip entry: ${arm64YmlParsed.files.length}`)
assert(arm64YmlParsed.files[0].url.includes('arm64'), 'arm64 yml entry URL 含 arm64')

// x64 构建的 installer 文件
const x64InstallerFiles = [x64Zip, x64Dmg]
const x64Ymls = generatePerPlatformYml(VERSION, x64InstallerFiles, PUBLIC_URL)

assert('latest-mac-x64.yml' in x64Ymls, 'x64 生成 latest-mac-x64.yml')
assert(!('latest-mac.yml' in x64Ymls), 'x64 不生成 latest-mac.yml（由 combined 函数负责）')
assert(!('latest-mac-arm64.yml' in x64Ymls), 'x64 不生成 latest-mac-arm64.yml')

// ─── 测试 3：合并 yml 生成（模拟 CI 流程） ──────────────────────────────────

console.log('\n═══ 测试 3：合并 yml 生成（CI 流程模拟） ═══')

// 场景 A：arm64 先构建，R2 上还没有 x64 yml
console.log('\n  --- 场景 A：arm64 先构建 ---')
const combinedAfterArm64 = generateCombinedMacYml(VERSION, arm64InstallerFiles, {}, PUBLIC_URL)
const parsedA = parseYml(combinedAfterArm64)
assert(parsedA.files.length === 1, `arm64 先完成时只有 1 个 entry: ${parsedA.files.length}`)
assert(parsedA.files[0].url.includes('arm64'), 'entry 是 arm64')

// 场景 B：x64 后构建，R2 上有 arm64 的 latest-mac-arm64.yml
console.log('\n  --- 场景 B：x64 后构建，R2 有 arm64 yml ---')
const combinedAfterX64 = generateCombinedMacYml(
  VERSION,
  x64InstallerFiles,
  { 'latest-mac-arm64.yml': arm64Ymls['latest-mac-arm64.yml'] },  // 模拟从 R2 读取
  PUBLIC_URL,
)
const parsedB = parseYml(combinedAfterX64)
assert(parsedB.files.length === 2, `x64 完成后有 2 个 entries: ${parsedB.files.length}`)

const hasArm64 = parsedB.files.some(f => f.url.includes('arm64'))
const hasX64 = parsedB.files.some(f => f.url.includes('x64'))
assert(hasArm64, '合并后包含 arm64 entry')
assert(hasX64, '合并后包含 x64 entry')

// 场景 C：完整模式（distDir 同时有两个架构）
console.log('\n  --- 场景 C：完整模式（两个架构同时可用） ---')
const allFiles = [arm64Zip, arm64Dmg, x64Zip, x64Dmg]
const combinedFull = generateCombinedMacYml(VERSION, allFiles, {}, PUBLIC_URL)
const parsedC = parseYml(combinedFull)
assert(parsedC.files.length === 2, `完整模式有 2 个 entries: ${parsedC.files.length}`)
assert(parsedC.files.some(f => f.url.includes('arm64')), '完整模式包含 arm64')
assert(parsedC.files.some(f => f.url.includes('x64')), '完整模式包含 x64')

// ─── 测试 4：electron-updater MacUpdater 文件选择 ────────────────────────────

console.log('\n═══ 测试 4：electron-updater MacUpdater 文件选择 ═══')

// 用合并后的 yml 解析出的 files 来模拟
const combinedFiles = parsedB.files.map(f => ({ url: new URL(f.url), info: f }))

// ARM64 Mac 客户端
console.log('\n  --- ARM64 Mac 客户端 ---')
const arm64Selected = simulateMacUpdaterFileSelection([...combinedFiles], true)
assert(arm64Selected.length === 1, `ARM64 Mac 选中 1 个文件: ${arm64Selected.length}`)
assert(arm64Selected[0].url.pathname.includes('arm64'), `ARM64 Mac 选中 arm64 文件: ${arm64Selected[0].url.pathname.slice(-30)}`)

// x64 Mac 客户端
console.log('\n  --- x64 Mac 客户端 ---')
const x64Selected = simulateMacUpdaterFileSelection([...combinedFiles], false)
assert(x64Selected.length === 1, `x64 Mac 选中 1 个文件: ${x64Selected.length}`)
assert(x64Selected[0].url.pathname.includes('x64'), `x64 Mac 选中 x64 文件: ${x64Selected[0].url.pathname.slice(-30)}`)

// ─── 测试 5：旧版 Bug 复现（只有 x64 entry 时 ARM Mac 的行为） ─────────────

console.log('\n═══ 测试 5：旧版 Bug 复现 ═══')

// 旧版 latest-mac.yml 只有 x64
const oldBrokenYml = `version: 0.2.5-beta.25
files:
  - url: https://openloaf-update.hexems.com/desktop/0.2.5-beta.25/OpenLoaf-0.2.5-beta.25-MacOS-x64.zip
    sha512: x64sha512==
    size: 298127458
path: https://openloaf-update.hexems.com/desktop/0.2.5-beta.25/OpenLoaf-0.2.5-beta.25-MacOS-x64.zip
sha512: x64sha512==
releaseDate: '2026-03-20T19:22:04.845Z'`

const oldParsed = parseYml(oldBrokenYml)
const oldFiles = oldParsed.files.map(f => ({ url: new URL(f.url), info: f }))

// ARM64 Mac 读到只有 x64 的 yml
const oldArm64Selected = simulateMacUpdaterFileSelection([...oldFiles], true)
assert(
  oldArm64Selected.length === 1 && oldArm64Selected[0].url.pathname.includes('x64'),
  `【BUG 复现】旧版 ARM64 Mac 被迫下载 x64: ${oldArm64Selected[0]?.url?.pathname?.slice(-30) ?? 'none'}`
)

// 修复后：合并 yml 有两个 entries
const fixedFiles = parsedB.files.map(f => ({ url: new URL(f.url), info: f }))
const fixedArm64Selected = simulateMacUpdaterFileSelection([...fixedFiles], true)
assert(
  fixedArm64Selected.length === 1 && fixedArm64Selected[0].url.pathname.includes('arm64'),
  `【修复验证】新版 ARM64 Mac 正确选择 arm64: ${fixedArm64Selected[0]?.url?.pathname?.slice(-30) ?? 'none'}`
)

// ─── 测试 6：去重验证 ─────────────────────────────────────────────────────────

console.log('\n═══ 测试 6：entries 去重验证 ═══')

// 如果 distDir 已有文件，R2 也返回相同 URL，不应重复
const combinedWithDuplicate = generateCombinedMacYml(
  VERSION,
  [arm64Zip, x64Zip],
  {
    'latest-mac-arm64.yml': arm64Ymls['latest-mac-arm64.yml'],
    'latest-mac-x64.yml': x64Ymls['latest-mac-x64.yml'],
  },
  PUBLIC_URL,
)
const parsedDedup = parseYml(combinedWithDuplicate)
assert(parsedDedup.files.length === 2, `去重后仍然只有 2 个 entries: ${parsedDedup.files.length}`)

// ─── 测试 7：版本不匹配时不合并远程 entries ────────────────────────────────

console.log('\n═══ 测试 7：版本不匹配过滤 ═══')

const oldVersionYml = `version: 0.2.5-beta.24
files:
  - url: https://cdn/old-arm64.zip
    sha512: old==
    size: 100
path: https://cdn/old-arm64.zip
sha512: old==
releaseDate: '2026-03-19T00:00:00.000Z'`

const combinedWithOldRemote = generateCombinedMacYml(
  VERSION,
  [x64Zip],
  { 'latest-mac-arm64.yml': oldVersionYml },  // 旧版本的 yml
  PUBLIC_URL,
)
const parsedOldRemote = parseYml(combinedWithOldRemote)
assert(parsedOldRemote.files.length === 1, `旧版本远程 yml 被忽略，只有 1 个 entry: ${parsedOldRemote.files.length}`)
assert(parsedOldRemote.files[0].url.includes('x64'), '只保留当前版本的 x64 entry')

// ─── 测试 8：验证线上 R2 的 yml 可被正确解析 ──────────────────────────────────

console.log('\n═══ 测试 8：线上 R2 yml 解析验证 ═══')

try {
  const arm64Resp = await fetch('https://openloaf-update.hexems.com/desktop/beta/latest-mac-arm64.yml')
  if (arm64Resp.ok) {
    const arm64Text = await arm64Resp.text()
    const arm64RemoteParsed = parseYml(arm64Text)
    assert(arm64RemoteParsed !== null, '线上 latest-mac-arm64.yml 可解析')
    assert(arm64RemoteParsed.files.length >= 1, `线上 arm64 yml 有 ${arm64RemoteParsed.files.length} 个 entry`)
    assert(arm64RemoteParsed.files[0].url.includes('arm64'), '线上 arm64 yml entry 确实含 arm64')
  } else {
    console.log('  ⚠️  线上 latest-mac-arm64.yml 无法访问，跳过')
  }

  const macResp = await fetch('https://openloaf-update.hexems.com/desktop/beta/latest-mac.yml')
  if (macResp.ok) {
    const macText = await macResp.text()
    const macRemoteParsed = parseYml(macText)
    assert(macRemoteParsed !== null, '线上 latest-mac.yml 可解析')
    console.log(`  ℹ️  当前线上 latest-mac.yml 有 ${macRemoteParsed.files.length} 个 entry（修复后应为 2）`)
    if (macRemoteParsed.files.length === 1) {
      const isX64Only = macRemoteParsed.files[0].url.includes('x64')
      assert(isX64Only, '【确认 Bug】当前线上 latest-mac.yml 只有 x64 entry（这就是 Bug！）')
    }
  }
} catch (e) {
  console.log(`  ⚠️  网络请求失败，跳过线上验证: ${e.message}`)
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('\n⚠️  有测试失败！请检查上述 ❌ 标记的项目。')
  process.exit(1)
} else {
  console.log('\n🎉 所有测试通过！修复方案验证成功。')
  console.log('\n修复要点回顾:')
  console.log('  1. electron-updater GenericProvider 在 macOS 上只读 latest-mac.yml')
  console.log('  2. latest-mac.yml 必须同时包含 arm64 + x64 entries')
  console.log('  3. MacUpdater 通过 URL 中的 "arm64" 关键字自动选择正确架构')
  console.log('  4. generateCombinedMacYml() 在每次 mac 平台构建后合并两个架构')
}
