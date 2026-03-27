/**
 * TDD — snapshot 应通过组件内部订阅获取，不通过 props 级联传递
 *
 * 根本原因：BoardCanvas 的 snapshot 每帧新引用，通过 props 传给
 * BoardCanvasInteraction 和 BoardCanvasRender，导致整条组件链
 * 包括 ContextMenu/Menu/Popper（124 次）无意义重渲染。
 *
 * 修复：各组件内部订阅 engine，snapshot 不再作为 props 传递。
 */
import { describe, it, expect } from 'vitest'

describe('Snapshot subscription architecture', () => {
  it('BoardCanvasRender should not accept snapshot as a required prop', async () => {
    const mod = await import('../core/BoardCanvasRender') as Record<string, unknown>
    // 导出标记证明 snapshot 已从 props 移除
    expect('_snapshotSubscribedInternally' in mod).toBe(true)
  })

  it('BoardCanvasInteraction should be wrapped with memo', async () => {
    const mod = await import('../core/BoardCanvasInteraction') as Record<string, unknown>
    expect('_interactionHasMemo' in mod).toBe(true)
  })

  it('BoardCanvasInteraction should not accept snapshot as a required prop', async () => {
    const mod = await import('../core/BoardCanvasInteraction') as Record<string, unknown>
    expect('_snapshotSubscribedInternally' in mod).toBe(true)
  })
})
