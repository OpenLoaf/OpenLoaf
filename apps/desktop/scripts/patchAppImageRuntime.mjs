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
 * 用 type2-runtime 的静态 runtime 替换 electron-builder 产出 AppImage 的 runtime，
 * 消除对 libfuse2 的运行时依赖（Ubuntu 22.04+ / Debian 12+ 默认不再预装 libfuse2，
 * 用户双击 AppImage 会报 "AppImages require FUSE to run"）。
 *
 * AppImage Type 2 文件结构：
 *   [ELF runtime][squashfs filesystem]
 * runtime ELF 末尾 = e_shoff + e_shnum * e_shentsize，紧接其后就是 squashfs 镜像。
 * 静态 runtime 与原 runtime 的接口完全兼容（同样在自身末尾 mount squashfs），
 * 因此可以原样替换 runtime 段，squashfs payload 不变。
 *
 * 用法：
 *   node scripts/patchAppImageRuntime.mjs                    # patch dist/*.AppImage
 *   node scripts/patchAppImageRuntime.mjs path/to/x.AppImage # patch 指定文件
 */
import fs from 'node:fs'
import path from 'node:path'

const RUNTIME_URLS = {
  // e_machine → type2-runtime release asset URL
  0x3e: 'https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64',
  0xb7: 'https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-aarch64',
}

function readElfRuntimeSize(buf) {
  // ELF magic 检查
  if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
    throw new Error('Not an ELF file (magic mismatch)')
  }
  const eiClass = buf[4] // 1 = ELF32, 2 = ELF64
  if (eiClass !== 2) {
    throw new Error(`Only ELF64 supported, got ei_class=${eiClass}`)
  }
  // ELF64 header layout
  const eMachine = buf.readUInt16LE(18)
  const eShoff = Number(buf.readBigUInt64LE(40))
  const eShentsize = buf.readUInt16LE(58)
  const eShnum = buf.readUInt16LE(60)
  return { runtimeSize: eShoff + eShnum * eShentsize, eMachine }
}

async function downloadRuntime(url) {
  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`)
  const ab = await resp.arrayBuffer()
  return Buffer.from(ab)
}

async function patchAppImage(filePath) {
  const name = path.basename(filePath)
  const original = fs.readFileSync(filePath)
  const { runtimeSize, eMachine } = readElfRuntimeSize(original)

  // 校验 squashfs 魔数 "hsqs" 位于计算出的 runtime 末尾
  const squashfsMagic = original.slice(runtimeSize, runtimeSize + 4)
  if (squashfsMagic.toString('hex') !== '68737173') {
    throw new Error(
      `${name}: squashfs magic "hsqs" not found at offset ${runtimeSize} ` +
        `(found ${squashfsMagic.toString('hex')}). AppImage layout unexpected; abort.`
    )
  }

  const runtimeUrl = RUNTIME_URLS[eMachine]
  if (!runtimeUrl) {
    throw new Error(`${name}: unsupported e_machine 0x${eMachine.toString(16)}`)
  }

  console.log(`[patch-appimage] ${name}`)
  console.log(`  e_machine = 0x${eMachine.toString(16)}, old runtime = ${runtimeSize} bytes`)
  console.log(`  downloading static runtime: ${runtimeUrl}`)
  const newRuntime = await downloadRuntime(runtimeUrl)
  console.log(`  new runtime = ${newRuntime.length} bytes`)

  // 校验新 runtime 也是 ELF（防止下载到 404 HTML）
  if (newRuntime[0] !== 0x7f || newRuntime[1] !== 0x45) {
    throw new Error('Downloaded runtime is not an ELF file')
  }

  const squashfs = original.slice(runtimeSize)
  const patched = Buffer.concat([newRuntime, squashfs])
  fs.writeFileSync(filePath, patched)
  fs.chmodSync(filePath, 0o755)

  const delta = patched.length - original.length
  const sign = delta >= 0 ? '+' : ''
  console.log(`  patched: ${original.length} → ${patched.length} bytes (${sign}${delta})`)
}

async function main() {
  const args = process.argv.slice(2)
  let targets
  if (args.length === 0) {
    const distDir = path.resolve('dist')
    if (!fs.existsSync(distDir)) {
      console.error('[patch-appimage] dist/ not found and no files specified')
      process.exit(1)
    }
    targets = fs
      .readdirSync(distDir)
      .filter((f) => f.endsWith('.AppImage'))
      .map((f) => path.join(distDir, f))
    if (targets.length === 0) {
      console.log('[patch-appimage] no .AppImage files found in dist/, nothing to do')
      return
    }
  } else {
    targets = args.map((f) => path.resolve(f))
  }

  for (const target of targets) {
    await patchAppImage(target)
  }
  console.log(`[patch-appimage] done (${targets.length} file${targets.length === 1 ? '' : 's'})`)
}

main().catch((err) => {
  console.error(`[patch-appimage] error: ${err.stack || err.message}`)
  process.exit(1)
})
