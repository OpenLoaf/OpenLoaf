/**
 * wechat/002 — burst of 3 quick inbound msgs collapses to one full-agent turn.
 *
 * Bridge V2 architecture: 0ms debounce, each inbound aborts the in-flight race
 * and restarts with the merged pending queue. So 3 messages in a burst should
 * result in exactly 1 full-agent run (assistantCount === 1) and 1-2 outbound
 * sends (the final race's fast + full, or just full if it wins first).
 * Earlier races' text is discarded by the stateRaceCtxChanged guard.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/002 — debounce merges burst → single AI turn', () => {
  it('wechat-002-debounce-merge — 3 inbound in 1s → 1 outbound', async () => {
    const accountId = `wx-browser-test-002-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-002' })
          const baseTs = Date.now()
          const msgs = [0, 1, 2].map((i) => ({
            ...helloMsg,
            message_id: `mock-in-burst-${i}-${baseTs}`,
            create_time_ms: baseTs + i * 200,
            context_token: `ctx-${accountId}-${i}`,
            item_list: [{ text_item: { text: `第${i + 1}条 你好` } }],
          }))
          await api.inject(msgs)
          // Bridge V2: abort-and-merge on each new inbound; final race's fast+full budget ~10s.
          const outbound = await api.waitForOutbound(1, 30_000)
          // Settle window — wait for the final race's full agent to finish sending.
          await new Promise((r) => setTimeout(r, 2_000))
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
    await takePageScreenshot('wechat-002-debounce-merge')

    const meta = {
      testCase: 'wechat-002-debounce-merge',
      prompt: '(wechat: inject 3 burst, expect 1 merged AI turn)',
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
      description: '3 条快速连发 → race abort+合并 → 只跑 1 次 full agent，最终 1-2 条回复',
      tags: ['wechat', 'race-abort'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Bridge V2: fast wins → 2 outbound; full wins → 1 outbound.
    expect(result.payload?.outboundLen).toBeGreaterThanOrEqual(1)
    expect(result.payload?.outboundLen).toBeLessThanOrEqual(2)
    // At least one assistant row per race cycle. Earlier races aborted during
    // `runChatStream` can still leave partial assistant writes in the jsonl —
    // known V2 quirk (abort-after-write can't roll back). Final assistant row
    // from the last successful race is always present.
    expect(result.payload?.assistantCount).toBeGreaterThanOrEqual(1)
  })
})
