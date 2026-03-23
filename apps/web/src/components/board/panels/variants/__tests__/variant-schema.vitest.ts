/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { describe, expect, it } from 'vitest'
import { v3GenerateRequestSchema } from '@openloaf-saas/sdk'
import type { PersistedSlotMap } from '../slot-types'
import type { VariantParamsSnapshot } from '../types'
import { VARIANT_FIXTURES } from './fixtures'

describe('PersistedSlotMap type', () => {
  it('should be assignable with node IDs and manual refs', () => {
    const map: PersistedSlotMap = {
      image: 'node-id-123',
      mask: 'manual:assets/uploads/mask.png',
    }
    expect(map.image).toBe('node-id-123')
    expect(map.mask?.startsWith('manual:')).toBe(true)
  })

  it('should be storable in VariantParamsSnapshot', () => {
    const snapshot: VariantParamsSnapshot = {
      inputs: { image: { path: 'asset/img.jpg' } },
      params: { strength: 0.8 },
      slotAssignment: { image: 'node-123' },
    }
    expect(snapshot.slotAssignment).toBeDefined()
  })
})

describe('Layer 1: v3GenerateRequest Schema 校验', () => {
  for (const [key, fixture] of Object.entries(VARIANT_FIXTURES)) {
    it(`${fixture.label} (${key})`, () => {
      const payload = {
        feature: fixture.feature,
        variant: fixture.variant,
        inputs: Object.keys(fixture.inputs).length ? fixture.inputs : undefined,
        params: Object.keys(fixture.params).length ? fixture.params : undefined,
        ...(fixture.count != null ? { count: fixture.count } : {}),
        ...(fixture.seed != null ? { seed: fixture.seed } : {}),
      }
      const result = v3GenerateRequestSchema.safeParse(payload)
      if (!result.success) {
        // 打印详细错误便于调试
        console.error(`Schema 校验失败: ${key}`, JSON.stringify(result.error.issues, null, 2))
      }
      expect(result.success).toBe(true)
    })
  }
})
