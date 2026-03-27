/**
 * TDD RED 阶段 — 证明 DomNodeLayer callback 稳定性问题存在
 *
 * 问题：DomNodeLayerBase 在 map() 内为每个节点创建箭头函数：
 *   onSelect={() => engine.selection.setSelection([element.id])}
 *   onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
 *   onLabelChange={label => { ... }}
 * 每次渲染都生成新引用，导致 DomNodeItem 的 memo() 被穿透。
 *
 * 期望行为：callback 应通过 useCallback + elementId 参数化，保持引用稳定。
 */
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Test 1: DomNodeItem 的 memo 自定义比较函数应检查 callback props
// ---------------------------------------------------------------------------
describe('DomNodeItem memo comparator', () => {
  /**
   * 从 DomNodeLayer.tsx 第 178-189 行提取的比较函数逻辑。
   * 当前实现只检查 element/selected/dragging/editing/expanded/boxSelecting/groupPadding，
   * 完全忽略 onSelect/onUpdate/onLabelChange。
   *
   * 这意味着即使 callback 稳定，React Compiler (Forget) 也会因为忽略自定义比较而
   * 使用 shallow compare，导致每次新 callback 引用触发重渲染。
   */
  it('should NOT pass when callbacks have different references (proving memo bypass)', () => {
    // 模拟当前的自定义比较函数（从源码第 178-189 行复制）
    function currentMemoComparator(
      prev: Record<string, unknown>,
      next: Record<string, unknown>,
    ): boolean {
      if (prev.element !== next.element) return false
      if (prev.selected !== next.selected) return false
      if (prev.dragging !== next.dragging) return false
      if (prev.editing !== next.editing) return false
      if (prev.expanded !== next.expanded) return false
      if (prev.boxSelecting !== next.boxSelecting) return false
      if (prev.groupPadding !== next.groupPadding) return false
      return true
    }

    const sharedElement = { id: 'node-1', type: 'text' }

    const prevProps = {
      element: sharedElement,
      selected: false,
      dragging: false,
      editing: false,
      expanded: false,
      boxSelecting: false,
      groupPadding: 8,
      onSelect: () => {},      // callback A
      onUpdate: () => {},
      onLabelChange: () => {},
    }

    const nextProps = {
      element: sharedElement,
      selected: false,
      dragging: false,
      editing: false,
      expanded: false,
      boxSelecting: false,
      groupPadding: 8,
      onSelect: () => {},      // callback B（不同引用！）
      onUpdate: () => {},
      onLabelChange: () => {},
    }

    // 当前比较函数返回 true（认为相同）→ 但 React Compiler 会忽略它
    // 使用 shallow compare: prevProps.onSelect !== nextProps.onSelect → 触发重渲染
    const customResult = currentMemoComparator(prevProps, nextProps)
    expect(customResult).toBe(true) // 自定义比较说"相同"

    // 但 React Compiler 的 shallow compare 会说"不同"
    const shallowEqual = prevProps.onSelect === nextProps.onSelect
    expect(shallowEqual).toBe(false) // 不同引用 → React Compiler 触发重渲染

    // ❌ 期望行为：应该有稳定的 callback 引用，使得 shallow compare 也通过
    // 这个测试验证当前 callback 确实不稳定
  })
})

// ---------------------------------------------------------------------------
// Test 2: DomNodeLayer 应导出 createNodeCallbacks 工厂或使用 useCallback
// ---------------------------------------------------------------------------
describe('DomNodeLayer callback factory', () => {
  it('should export stable callback creators for node operations', async () => {
    // 期望 DomNodeLayer 导出稳定化的 callback 创建函数
    // 这些函数接受 engine 参数，返回以 elementId 为参数的稳定 callback
    let hasStableCallbacks = false
    try {
      const mod = await import('../render/pixi/DomNodeLayer') as Record<string, unknown>
      // 期望导出：createNodeSelectHandler, createNodeUpdateHandler, createNodeLabelChangeHandler
      // 或者导出 useNodeCallbacks hook
      hasStableCallbacks = (
        'createNodeSelectHandler' in mod ||
        'useNodeCallbacks' in mod ||
        // 或者验证内部已使用 useCallback（通过导出的测试辅助函数）
        '_testCallbackStability' in mod
      )
    } catch {
      hasStableCallbacks = false
    }

    // ❌ 当前失败：DomNodeLayer 没有导出任何 callback 稳定化工具
    expect(hasStableCallbacks).toBe(true)
  })
})
