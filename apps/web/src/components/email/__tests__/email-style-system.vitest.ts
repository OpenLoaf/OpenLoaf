/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getStoredDensity,
  setStoredDensity,
  EMAIL_DENSITY_ROW_HEIGHT,
  EMAIL_DENSITY_TEXT_SIZE,
  type EmailDensity,
} from '../email-style-system'

describe('getStoredDensity', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('无存储值时返回 default', () => {
    expect(getStoredDensity()).toBe('default')
  })
  it('存储 compact 时返回 compact', () => {
    localStorage.setItem('openloaf-email-density', 'compact')
    expect(getStoredDensity()).toBe('compact')
  })
  it('存储 comfortable 时返回 comfortable', () => {
    localStorage.setItem('openloaf-email-density', 'comfortable')
    expect(getStoredDensity()).toBe('comfortable')
  })
  it('存储无效值时返回 default', () => {
    localStorage.setItem('openloaf-email-density', 'invalid')
    expect(getStoredDensity()).toBe('default')
  })
})

describe('setStoredDensity', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('存储 compact', () => {
    setStoredDensity('compact')
    expect(localStorage.getItem('openloaf-email-density')).toBe('compact')
  })
  it('存储 comfortable', () => {
    setStoredDensity('comfortable')
    expect(localStorage.getItem('openloaf-email-density')).toBe('comfortable')
  })
})

describe('DENSITY_CONFIG 结构', () => {
  const densities: EmailDensity[] = ['compact', 'default', 'comfortable']

  it('EMAIL_DENSITY_ROW_HEIGHT 包含所有密度', () => {
    for (const d of densities) {
      expect(EMAIL_DENSITY_ROW_HEIGHT[d]).toBeTruthy()
    }
  })
  it('EMAIL_DENSITY_TEXT_SIZE 包含所有密度', () => {
    for (const d of densities) {
      expect(EMAIL_DENSITY_TEXT_SIZE[d]).toBeTruthy()
    }
  })
  it('行高从 compact 到 comfortable 递增', () => {
    const extractHeight = (cls: string) => {
      const match = cls.match(/h-\[(\d+)px\]/)
      return match ? Number(match[1]) : 0
    }
    const compact = extractHeight(EMAIL_DENSITY_ROW_HEIGHT.compact)
    const def = extractHeight(EMAIL_DENSITY_ROW_HEIGHT.default)
    const comfortable = extractHeight(EMAIL_DENSITY_ROW_HEIGHT.comfortable)
    expect(compact).toBeLessThan(def)
    expect(def).toBeLessThan(comfortable)
  })
})
