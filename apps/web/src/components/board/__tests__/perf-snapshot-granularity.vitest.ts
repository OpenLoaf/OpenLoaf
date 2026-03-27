/**
 * TDD RED 阶段 — 证明 Snapshot 粒度不足的问题
 *
 * 问题：snapshotEqual() 比较全部 27+ 个字段，包括 viewport、panning 等高频变化字段。
 * 拖拽/缩放时 viewport 每帧变化 → snapshotEqual 返回 false → 全树重渲染。
 * DomNodeLayer 只关心数据字段（docRevision、selectedIds、editingNodeId 等），
 * 不关心 viewport、panning、nodeHoverId 等视觉状态，但仍被迫接收全量 snapshot。
 *
 * 期望行为：应导出细粒度比较函数，让不同消费者只订阅关心的字段子集。
 */
import { describe, it, expect } from 'vitest'

describe('Snapshot granularity', () => {
  // 模拟 CanvasSnapshot 的基础结构
  function createBaseSnapshot() {
    const viewport = { zoom: 1, offset: [0, 0] as [number, number], size: [1920, 1080] as [number, number] }
    return {
      elements: [],
      docRevision: 1,
      selectedIds: [] as string[],
      editingNodeId: null,
      viewport,
      anchors: {},
      alignmentGuides: [],
      selectionBox: null,
      canUndo: false,
      canRedo: false,
      activeToolId: null,
      draggingId: null,
      panning: false,
      locked: false,
      connectorDraft: null,
      connectorHover: null,
      nodeHoverId: null,
      connectorHoverId: null,
      connectorStyle: 'default',
      connectorDashed: false,
      connectorDrop: null,
      pendingInsert: null,
      pendingInsertPoint: null,
      toolbarDragging: false,
      colorHistory: [],
      expandedNodeId: null,
      selectionClickPoint: null,
      connectorValidation: null,
    }
  }

  it('useBoardSnapshot module should export snapshotDataEqual for data-only comparison', async () => {
    const mod = await import('../core/useBoardSnapshot') as Record<string, unknown>

    // ❌ 期望：应导出 snapshotDataEqual（只比较数据字段，忽略 viewport/panning/hover 等）
    expect('snapshotDataEqual' in mod).toBe(true)
  })

  it('snapshotDataEqual should return true when only viewport changes', async () => {
    const mod = await import('../core/useBoardSnapshot') as Record<string, unknown>
    const snapshotDataEqual = mod.snapshotDataEqual as
      ((a: Record<string, unknown>, b: Record<string, unknown>) => boolean) | undefined

    // ❌ 当前不存在此函数
    expect(snapshotDataEqual).toBeDefined()
    if (!snapshotDataEqual) return

    const snapshotA = createBaseSnapshot()
    const snapshotB = {
      ...snapshotA,
      // 只有 viewport 和 panning 变化（拖拽/缩放时的典型场景）
      viewport: { zoom: 1.5, offset: [100, 200] as [number, number], size: [1920, 1080] as [number, number] },
      panning: true,
    }

    // 数据未变，数据比较应返回 true
    expect(snapshotDataEqual(snapshotA, snapshotB)).toBe(true)
  })

  it('snapshotDataEqual should return false when data fields change', async () => {
    const mod = await import('../core/useBoardSnapshot') as Record<string, unknown>
    const snapshotDataEqual = mod.snapshotDataEqual as
      ((a: Record<string, unknown>, b: Record<string, unknown>) => boolean) | undefined

    if (!snapshotDataEqual) return

    const snapshotA = createBaseSnapshot()
    const snapshotB = {
      ...snapshotA,
      docRevision: 2, // 文档数据变化
    }

    // 数据变化，应返回 false
    expect(snapshotDataEqual(snapshotA, snapshotB)).toBe(false)
  })

  it('should export snapshotViewEqual for view-only comparison', async () => {
    const mod = await import('../core/useBoardSnapshot') as Record<string, unknown>

    // ❌ 期望：应导出 snapshotViewEqual（只比较视图字段）
    expect('snapshotViewEqual' in mod).toBe(true)
  })

  it('snapshotViewEqual should detect viewport changes', async () => {
    const mod = await import('../core/useBoardSnapshot') as Record<string, unknown>
    const snapshotViewEqual = mod.snapshotViewEqual as
      ((a: Record<string, unknown>, b: Record<string, unknown>) => boolean) | undefined

    if (!snapshotViewEqual) return

    const snapshotA = createBaseSnapshot()
    const snapshotB = {
      ...snapshotA,
      viewport: { zoom: 2, offset: [0, 0] as [number, number], size: [1920, 1080] as [number, number] },
    }

    // viewport 不同，视图比较应返回 false
    expect(snapshotViewEqual(snapshotA, snapshotB)).toBe(false)
  })
})
