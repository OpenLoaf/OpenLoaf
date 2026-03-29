/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { useCallback, useState } from 'react'
import { cancelTask } from '@/lib/saas-media'

/**
 * Hook providing a cancel callback for in-progress generation tasks.
 * Returns `{ handleCancel, cancelling }` — pass these to GeneratingOverlay.
 */
export function useCancelGeneration(taskId: string | undefined) {
  const [cancelling, setCancelling] = useState(false)

  const handleCancel = useCallback(async () => {
    if (!taskId || cancelling) return
    setCancelling(true)
    try {
      await cancelTask(taskId)
    } catch (err) {
      console.warn('[useCancelGeneration] cancel failed:', err)
    } finally {
      setCancelling(false)
    }
  }, [taskId, cancelling])

  return { handleCancel, cancelling }
}
