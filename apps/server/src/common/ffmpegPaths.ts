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
 * FFmpeg / FFprobe 二进制路径解析与初始化。
 *
 * 优先使用打包的 npm 静态二进制（@ffmpeg-installer/ffmpeg、@ffprobe-installer/ffprobe），
 * 回退到系统 PATH 中的 ffmpeg/ffprobe。
 *
 * 在 server 启动时调用 `initFfmpegPaths()` 一次，之后所有 fluent-ffmpeg 调用
 * 自动使用已配置的路径。
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import ffmpeg from 'fluent-ffmpeg'
import { logger } from '@/common/logger'

let _ffmpegAvailable: boolean | null = null
let _ffprobeAvailable: boolean | null = null

/**
 * 尝试通过 require() 加载打包的二进制路径。
 * 使用 require 而非 import 以兼容 CJS 包在 ESM 中的加载。
 */
function tryLoadInstaller(packageName: string): string | null {
  try {
    // esbuild banner 提供了 createRequire shim，生产环境 require 可用。
    // 开发环境 tsx 也支持 require。
    const mod = require(packageName)
    const binPath: string | undefined = mod?.path
    if (binPath && existsSync(binPath)) return binPath
  } catch {
    // 包未安装或路径不存在
  }
  return null
}

/** 检查系统 PATH 中是否存在指定命令。 */
function isCommandInPath(command: string): boolean {
  try {
    execSync(`${command} -version`, { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * 初始化 ffmpeg 和 ffprobe 二进制路径。
 * 优先使用 npm 打包的静态二进制，回退到系统 PATH。
 * 应在 server 启动时调用一次。
 */
export function initFfmpegPaths(): void {
  // --- ffmpeg ---
  const bundledFfmpeg = tryLoadInstaller('@ffmpeg-installer/ffmpeg')
  if (bundledFfmpeg) {
    ffmpeg.setFfmpegPath(bundledFfmpeg)
    _ffmpegAvailable = true
    logger.info({ path: bundledFfmpeg }, '[ffmpeg] Using bundled ffmpeg')
  } else if (isCommandInPath('ffmpeg')) {
    _ffmpegAvailable = true
    logger.info('[ffmpeg] Using system ffmpeg from PATH')
  } else {
    _ffmpegAvailable = false
    logger.warn('[ffmpeg] ffmpeg not found (no bundled package, not in system PATH)')
  }

  // --- ffprobe ---
  const bundledFfprobe = tryLoadInstaller('@ffprobe-installer/ffprobe')
  if (bundledFfprobe) {
    ffmpeg.setFfprobePath(bundledFfprobe)
    _ffprobeAvailable = true
    logger.info({ path: bundledFfprobe }, '[ffmpeg] Using bundled ffprobe')
  } else if (isCommandInPath('ffprobe')) {
    _ffprobeAvailable = true
    logger.info('[ffmpeg] Using system ffprobe from PATH')
  } else {
    _ffprobeAvailable = false
    logger.warn('[ffmpeg] ffprobe not found (no bundled package, not in system PATH)')
  }
}

/** ffmpeg 是否可用（打包或系统）。 */
export function isFfmpegAvailable(): boolean {
  if (_ffmpegAvailable === null) initFfmpegPaths()
  return _ffmpegAvailable!
}

/** ffprobe 是否可用（打包或系统）。 */
export function isFfprobeAvailable(): boolean {
  if (_ffprobeAvailable === null) initFfmpegPaths()
  return _ffprobeAvailable!
}
