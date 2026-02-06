import fs from 'node:fs'
import path from 'node:path'
import { getTenasRootDir } from '@tenas-ai/config'

/**
 * 增量更新文件的本地存放根目录。
 * 更新文件不能放在已签名的 .app 内，因此统一存放到 ~/.tenas/updates/。
 */
export function getUpdatesRoot(): string {
  return path.join(getTenasRootDir(), 'updates')
}

/**
 * 解析 server.mjs 的实际路径：
 * 1. 优先使用增量更新目录下的版本
 * 2. 回退到打包在 Resources 目录中的版本
 */
export function resolveServerPath(): string {
  const updatedPath = path.join(getUpdatesRoot(), 'server', 'current', 'server.mjs')
  if (fs.existsSync(updatedPath)) {
    return updatedPath
  }
  return path.join(process.resourcesPath, 'server.mjs')
}

/**
 * 解析 web 静态文件根目录：
 * 1. 优先使用增量更新目录下的版本（需验证 index.html 存在）
 * 2. 回退到打包在 Resources 目录中的版本
 */
export function resolveWebRoot(): string {
  const updatedRoot = path.join(getUpdatesRoot(), 'web', 'current', 'out')
  const indexPath = path.join(updatedRoot, 'index.html')
  if (fs.existsSync(indexPath)) {
    return updatedRoot
  }
  return path.join(process.resourcesPath, 'out')
}
