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
 * One-shot migration: move user-global memory and agent definitions out of
 * the hidden `~/.openloaf/` config dir into the user-visible temp-storage dir
 * (e.g. `~/OpenLoafData/`). Runs at server startup, idempotent.
 *
 * Scope (global only — project-scoped `<projectRoot>/.openloaf/` is untouched):
 *   ~/.openloaf/memory/  →  <tempStorage>/memory/
 *   ~/.openloaf/agents/  →  <tempStorage>/agents/
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { getResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'
import { logger } from '@/common/logger'

type MigratePair = {
  src: string
  dest: string
  label: string
}

/** Ignore sentinel files that shouldn't block "empty dir" cleanup. */
const IGNORABLE_LEFTOVERS = new Set<string>(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

/** Move one entry — fall back to recursive copy + delete if renameSync hits EXDEV. */
function moveEntry(srcPath: string, destPath: string): void {
  try {
    renameSync(srcPath, destPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== 'EXDEV') throw err
    // Source/dest on different filesystems — copy then delete.
    cpSync(srcPath, destPath, { recursive: true, errorOnExist: true, force: false })
    rmSync(srcPath, { recursive: true, force: true })
  }
}

/** Merge-move: move each entry from src into dest; conflicts are logged and skipped. */
function mergeMoveDir(pair: MigratePair): number {
  const { src, dest, label } = pair
  if (!existsSync(src)) return 0
  let moved = 0
  try {
    mkdirSync(dest, { recursive: true })
    const entries = readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      if (IGNORABLE_LEFTOVERS.has(entry.name)) continue
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (existsSync(destPath)) {
        // Conflict: target already has an entry with this name. Keep dest
        // untouched (user may have newer data there) and warn so they can
        // reconcile manually.
        logger.warn(
          { srcPath, destPath },
          `[migrate:${label}] dest already exists, skipping source — reconcile manually`,
        )
        continue
      }
      try {
        moveEntry(srcPath, destPath)
        moved++
      } catch (err) {
        logger.warn({ err, srcPath, destPath }, `[migrate:${label}] move failed`)
      }
    }
    // Clean up empty src dir (ignore if still has leftovers beyond sentinel files).
    try {
      const remaining = readdirSync(src).filter((n) => !IGNORABLE_LEFTOVERS.has(n))
      if (remaining.length === 0) {
        rmSync(src, { recursive: true, force: true })
      }
    } catch {
      /* ignore */
    }
  } catch (err) {
    logger.warn({ err, src, dest }, `[migrate:${label}] failed`)
  }
  return moved
}

/**
 * Ensure legacy global memory + agents live under the resolved temp-storage dir.
 * Call this from server bootstrap after `setResolvedTempStorageDir()`.
 */
export function migrateGlobalDataToTempStorage(): void {
  const legacyRoot = path.join(homedir(), '.openloaf')
  const tempRoot = getResolvedTempStorageDir()
  if (path.resolve(legacyRoot) === path.resolve(tempRoot)) {
    // Nothing to do — user has configured temp-storage to the legacy location.
    return
  }

  const pairs: MigratePair[] = [
    {
      src: path.join(legacyRoot, 'memory'),
      dest: path.join(tempRoot, 'memory'),
      label: 'memory',
    },
    {
      src: path.join(legacyRoot, 'agents'),
      dest: path.join(tempRoot, 'agents'),
      label: 'agents',
    },
  ]

  for (const pair of pairs) {
    const moved = mergeMoveDir(pair)
    if (moved > 0) {
      logger.info(
        { src: pair.src, dest: pair.dest, moved },
        `[migrate:${pair.label}] moved ${moved} entr${moved === 1 ? 'y' : 'ies'} to temp-storage`,
      )
    }
  }
}
