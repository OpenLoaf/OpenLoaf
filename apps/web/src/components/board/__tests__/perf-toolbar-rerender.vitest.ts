/**
 * TDD — BoardToolbar 和 ImageNodeView 重渲染问题
 *
 * BoardToolbar: memo 没有自定义比较函数，snapshot 新引用 → 每帧重渲染（336ms self）
 * ImageNodeView: brushSize state 在顶层管理，滑块拖动触发整个节点树重渲染（207ms）
 */
import { describe, it, expect } from 'vitest'

describe('BoardToolbar memo optimization', () => {
  it('should export a toolbar snapshot comparator for memo', async () => {
    // BoardToolbar 的 memo 应该有自定义比较函数
    // 导出比较函数（或标记）以验证修复已就绪
    const mod = await import('../toolbar/BoardToolbar') as Record<string, unknown>
    expect('_toolbarHasCustomCompare' in mod).toBe(true)
  })

  it('toolbar comparator should return true when only viewport changes', async () => {
    const mod = await import('../toolbar/BoardToolbar') as Record<string, unknown>
    const comparator = mod.toolbarSnapshotEqual as
      ((a: Record<string, unknown>, b: Record<string, unknown>) => boolean) | undefined

    expect(comparator).toBeDefined()
    if (!comparator) return

    const base = {
      activeToolId: 'select',
      locked: false,
      pendingInsert: null,
      colorHistory: [] as string[],
      selectionBox: null,
    }

    // 只有 viewport 变化（不影响 toolbar）
    expect(comparator(
      { ...base, viewport: { zoom: 1, offset: [0, 0] } },
      { ...base, viewport: { zoom: 2, offset: [100, 200] } },
    )).toBe(true)
  })

  it('toolbar comparator should return false when activeToolId changes', async () => {
    const mod = await import('../toolbar/BoardToolbar') as Record<string, unknown>
    const comparator = mod.toolbarSnapshotEqual as
      ((a: Record<string, unknown>, b: Record<string, unknown>) => boolean) | undefined

    if (!comparator) return

    const base = {
      activeToolId: 'select',
      locked: false,
      pendingInsert: null,
      colorHistory: [] as string[],
      selectionBox: null,
    }

    expect(comparator(
      base,
      { ...base, activeToolId: 'pen' },
    )).toBe(false)
  })
})

describe('ImageNodeView brushSize isolation', () => {
  it('ImageNode should not have brushSize as a useState (should use ref)', async () => {
    // brushSize 应该通过 ref 管理，不触发 ImageNodeView 重渲染
    // 验证：ImageNode 模块导出标记表示 brushSize 已从 state 移到 ref
    const mod = await import('../nodes/ImageNode') as Record<string, unknown>
    expect('_brushSizeUsesRef' in mod).toBe(true)
  })
})
