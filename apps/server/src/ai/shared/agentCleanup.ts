/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { getOpenLoafRootDir, resolveScopedOpenLoafPath } from '@openloaf/config'
/** Migration version marker file. */
const MIGRATION_VERSION_FILE = '.agents-migration-version'
/** Minimum version that triggers path flattening migration. */
const MIN_FLATTEN_VERSION = '0.2.10'

/**
 * Migrate legacy nested paths to flattened structure:
 * - ~/.openloaf/agents/agents/* → ~/.openloaf/agents/*
 * - ~/.openloaf/agents/skills/* → ~/.openloaf/skills/*
 */
function migrateNestedPaths(rootPath: string): void {
  const agentsAgentsDir = path.join(rootPath, 'agents', 'agents')
  const agentsDir = path.join(rootPath, 'agents')
  const agentsSkillsDir = path.join(rootPath, 'agents', 'skills')
  const skillsDir = path.join(rootPath, 'skills')

  // 迁移 agents/agents/* → agents/*
  if (existsSync(agentsAgentsDir)) {
    try {
      const entries = readdirSync(agentsAgentsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const src = path.join(agentsAgentsDir, entry.name)
        const dest = path.join(agentsDir, entry.name)
        if (existsSync(dest)) continue
        renameSync(src, dest)
      }
      // 清理空目录
      const remaining = readdirSync(agentsAgentsDir)
      if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === '.DS_Store')) {
        rmSync(agentsAgentsDir, { recursive: true, force: true })
      }
    } catch {
      // 迁移失败时静默忽略。
    }
  }

  // 迁移 agents/skills/* → skills/*
  if (existsSync(agentsSkillsDir)) {
    mkdirSync(skillsDir, { recursive: true })
    try {
      const entries = readdirSync(agentsSkillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const src = path.join(agentsSkillsDir, entry.name)
        const dest = path.join(skillsDir, entry.name)
        if (existsSync(dest)) continue
        renameSync(src, dest)
      }
      // 清理空目录
      const remaining = readdirSync(agentsSkillsDir)
      if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === '.DS_Store')) {
        rmSync(agentsSkillsDir, { recursive: true, force: true })
      }
    } catch {
      // 迁移失败时静默忽略。
    }
  }
}

/**
 * Clean up legacy system agent folders and flatten nested paths.
 * Reads `.openloaf/.agents-migration-version` to determine if cleanup is needed.
 */
function cleanupLegacySystemAgents(rootPath: string): void {
  const metaDir = resolveScopedOpenLoafPath(rootPath)
  const versionFile = path.join(metaDir, MIGRATION_VERSION_FILE)

  // Check if already migrated.
  if (existsSync(versionFile)) {
    try {
      const existing = readFileSync(versionFile, 'utf8').trim()
      if (existing >= MIN_FLATTEN_VERSION) return
    } catch {
      // 读取失败则继续清理。
    }
  }

  // 扁平化嵌套路径。
  migrateNestedPaths(rootPath)

  // Write current server version as migration marker.
  try {
    const require = createRequire(import.meta.url)
    const version: string = require('../../package.json').version
    writeFileSync(versionFile, version, 'utf8')
  } catch {
    // 写入版本标记失败时静默忽略。
  }
}

/**
 * Ensure the global OpenLoaf directory has been migrated.
 * Called at server startup.
 */
export function ensureDefaultAgentCleanup(): void {
  try {
    const rootPath = getOpenLoafRootDir()
    cleanupLegacySystemAgents(rootPath)
  } catch {
    // 逻辑：启动时静默忽略，不影响服务启动。
  }
}
