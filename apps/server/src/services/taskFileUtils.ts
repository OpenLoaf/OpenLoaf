/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { writeFileSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/**
 * Write a file atomically: write to a temp file first, then rename.
 * This prevents data corruption from incomplete writes.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  writeFileSync(tmpPath, content, 'utf8')
  renameSync(tmpPath, filePath)
}
