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
import { VARIANT_FIXTURES } from './fixtures'

/** 辅助：获取某个 variant 前缀的所有 fixture */
function fixturesFor(variantPrefix: string) {
  return Object.entries(VARIANT_FIXTURES)
    .filter(([key]) => key.startsWith(variantPrefix))
    .map(([key, f]) => ({ key, ...f }))
}

describe('Layer 2: Variant inputs/params 键名正确性', () => {
  // ── 本次修复重点 ──

  describe('OL-VG-003 即梦视频：prompt 必须在 params', () => {
    for (const f of fixturesFor('OL-VG-003')) {
      it(f.label, () => {
        expect(f.params).toHaveProperty('prompt')
        expect(f.inputs).not.toHaveProperty('prompt')
      })
    }
  })

  describe('OL-LS-001 口型同步：输入键必须是 video', () => {
    for (const f of fixturesFor('OL-LS-001')) {
      it(f.label, () => {
        expect(f.inputs).toHaveProperty('video')
        expect(f.inputs).not.toHaveProperty('person')
      })
    }
  })

  describe('OL-FS-001/002 换脸：params 必须有 mode', () => {
    for (const f of fixturesFor('OL-FS-00')) {
      it(f.label, () => {
        expect(f.params).toHaveProperty('mode')
        expect(['wan-std', 'wan-pro']).toContain(f.params.mode)
      })
    }
  })

  describe('OL-IE-001 图编 wan：有 enable_interleave', () => {
    for (const f of fixturesFor('OL-IE-001')) {
      it(f.label, () => {
        expect(f.params).toHaveProperty('enable_interleave')
        expect(f.params).not.toHaveProperty('mask')
      })
    }
  })

  describe('OL-IE-002 图编 plus：无 enable_interleave', () => {
    for (const f of fixturesFor('OL-IE-002')) {
      it(f.label, () => {
        expect(f.params).not.toHaveProperty('enable_interleave')
      })
    }
  })

  describe('OL-IG-005/006 即梦文生图：prompt 在 params', () => {
    for (const f of [...fixturesFor('OL-IG-005'), ...fixturesFor('OL-IG-006')]) {
      it(f.label, () => {
        expect(f.params).toHaveProperty('prompt')
        expect(f.inputs).not.toHaveProperty('prompt')
      })
    }
  })

  describe('OL-UP-001 超清：scale 是字符串', () => {
    for (const f of fixturesFor('OL-UP-001')) {
      it(f.label, () => {
        expect(typeof f.params.scale).toBe('string')
        expect(['4K', '8K']).toContain(f.params.scale)
      })
    }
  })

  // ── 通用约束 ──

  describe('所有 fixture 必须有 feature 和 variant', () => {
    for (const [key, f] of Object.entries(VARIANT_FIXTURES)) {
      it(key, () => {
        expect(f.feature).toBeTruthy()
        expect(f.variant).toMatch(/^OL-[A-Z]{2}-\d{3}$/)
      })
    }
  })

  describe('count 必须是 1/2/4', () => {
    for (const [key, f] of Object.entries(VARIANT_FIXTURES)) {
      if (f.count != null) {
        it(key, () => {
          expect([1, 2, 4]).toContain(f.count)
        })
      }
    }
  })
})
