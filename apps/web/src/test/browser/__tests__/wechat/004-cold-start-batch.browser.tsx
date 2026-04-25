/**
 * wechat/004 — cold start drains 5 backlog msgs into merged AI prompt (bridge V2).
 *
 * Mock getUpdates returns the entire inbox in one call. Inject 5 msgs at
 * once so worker's first poll sees them all → 5 scheduleAiReply calls →
 * V2 abort-and-merge collapses to the final race only → 1-2 outbound.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/004 — cold start backlog merged into one AI turn', () => {
  it('wechat-004-cold-start-batch — 5 backlog msgs → 1 outbound', async () => {
    const accountId = `wx-browser-test-004-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-004' })
          const baseTs = Date.now() - 5 * 60_000
          const msgs = [0, 1, 2, 3, 4].map((i) => ({
            ...helloMsg,
            message_id: `mock-in-cold-${i}-${baseTs}`,
            create_time_ms: baseTs + i * 60_000,
            context_token: `ctx-${accountId}-${i}`,
            item_list: [{ text_item: { text: `堆积消息 ${i + 1}` } }],
          }))
          await api.inject(msgs)
          const outbound = await api.waitForOutbound(1, 30_000)
          await new Promise((r) => setTimeout(r, 1_000))
          const finalOutbound = await api.getOutbound()
          const messages = await api.getMessages()
          return {
            outboundLen: finalOutbound.length,
            outboundText: outbound[0]?.text ?? '',
            assistantCount: messages.filter((m: any) => m.role === 'assistant').length,
            userCount: messages.filter((m: any) => m.role === 'user').length,
          }
        }}
      />,
    )

    const result = await waitForPageResult(45_000)
    await takePageScreenshot('wechat-004-cold-start-batch')

    const meta = {
      testCase: 'wechat-004-cold-start-batch',
      prompt: '(wechat: cold start with 5 backlog → 1 merged AI turn)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `outLen=${result.payload?.outboundLen} assistantN=${result.payload?.assistantCount} userN=${result.payload?.userCount}`,
        startedAt: result.startedAt,
        payload: result.payload,
      },
      description: '5 条堆积入站冷启动 → debounce 合并 → 1 条 AI 回复',
      tags: ['wechat', 'cold-start'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Bridge V2: fast wins → 2 outbound; full wins → 1 outbound.
    expect(result.payload?.outboundLen).toBeGreaterThanOrEqual(1)
    expect(result.payload?.outboundLen).toBeLessThanOrEqual(2)
    // Earlier races aborted during runChatStream can leave partial assistant
    // rows in jsonl (V2 quirk — abort-after-write can't roll back). Final
    // successful race always writes one row.
    expect(result.payload?.assistantCount).toBeGreaterThanOrEqual(1)
  })
})
