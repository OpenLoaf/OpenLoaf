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

import type { ResolvedSlotInputs } from '../variants/shared/InputSlotBar'
import type { PersistedSlotMap } from '../variants/slot-types'
import type { MediaReference } from '../variants/slot-types'
import type { VariantCacheReturn } from './useVariantCache'

export function useSlotHandlers(cache: VariantCacheReturn, cacheKey: string) {
  const [resolvedSlots, setResolvedSlots] = useState<Record<string, MediaReference[]>>({})
  const [slotsValid, setSlotsValid] = useState(true)

  const handleSlotInputsChange = useCallback(
    (resolved: ResolvedSlotInputs) => {
      setResolvedSlots(resolved.mediaRefs)
      setSlotsValid(resolved.isValid)
      if (cacheKey) {
        cache.update(cacheKey, { inputs: resolved.inputs })
      }
    },
    [cache, cacheKey],
  )

  const handleSlotAssignmentPersist = useCallback(
    (map: PersistedSlotMap) => {
      if (cacheKey) {
        cache.update(cacheKey, { slotAssignment: map })
      }
    },
    [cache, cacheKey],
  )

  const handleUserTextsChange = useCallback(
    (texts: Record<string, string>) => {
      if (cacheKey) {
        cache.update(cacheKey, { userTexts: texts })
      }
    },
    [cache, cacheKey],
  )

  return {
    resolvedSlots,
    slotsValid,
    handleSlotInputsChange,
    handleSlotAssignmentPersist,
    handleUserTextsChange,
  }
}
