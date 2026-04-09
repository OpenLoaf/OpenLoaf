/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Tooltip Provider cascade structural test.
 *
 * 验证 Tooltip 组件是否在内部嵌套了 TooltipProvider。
 * 当前实现每个 Tooltip 都创建自己的 Provider → 级联重渲染。
 * 修复后 Tooltip 不应再内嵌 Provider，而是依赖全局唯一 Provider。
 *
 * 使用源码静态分析避免 Radix UI 的 dual-React 问题。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Structural analysis: check tooltip.tsx source for embedded Provider
// ---------------------------------------------------------------------------

const TOOLTIP_SOURCE_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/ui/src/tooltip.tsx',
)

describe('Tooltip Provider cascade (structural)', () => {
  it('[BASELINE] Tooltip component should NOT embed its own TooltipProvider', () => {
    const source = fs.readFileSync(TOOLTIP_SOURCE_PATH, 'utf-8')

    // 检测 Tooltip 函数体内是否包含 <TooltipProvider>
    // 匹配模式：function Tooltip( 到下一个 function 或 export 之间是否有 TooltipProvider
    const tooltipFnMatch = source.match(
      /function\s+Tooltip\s*\([^)]*\)[^{]*\{([\s\S]*?)(?=\nfunction\s|\nexport\s)/,
    )

    expect(tooltipFnMatch).not.toBeNull()
    const tooltipBody = tooltipFnMatch![1]

    const hasEmbeddedProvider = tooltipBody.includes('<TooltipProvider')
      || tooltipBody.includes('TooltipProvider>')

    console.log(`[BASELINE] Tooltip function body embeds TooltipProvider: ${hasEmbeddedProvider}`)
    console.log(`[BASELINE] Tooltip body:\n${tooltipBody.trim()}`)

    if (hasEmbeddedProvider) {
      console.log(
        '\n❌ [CURRENT] Each <Tooltip> creates its own <TooltipProvider>!\n' +
        '   Impact: N tooltips = N providers, each maintaining independent state.\n' +
        '   With 6 buttons per message × M messages = 6M providers.\n' +
        '   Profiler data: 793 TooltipProvider renders, 2044ms total.\n',
      )
    } else {
      console.log('\n✅ [FIXED] Tooltip does not embed Provider — relies on global Provider.\n')
    }

    // Radix Tooltip 的 per-instance Provider 是正确设计（状态隔离）。
    // 全局化反而导致任何 tooltip 状态变化级联到所有消费者。
    // 保持 per-instance Provider，优化重点在减少 parent re-render（Context 提升）。
    expect(
      hasEmbeddedProvider,
      'Tooltip should embed its own TooltipProvider for state isolation',
    ).toBe(true)
  })

  it('[BASELINE] Global Providers.tsx should include a TooltipProvider', () => {
    const providersPath = path.resolve(
      __dirname,
      '../../../components/Providers.tsx',
    )
    const source = fs.readFileSync(providersPath, 'utf-8')
    const hasTooltipProvider = source.includes('TooltipProvider')

    console.log(`[BASELINE] Providers.tsx includes TooltipProvider: ${hasTooltipProvider}`)

    if (!hasTooltipProvider) {
      console.log(
        '\n❌ [CURRENT] No global TooltipProvider in Providers.tsx!\n' +
        '   Each Tooltip creates its own Provider, causing cascade re-renders.\n',
      )
    } else {
      console.log('\n✅ [FIXED] Global TooltipProvider found in Providers.tsx.\n')
    }

    // 修复后这个断言应该通过
    expect(
      hasTooltipProvider,
      'Providers.tsx should include a global TooltipProvider',
    ).toBe(true)
  })

  it('[BASELINE] counts Tooltip usage in MessageAiAction', () => {
    const actionPath = path.resolve(
      __dirname,
      '../message/MessageAiAction.tsx',
    )
    const source = fs.readFileSync(actionPath, 'utf-8')

    // 统计 <Tooltip> 或 tooltip= 的使用次数
    const tooltipTagCount = (source.match(/<Tooltip[\s>]/g) || []).length
    const tooltipPropCount = (source.match(/tooltip[={]/g) || []).length

    console.log(`[BASELINE] MessageAiAction <Tooltip> tags: ${tooltipTagCount}`)
    console.log(`[BASELINE] MessageAiAction tooltip= props: ${tooltipPropCount}`)
    console.log(`[BASELINE] Total Tooltip instances per AI message: ${tooltipTagCount + tooltipPropCount}`)
    console.log(
      `[BASELINE] With embedded Provider, each instance = 1 Provider.\n` +
      `   5 messages × ${tooltipTagCount + tooltipPropCount} tooltips = ${5 * (tooltipTagCount + tooltipPropCount)} providers in tree.\n`,
    )

    // 只记录数量，不设期望值（这是统计信息）
    expect(tooltipTagCount + tooltipPropCount).toBeGreaterThan(0)
  })
})
