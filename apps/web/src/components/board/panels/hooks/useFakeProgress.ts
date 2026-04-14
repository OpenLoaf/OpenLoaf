/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useState } from 'react'

type UseFakeProgressOptions = {
  /** When true, the fake progress counter runs; false resets to 0. */
  running: boolean
  /**
   * Target duration in milliseconds. Progress ramps linearly from 0 to 99
   * across this interval. When undefined or <= 0, the hook stays at 0.
   */
  durationMs: number | undefined
}

const TICK_INTERVAL_MS = 200
const MAX_PROGRESS = 99

/**
 * Drive a fake 0–99% progress counter based on a target duration. Used to
 * give the user a visual sense of wait time when the real task has no
 * server-reported progress. Caps at 99% so the final jump to 100 happens
 * only when the caller flips `running` to false.
 */
export function useFakeProgress({ running, durationMs }: UseFakeProgressOptions): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!running || !durationMs || durationMs <= 0) {
      setProgress(0)
      return
    }
    const startedAt = Date.now()
    setProgress(0)
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const next = Math.min(MAX_PROGRESS, Math.floor((elapsed / durationMs) * 100))
      setProgress(next)
    }, TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [running, durationMs])

  return progress
}
