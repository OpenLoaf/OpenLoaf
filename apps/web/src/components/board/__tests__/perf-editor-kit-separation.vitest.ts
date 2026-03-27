/**
 * TDD RED 阶段 — 证明 Plate 编辑器插件未分离的问题
 *
 * 问题：BoardTextEditorKit 是唯一的插件配置，包含 11 个插件。
 * 非编辑节点使用 readOnly=true 但仍然初始化全部插件（包括 AutoformatPlugin、
 * ExitBreakPlugin 等仅编辑时需要的插件），浪费初始化开销。
 *
 * 期望行为：应有 ReadOnlyBoardTextEditorKit（轻量版）和
 * EditableBoardTextEditorKit（完整版），非编辑节点使用轻量版。
 */
import { describe, it, expect } from 'vitest'

describe('Board text editor plugin kits', () => {
  it('should export separate editable and readonly plugin kits', async () => {
    const mod = await import('../nodes/text-editor-kit')

    // ❌ 期望：应导出 ReadOnlyBoardTextEditorKit
    expect('ReadOnlyBoardTextEditorKit' in mod).toBe(true)
    // ❌ 期望：应导出 EditableBoardTextEditorKit
    expect('EditableBoardTextEditorKit' in mod).toBe(true)
  })

  it('ReadOnlyBoardTextEditorKit should have fewer plugins than editable kit', async () => {
    const mod = await import('../nodes/text-editor-kit') as Record<string, unknown>

    const editableKit = (mod.EditableBoardTextEditorKit ?? mod.BoardTextEditorKit) as unknown[]
    const readOnlyKit = mod.ReadOnlyBoardTextEditorKit as unknown[] | undefined

    // ❌ 当前 ReadOnlyBoardTextEditorKit 不存在
    expect(readOnlyKit).toBeDefined()
    if (!readOnlyKit) return

    // 只读版本应该严格少于可编辑版本
    expect(readOnlyKit.length).toBeLessThan(editableKit.length)
  })

  it('ReadOnlyBoardTextEditorKit should NOT include editing-only plugins', async () => {
    const mod = await import('../nodes/text-editor-kit') as Record<string, unknown>

    const readOnlyKit = mod.ReadOnlyBoardTextEditorKit as unknown[] | undefined

    // ❌ 当前 ReadOnlyBoardTextEditorKit 不存在
    expect(readOnlyKit).toBeDefined()
    if (!readOnlyKit) return

    // 检查只读版本不包含仅编辑时需要的插件
    const pluginKeys = readOnlyKit.map((p: any) => p?.key ?? p?.type ?? p?.name ?? '')
    const editOnlyPlugins = ['autoformat', 'exitBreak']

    for (const editPlugin of editOnlyPlugins) {
      const found = pluginKeys.some((k: string) =>
        k.toLowerCase().includes(editPlugin.toLowerCase())
      )
      expect(found).toBe(false)
    }
  })
})
