/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import fs from 'node:fs/promises'

/** Cap a single readOutputIncremental call at 1 MiB so the AI can't accidentally
 *  blow its context window reading a multi-gig shell log in one shot. */
const MAX_READ_BYTES = 1024 * 1024

export type IncrementalRead = {
  content: string
  newOffset: number
  /** File size at the time of read — lets callers detect truncation. */
  totalSize: number
  /** True if more data was available after the capped slice. */
  truncated: boolean
}

/**
 * Read bytes [fromOffset, min(totalSize, fromOffset+MAX_READ_BYTES)) from a
 * background task output file. Returns empty content if nothing new.
 *
 * Offsets are byte-based, not line-based — the caller is expected to stash
 * the returned `newOffset` back onto the BgTaskState for the next poll.
 */
export async function readOutputIncremental(
  outputPath: string,
  fromOffset: number,
): Promise<IncrementalRead> {
  let stats
  try {
    stats = await fs.stat(outputPath)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { content: '', newOffset: fromOffset, totalSize: 0, truncated: false }
    }
    throw err
  }

  const totalSize = stats.size
  if (totalSize <= fromOffset) {
    return { content: '', newOffset: fromOffset, totalSize, truncated: false }
  }

  const available = totalSize - fromOffset
  const toRead = Math.min(available, MAX_READ_BYTES)
  const buffer = Buffer.alloc(toRead)

  const handle = await fs.open(outputPath, 'r')
  try {
    await handle.read(buffer, 0, toRead, fromOffset)
  } finally {
    await handle.close().catch(() => {})
  }

  return {
    content: buffer.toString('utf-8'),
    newOffset: fromOffset + toRead,
    totalSize,
    truncated: toRead < available,
  }
}
