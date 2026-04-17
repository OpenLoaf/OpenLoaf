/**
 * skill-market/001 — 技能市场列表加载 smoke 测试
 *
 * 渲染 SkillMarketplace，等待列表进入 ready（至少 1 张卡片或空态），
 * 截图验证页面结构，记录 payload 到 runs.jsonl。
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import SkillMarketHarness from '../../SkillMarketHarness'
import {
  waitForPageResult,
  takePageScreenshot,
} from '../../page-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

describe('Skill Market — 001 list loads', () => {
  it('首屏加载：列表进入 ready（有卡片或空态）', async () => {
    render(<SkillMarketHarness serverUrl={SERVER_URL} readyTimeoutMs={25_000} />)

    const result = await waitForPageResult(30_000)

    await takePageScreenshot('skill-market-001-list-loads')

    const cardCount = (result.payload?.cardCount as number | undefined) ?? 0
    const emptyState = result.payload?.emptyState === true

    // 落盘 meta（跨 run 追踪）
    const meta = {
      testCase: 'skill-market-001-list-loads',
      prompt: '(page test: skill-market list)',
      result: {
        sessionId: 'n/a',
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `cards=${cardCount} empty=${emptyState}`,
        startedAt: result.startedAt,
      },
      description: 'Skill marketplace list renders successfully',
      tags: ['skill-market', 'smoke'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    // 断言：至少达成 ready（空态也算 ready）
    expect(['ready']).toContain(result.status)
  })
})
