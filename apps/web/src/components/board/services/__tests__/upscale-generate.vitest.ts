import { describe, expect, it } from 'vitest'

import { normalizeScale } from '../upscale-generate'

describe('normalizeScale — 超清 scale 参数规范化', () => {
  it('number 2 → "4K"', () => {
    expect(normalizeScale(2)).toBe('4K')
  })

  it('number 4 → "8K"', () => {
    expect(normalizeScale(4)).toBe('8K')
  })

  it('string "4K" 透传', () => {
    expect(normalizeScale('4K')).toBe('4K')
  })

  it('string "8K" 透传', () => {
    expect(normalizeScale('8K')).toBe('8K')
  })

  // 边界情况
  it('其他数字回退到 "4K"', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeScale(1 as any)
    expect(result).toBe('4K')
  })
})
