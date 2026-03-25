import { describe, expect, it } from 'vitest'

import type {
  AnySlot,
  MediaReference,
  MultiSlotDefinition,
  PersistedSlotMap,
  ReferencePools,
  TaskRefSlot,
  TextReference,
  V3InputSlotDefinition,
} from '../slot-types'
import type { ResolveContext } from '../types'
import { restoreOrAssignV3 } from '../slot-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMediaRef(nodeId: string, type = 'image'): MediaReference {
  return { nodeId, nodeType: type, url: `/media/${nodeId}.png`, path: `/files/${nodeId}.png` }
}

function makeTextRef(nodeId: string, content = 'hello'): TextReference {
  return { nodeId, label: `Text·${nodeId}`, content, charCount: content.length }
}

function emptyPools(): ReferencePools {
  return { text: [], image: [], video: [], audio: [] }
}

const defaultCtx: ResolveContext = {
  params: {},
  variantId: 'test',
  modes: {},
  slots: {},
}

function slot(overrides: Partial<V3InputSlotDefinition> & { role: string; accept: any }): V3InputSlotDefinition {
  return { label: overrides.role, ...overrides }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('restoreOrAssignV3', () => {
  // 1. pool 插槽自动分配
  it('assigns first image from pool to an image slot', () => {
    const slots: AnySlot[] = [slot({ role: 'img', accept: 'image' })]
    const pools = emptyPools()
    const ref = makeMediaRef('n1')
    pools.image = [ref]

    const result = restoreOrAssignV3(slots, pools, defaultCtx)
    expect(result.assigned['img']).toEqual([ref])
  })

  // 2. 多个 pool 插槽各自分配不同引用
  it('assigns different refs to two image slots', () => {
    const slots: AnySlot[] = [
      slot({ role: 'img1', accept: 'image' }),
      slot({ role: 'img2', accept: 'image' }),
    ]
    const pools = emptyPools()
    const r1 = makeMediaRef('n1')
    const r2 = makeMediaRef('n2')
    pools.image = [r1, r2]

    const result = restoreOrAssignV3(slots, pools, defaultCtx)
    expect(result.assigned['img1']).toEqual([r1])
    expect(result.assigned['img2']).toEqual([r2])
  })

  // 3. text slot 分配
  it('assigns text from pool to a text slot', () => {
    const slots: AnySlot[] = [slot({ role: 'prompt', accept: 'text' })]
    const pools = emptyPools()
    const tRef = makeTextRef('t1')
    pools.text = [tRef]

    const result = restoreOrAssignV3(slots, pools, defaultCtx)
    expect(result.assigned['prompt']).toEqual([tRef])
  })

  // 4. mask 插槽跳过自动分配（用户手动绘制）
  it('skips mask slots during auto-assignment', () => {
    const slots: AnySlot[] = [slot({ role: 'mask', accept: 'image' })]
    const pools = emptyPools()
    pools.image = [makeMediaRef('n1')]

    const result = restoreOrAssignV3(slots, pools, defaultCtx)
    expect(result.assigned['mask']).toEqual([])
  })

  // 5. mask 插槽不消耗 pool 中的引用
  it('mask slot does not consume pool refs for other slots', () => {
    const slots: AnySlot[] = [
      slot({ role: 'mask', accept: 'image' }),
      slot({ role: 'ref', accept: 'image' }),
    ]
    const pools = emptyPools()
    const r1 = makeMediaRef('n1')
    pools.image = [r1]

    const result = restoreOrAssignV3(slots, pools, defaultCtx)
    expect(result.assigned['mask']).toEqual([])
    expect(result.assigned['ref']).toEqual([r1])
  })

  // 6. TaskRefSlot 跳过
  it('skips TaskRefSlot entirely', () => {
    const taskSlot: TaskRefSlot = { kind: 'taskRef', role: 'task', label: 'Task' }
    const imgS = slot({ role: 'img', accept: 'image' })
    const pools = emptyPools()
    pools.image = [makeMediaRef('n1')]

    const result = restoreOrAssignV3([taskSlot, imgS], pools, defaultCtx)
    expect(result.assigned['task']).toBeUndefined()
    expect(result.assigned['img']!.length).toBe(1)
  })

  // 7. 有效缓存恢复
  it('restores from cache when nodeId exists in pool', () => {
    const r1 = makeMediaRef('n1')
    const r2 = makeMediaRef('n2')
    const slots: AnySlot[] = [slot({ role: 'img', accept: 'image', min: 1 })]
    const pools = emptyPools()
    pools.image = [r1, r2]
    const cache: PersistedSlotMap = { img: 'n2' }

    const result = restoreOrAssignV3(slots, pools, defaultCtx, cache)
    expect(result.assigned['img']).toEqual([r2])
  })

  // 8. 缓存失效回退
  it('falls back to auto-assign when required slot cache is stale', () => {
    const r1 = makeMediaRef('n1')
    const slots: AnySlot[] = [slot({ role: 'img', accept: 'image', min: 1 })]
    const pools = emptyPools()
    pools.image = [r1]
    const cache: PersistedSlotMap = { img: 'deleted-node' }

    const result = restoreOrAssignV3(slots, pools, defaultCtx, cache)
    expect(result.assigned['img']).toEqual([r1])
  })

  // 9. MultiSlot 分配
  it('assigns up to max items for multi slot', () => {
    const multiSlot: MultiSlotDefinition = {
      kind: 'multi',
      role: 'refs',
      label: 'References',
      accept: 'image',
      max: 3,
    }
    const pools = emptyPools()
    pools.image = [makeMediaRef('n1'), makeMediaRef('n2'), makeMediaRef('n3'), makeMediaRef('n4')]

    const result = restoreOrAssignV3([multiSlot], pools, defaultCtx)
    expect(result.assigned['refs']!.length).toBe(3)
    expect(result.assigned['refs']![0].nodeId).toBe('n1')
    expect(result.assigned['refs']![2].nodeId).toBe('n3')
  })

  // 10. missingRequired
  it('reports missingRequired when required slot has no available ref', () => {
    const slots: AnySlot[] = [slot({ role: 'img', accept: 'image', min: 1 })]

    const result = restoreOrAssignV3(slots, emptyPools(), defaultCtx)
    expect(result.missingRequired).toContain('img')
  })

  // 11. associated
  it('collects unassigned pool refs as associated', () => {
    const slots: AnySlot[] = [slot({ role: 'img', accept: 'image' })]
    const pools = emptyPools()
    const r1 = makeMediaRef('n1')
    const r2 = makeMediaRef('n2')
    const r3 = makeMediaRef('n3')
    pools.image = [r1, r2, r3]

    const result = restoreOrAssignV3(slots, pools, defaultCtx)
    expect(result.assigned['img']).toEqual([r1])
    expect(result.associated).toEqual([r2, r3])
  })
})
