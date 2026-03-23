import { describe, expect, it } from 'vitest'
import type { InputSlotDefinition, PersistedSlotMap, MediaReference } from '../slot-types'
import { buildReferencePools, restoreOrAssign } from '../slot-engine'
import type { UpstreamData } from '../../../engine/upstream-data'

function makeUpstream(entries: Array<{ nodeId: string; nodeType: string; data: string }>): UpstreamData {
  return {
    textList: entries.filter(e => e.nodeType === 'text').map(e => e.data),
    imageList: entries.filter(e => e.nodeType === 'image').map(e => e.data),
    videoList: entries.filter(e => e.nodeType === 'video').map(e => e.data),
    audioList: entries.filter(e => e.nodeType === 'audio').map(e => e.data),
    entries,
  }
}

const imageSlot: InputSlotDefinition = {
  id: 'image', mediaType: 'image', labelKey: 'slot.image',
  min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate',
}

const maskSlot: InputSlotDefinition = {
  id: 'mask', mediaType: 'image', labelKey: 'slot.mask',
  min: 0, max: 1, allowManualInput: true, overflowStrategy: 'rotate',
}

describe('restoreOrAssign', () => {
  it('should auto-assign when no cached assignment', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
      { nodeId: 'img-2', nodeType: 'image', data: 'asset/b.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const result = restoreOrAssign([imageSlot, maskSlot], pools, undefined)
    expect(result.assigned.image).toHaveLength(1)
    expect(result.assigned.mask).toHaveLength(1)
    expect(result.associated).toHaveLength(0)
  })

  it('should restore cached assignment when nodeIds still connected', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
      { nodeId: 'img-2', nodeType: 'image', data: 'asset/b.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const cached: PersistedSlotMap = { image: 'img-2', mask: 'img-1' }
    const result = restoreOrAssign([imageSlot, maskSlot], pools, cached)
    expect((result.assigned.image[0] as MediaReference).nodeId).toBe('img-2')
    expect((result.assigned.mask[0] as MediaReference).nodeId).toBe('img-1')
  })

  it('should fallback to auto-assign for disconnected cached nodeIds', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const cached: PersistedSlotMap = { image: 'img-2', mask: 'img-1' }
    const result = restoreOrAssign([imageSlot, maskSlot], pools, cached)
    expect((result.assigned.image[0] as MediaReference).nodeId).toBe('img-1')
    expect(result.assigned.mask).toHaveLength(0)
  })

  it('should put unassigned upstream nodes into associated', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
      { nodeId: 'img-2', nodeType: 'image', data: 'asset/b.jpg' },
      { nodeId: 'img-3', nodeType: 'image', data: 'asset/c.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const result = restoreOrAssign([imageSlot], pools, undefined)
    expect(result.assigned.image).toHaveLength(1)
    expect(result.associated).toHaveLength(2)
  })

  it('should handle manual refs in cache', () => {
    const upstream = makeUpstream([
      { nodeId: 'img-1', nodeType: 'image', data: 'asset/a.jpg' },
    ])
    const pools = buildReferencePools(upstream, undefined)
    const cached: PersistedSlotMap = { image: 'manual:assets/uploads/custom.jpg' }
    const result = restoreOrAssign([imageSlot], pools, cached)
    expect(result.assigned.image).toHaveLength(1)
    expect(result.associated).toHaveLength(1)
  })
})
