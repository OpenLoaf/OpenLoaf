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
import { serializeForGenerate } from '../serialize'
import type { FormState, V3GenerateRequest } from '../serialize'
import type { MediaInput } from '../types'
import type {
  V3InputSlotDefinition,
  MultiSlotDefinition,
  TaskRefSlot,
  AnySlot,
} from '../slot-types'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeState(partial: Partial<FormState> = {}): FormState {
  return {
    paintResults: {},
    slotAssignments: {},
    taskRefs: {},
    params: {},
    ...partial,
  }
}

function imgSlot(
  role: string,
  extra: Partial<V3InputSlotDefinition> = {},
): V3InputSlotDefinition {
  return { role, label: role, accept: 'image', ...extra }
}

function multiSlot(
  role: string,
  max: number,
  extra: Partial<MultiSlotDefinition> = {},
): MultiSlotDefinition {
  return { kind: 'multi', role, label: role, accept: 'image', max, ...extra }
}

function taskRefSlot(role: string): TaskRefSlot {
  return { kind: 'taskRef', role, label: role }
}

const media = (p: string): MediaInput => ({ path: p })
const mediaUrl = (u: string): MediaInput => ({ url: u })

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('serializeForGenerate', () => {
  // 1. 纯文生图
  it('should serialize prompt-only (text-to-image)', () => {
    const slots: AnySlot[] = []
    const state = makeState({
      prompt: 'a cat',
      params: { style: 'anime' },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs).toEqual({ prompt: 'a cat' })
    expect(result.params).toEqual({ style: 'anime' })
  })

  // 2. 单个 pool 插槽
  it('should serialize single pool slot', () => {
    const slots: AnySlot[] = [imgSlot('image')]
    const state = makeState({
      slotAssignments: { image: [media('a.jpg')] },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.image).toEqual({ path: 'a.jpg' })
  })

  // 3. 多个 pool 插槽 (MultiSlot)
  it('should serialize multi pool slot as array', () => {
    const slots: AnySlot[] = [multiSlot('images', 3)]
    const state = makeState({
      slotAssignments: {
        images: [media('a.jpg'), media('b.jpg')],
      },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.images).toEqual([
      { path: 'a.jpg' },
      { path: 'b.jpg' },
    ])
  })

  // 4. mask 插槽从 paintResults 读取
  it('should serialize mask slot from paintResults', () => {
    const slots: AnySlot[] = [imgSlot('mask')]
    const state = makeState({
      paintResults: { mask: media('mask.png') },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.mask).toEqual({ path: 'mask.png' })
  })

  // 5. 混合源 (mask + pool)
  it('should serialize mixed sources (mask + pool)', () => {
    const slots: AnySlot[] = [
      imgSlot('mask'),
      imgSlot('extra'),
    ]
    const state = makeState({
      paintResults: { mask: media('mask.png') },
      slotAssignments: { extra: [media('extra.jpg')] },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.mask).toEqual({ path: 'mask.png' })
    expect(result.inputs.extra).toEqual({ path: 'extra.jpg' })
  })

  // 6. state.prompt 自动注入
  it('should inject state.prompt into inputs when inputs.prompt is empty', () => {
    const result = serializeForGenerate([], makeState({ prompt: 'auto injected' }))
    expect(result.inputs.prompt).toBe('auto injected')
  })

  // 7. 已有 prompt slot 不被 state.prompt 覆盖
  it('should not override existing inputs.prompt with state.prompt', () => {
    const slots: AnySlot[] = [
      { role: 'prompt', label: 'Prompt', accept: 'image' } as V3InputSlotDefinition,
    ]
    const state = makeState({
      prompt: 'should not override',
      slotAssignments: { prompt: [media('prompt-img.jpg')] },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.prompt).toEqual({ path: 'prompt-img.jpg' })
  })

  // 8. 空 slotAssignments 不崩溃
  it('should handle empty slotAssignments without crashing', () => {
    const slots: AnySlot[] = [imgSlot('img')]
    const state = makeState({ slotAssignments: {} })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.img).toBeUndefined()
  })

  // 9. count
  it('should include count when present', () => {
    const state = makeState({ count: 4 })
    const result = serializeForGenerate([], state)
    expect(result.count).toBe(4)
  })

  it('should omit count when undefined', () => {
    const result = serializeForGenerate([], makeState())
    expect(result).not.toHaveProperty('count')
  })

  // 10. max > 1 on regular slot produces array
  it('should produce array for regular slot with max > 1', () => {
    const slots: AnySlot[] = [imgSlot('imgs', { max: 3 })]
    const state = makeState({
      slotAssignments: { imgs: [media('a.jpg'), media('b.jpg')] },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.imgs).toEqual([
      { path: 'a.jpg' },
      { path: 'b.jpg' },
    ])
  })

  // 11. taskRef slot
  it('should serialize taskRef slot', () => {
    const slots: AnySlot[] = [taskRefSlot('baseTask')]
    const state = makeState({ taskRefs: { baseTask: 'task-123' } })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.baseTask).toBe('task-123')
  })

  // 12. url-based media
  it('should serialize url-based media input', () => {
    const slots: AnySlot[] = [imgSlot('img')]
    const state = makeState({
      slotAssignments: { img: [mediaUrl('https://example.com/a.jpg')] },
    })
    const result = serializeForGenerate(slots, state)
    expect(result.inputs.img).toEqual({ url: 'https://example.com/a.jpg' })
  })

  // 13. params 序列化
  it('should serialize params', () => {
    const state = makeState({
      params: { style: 'anime', strength: 0.8 },
    })
    const result = serializeForGenerate([], state)
    expect(result.params).toEqual({ style: 'anime', strength: 0.8 })
  })

  // 14. undefined params 不包含
  it('should exclude undefined param values', () => {
    const state = makeState({
      params: { style: 'anime', empty: undefined },
    })
    const result = serializeForGenerate([], state)
    expect(result.params.style).toBe('anime')
    expect(result.params).not.toHaveProperty('empty')
  })
})
