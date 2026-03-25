/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Wrapper script for electron-builder that dynamically sets extraMetadata.main
 * based on the host architecture.
 *
 * electron-forge webpack plugin outputs to `.webpack/{arch}/main/index.js`
 * (e.g. arm64, x64), so the `main` field in the asar package.json must match.
 *
 * Usage (from pnpm scripts):
 *   node scripts/dist.mjs [electron-builder flags...]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 提前加载 .env，使后续 process.env 检查（如 APPLE_TEAM_ID）能读到值
// 脚本由 pnpm 从 apps/desktop/ 目录执行，.env 在当前工作目录
const dotenvPath = path.resolve('.env')
if (fs.existsSync(dotenvPath)) {
  for (const line of fs.readFileSync(dotenvPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    // 不覆盖已有的环境变量
    if (process.env[key] == null) {
      process.env[key] = val
    }
  }
}

// --arch=x64 支持：覆盖宿主架构，用于在 Apple Silicon 上交叉编译 x64 版本
const archArg = process.argv.find((a) => a.startsWith('--arch='))
const arch = archArg ? archArg.split('=')[1] : os.arch()
const mainPath = `.webpack/${arch}/main/index.js`

// --beta[=N] 支持：临时将版本号改为 x.y.z-beta.N 进行打包（用于本地测试自动更新）
// 例：node scripts/dist.mjs --mac --beta     → x.y.z-beta.1
//     node scripts/dist.mjs --mac --beta=2   → x.y.z-beta.2
const betaArg = process.argv.find((a) => a === '--beta' || a.startsWith('--beta='))
let originalVersion = null
if (betaArg) {
  const betaNum = betaArg.includes('=') ? betaArg.split('=')[1] : '1'
  const pkgPath = path.resolve('package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  originalVersion = pkg.version
  // 去掉已有的 prerelease 标签再拼接
  const baseVersion = pkg.version.replace(/-.*$/, '')
  pkg.version = `${baseVersion}-beta.${betaNum}`
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  console.log(`[dist] Beta mode: version ${originalVersion} → ${pkg.version}`)
  // 打包结束后恢复（注册 exit hook）
  process.on('exit', () => {
    pkg.version = originalVersion
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    console.log(`[dist] Restored version → ${originalVersion}`)
  })
}

if (process.platform === 'win32' && process.env.CSC_IDENTITY_AUTO_DISCOVERY == null) {
  const hasCodeSignEnv = Boolean(
    process.env.CSC_LINK ||
      process.env.WIN_CSC_LINK ||
      process.env.CSC_KEY_PASSWORD ||
      process.env.SIGNTOOL_PATH
  )
  if (!hasCodeSignEnv) {
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
}

function canCreateSymlink() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'openloaf-symlink-'))
  const target = path.join(base, 'target.txt')
  const link = path.join(base, 'link.txt')
  try {
    fs.writeFileSync(target, 'x')
    fs.symlinkSync(target, link)
    return true
  } catch {
    return false
  } finally {
    try {
      fs.rmSync(base, { recursive: true, force: true })
    } catch {}
  }
}

// 跨平台编译（macOS/Linux → Windows）时的处理：
// - 签名：非 Windows 宿主无 signtool，必须跳过
// - 图标嵌入 (rcedit)：非 Windows 宿主需要 wine，默认也跳过
//   设置 OPENLOAF_RCEDIT=true 可在安装了 wine 的环境中启用 rcedit（仅嵌入图标，不签名）
if (process.env.OPENLOAF_REQUIRE_WIN_SIGN !== 'true' && process.env.OPENLOAF_SKIP_WIN_SIGN == null) {
  if (process.platform !== 'win32') {
    process.env.OPENLOAF_SKIP_WIN_SIGN = 'true'
  } else if (!canCreateSymlink()) {
    process.env.OPENLOAF_SKIP_WIN_SIGN = 'true'
  }
}

const extraFlags = []
const isWinTarget = process.argv.some((arg) => arg === '--win' || arg.startsWith('--win='))
if (process.env.OPENLOAF_SKIP_WIN_SIGN === 'true' && isWinTarget) {
  // Windows 原生构建或 CI：signAndEditExecutable 保持默认 true（rcedit 正常嵌入图标）
  // 非 Windows 宿主：跳过 rcedit（避免 wine 依赖），除非显式设置 OPENLOAF_RCEDIT=true
  if (process.platform !== 'win32' && process.env.OPENLOAF_RCEDIT !== 'true') {
    extraFlags.push('--config.win.signAndEditExecutable=false')
  }
}

const isMacTarget = process.argv.some((arg) => arg === '--mac' || arg.startsWith('--mac='))
if (isMacTarget) {
  const icnsPath = path.resolve('resources', 'icon.icns')
  if (fs.existsSync(icnsPath)) {
    extraFlags.push(`--config.mac.icon=${icnsPath}`)
  }
  // DMG 背景图使用绝对路径，避免 monorepo 下 projectDir 解析错误
  const dmgBgPath = path.resolve('resources', 'dmg-background.png')
  if (fs.existsSync(dmgBgPath)) {
    extraFlags.push(`--config.dmg.background=${dmgBgPath}`)
  }
  // electron-builder 在 arm64 上错误地强制 APFS（#4606），而 APFS DMG 不支持背景图。
  // 实际上 Apple Silicon 的 hdiutil 仍然支持 HFS+，这里 patch 回 HFS+。
  const dmgJs = path.resolve('..', '..', 'node_modules', 'dmg-builder', 'out', 'dmg.js')
  if (fs.existsSync(dmgJs)) {
    let code = fs.readFileSync(dmgJs, 'utf-8')
    if (code.includes('process.arch === "arm64"')) {
      code = code.replace(
        /if \(process\.arch === "arm64"\) \{[^}]+\}/,
        '/* patched: force HFS+ on arm64 for DMG background support */'
      )
      fs.writeFileSync(dmgJs, code)
      console.log('[dist] Patched dmg-builder to use HFS+ on arm64 (APFS does not support background images)')
    }
  }
  // CI 环境下传递公证配置，避免 electron-builder 因缺少 notarize 选项而报错
  if (process.env.APPLE_TEAM_ID) {
    extraFlags.push(`--config.mac.notarize.teamId=${process.env.APPLE_TEAM_ID}`)
  }
}

if (isWinTarget) {
  const icoPath = path.resolve('resources', 'icon.ico')
  if (fs.existsSync(icoPath)) {
    extraFlags.push(`--config.win.icon=${icoPath}`)
  }
}

// 禁止 electron-builder 自动发布（检测到 git tag 时会尝试）。
// 发布由 CI workflow 的独立 job（publish-to-r2、create-release）处理。
const hasPublishFlag = process.argv.some((arg) => arg === '--publish' || arg.startsWith('--publish='))

const args = [
  'exec', 'dotenv', '-e', '.env', '--',
  'electron-builder',
  `--config.extraMetadata.main=${mainPath}`,
  '--config.afterPack=./scripts/afterPack.js',
  ...(hasPublishFlag ? [] : ['--publish=never']),
  ...extraFlags,
  ...process.argv.slice(2).filter((a) => a !== '--beta' && !a.startsWith('--beta=') && !a.startsWith('--arch=')),
]

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

console.log(`[dist] arch=${arch}, main=${mainPath}`)
console.log(`[dist] ${pnpmBin} ${args.join(' ')}`)

// .cmd files on Windows must be invoked via cmd.exe (shell:true).
execFileSync(pnpmBin, args, { stdio: 'inherit', shell: process.platform === 'win32' })

// macOS DMG 背景图后处理：
// macOS Tahoe+ 的 Finder 不再通过 DS_Store alias 渲染 DMG 背景图，
// 必须用 AppleScript 挂载后直接设置 Finder 窗口属性，再重新封装。
if (isMacTarget && process.platform === 'darwin') {
  const dmgBgPath = path.resolve('resources', 'dmg-background.png')
  if (fs.existsSync(dmgBgPath)) {
    const distDir = path.resolve('dist')
    const dmgFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.dmg') && !f.endsWith('.blockmap'))
    for (const dmgFile of dmgFiles) {
      const dmgPath = path.join(distDir, dmgFile)
      const rwDmg = path.join(os.tmpdir(), `openloaf-rw-${Date.now()}.dmg`)
      try {
        console.log(`[dist] Applying DMG background via AppleScript: ${dmgFile}`)

        // 1. 转为可读写格式
        execFileSync('hdiutil', ['convert', dmgPath, '-format', 'UDRW', '-o', rwDmg], { stdio: 'inherit' })

        // 2. 挂载
        const attachOut = execFileSync('hdiutil', ['attach', rwDmg, '-noverify'], { encoding: 'utf-8' })
        const volMatch = attachOut.match(/\/Volumes\/.+/)
        if (!volMatch) {
          console.error('[dist] Failed to find volume path from hdiutil attach output')
          continue
        }
        const volPath = volMatch[0].trim()
        const volName = path.basename(volPath)

        // 3. 读取 DMG 配置
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
        const dmgCfg = pkg.build?.dmg || {}
        const contents = dmgCfg.contents || []
        const appEntry = contents.find((c) => !c.type || c.type !== 'link') || { x: 150, y: 240 }
        const linkEntry = contents.find((c) => c.type === 'link') || { x: 390, y: 240 }
        const winCfg = dmgCfg.window || {}
        const winW = winCfg.width || 540
        const winH = winCfg.height || 380
        const iconSize = dmgCfg.iconSize || 80
        const iconTextSize = dmgCfg.iconTextSize || 14
        const productName = pkg.build?.productName || pkg.productName || 'OpenLoaf'

        // 4. 用 AppleScript 设置 Finder 窗口属性
        const script = `
tell application "Finder"
  tell disk "${volName}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {100, 100, ${100 + winW}, ${100 + winH}}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to ${iconSize}
    set text size of viewOptions to ${iconTextSize}
    set background picture of viewOptions to file ".background:1.tiff"
    set position of item "${productName}.app" of container window to {${appEntry.x}, ${appEntry.y}}
    set position of item "Applications" of container window to {${linkEntry.x}, ${linkEntry.y}}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell`
        execFileSync('osascript', ['-e', script], { stdio: 'inherit', timeout: 30000 })

        // 5. 卸载
        execFileSync('hdiutil', ['detach', volPath], { stdio: 'inherit' })

        // 6. 重新转为只读压缩格式，覆盖原 DMG
        fs.unlinkSync(dmgPath)
        execFileSync('hdiutil', ['convert', rwDmg, '-format', 'UDZO', '-o', dmgPath], { stdio: 'inherit' })

        console.log(`[dist] DMG background applied: ${dmgFile}`)
      } catch (err) {
        console.error(`[dist] Failed to apply DMG background: ${err.message}`)
      } finally {
        try { fs.unlinkSync(rwDmg) } catch {}
      }
    }
  }
}
