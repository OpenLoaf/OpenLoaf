/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import fs from 'node:fs'
import path from 'node:path'
import { getOpenLoafRootDir } from '@openloaf/config'
import { shouldUseBundled } from './incrementalUpdatePolicy'

/**
 * 增量更新文件的本地存放根目录。
 * 更新文件不能放在已签名的 .app 内，因此统一存放到 ~/.openloaf/updates/。
 */
export function getUpdatesRoot(): string {
  return path.join(getOpenLoafRootDir(), 'updates')
}

/** 读取 local-manifest.json 中指定组件的版本号。 */
function readLocalVersion(component: 'server' | 'web'): string | null {
  try {
    const manifestPath = path.join(getUpdatesRoot(), 'local-manifest.json')
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as Record<string, { version?: string }>
    return manifest[component]?.version ?? null
  } catch {
    return null
  }
}

/** 从打包的 package.json 读取组件版本号。 */
function readBundledVersion(component: 'server' | 'web'): string | null {
  try {
    const packagedName = component === 'server' ? 'server.package.json' : 'web.package.json'
    const packagedPath = path.join(process.resourcesPath, packagedName)
    if (!fs.existsSync(packagedPath)) return null
    const raw = fs.readFileSync(packagedPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version ?? null
  } catch {
    return null
  }
}

/**
 * 解析 server.mjs 的实际路径：
 * 1. 检查增量更新目录是否存在
 * 2. 比较版本号：如果打包版本更新，回退到打包版本
 * 3. 否则使用增量更新版本
 */
export function resolveServerPath(): string {
  const bundledPath = path.join(process.resourcesPath, 'server.mjs')
  const updatedPath = path.join(getUpdatesRoot(), 'server', 'current', 'server.mjs')

  if (fs.existsSync(updatedPath)) {
    // 版本比较：打包版本更新时回退到打包版本
    const bundledVersion = readBundledVersion('server')
    const updatedVersion = readLocalVersion('server')
    if (shouldUseBundled(bundledVersion, updatedVersion)) {
      return bundledPath
    }
    return updatedPath
  }
  return bundledPath
}

/**
 * 解析 web 静态文件根目录：
 * 1. 检查增量更新目录是否存在（需验证 index.html 存在）
 * 2. 比较版本号：如果打包版本更新，回退到打包版本
 * 3. 否则使用增量更新版本
 */
export function resolveWebRoot(): string {
  const bundledRoot = path.join(process.resourcesPath, 'out')
  const updatedRoot = path.join(getUpdatesRoot(), 'web', 'current', 'out')
  const indexPath = path.join(updatedRoot, 'index.html')

  if (fs.existsSync(indexPath)) {
    const bundledVersion = readBundledVersion('web')
    const updatedVersion = readLocalVersion('web')
    if (shouldUseBundled(bundledVersion, updatedVersion)) {
      return bundledRoot
    }
    return updatedRoot
  }
  return bundledRoot
}
