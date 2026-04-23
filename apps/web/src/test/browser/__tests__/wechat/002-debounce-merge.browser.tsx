/**
 * wechat/002 — debounce 3s merges 3 quick inbound msgs into one AI turn.
 *
 * Inject 3 messages back-to-back, expect ONE outbound sendText (not 3) and
 * assistant message count == 1. Validates per-session debounce + abort
 * collapses bursts before runChatStream fires.
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
          // Debounce 3s + AI run budget — same envelope as 001.
          const outbound = await api.waitForOutbound(1, 30_000)
          // Wait one extra second to assert NO 2nd outbound sneaks in.
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
      description: '3 条快速连发 → debounce 合并 → 只发 1 条回复',
      tags: ['wechat', 'debounce'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    expect(result.payload?.outboundLen).toBe(1)
    expect(result.payload?.assistantCount).toBe(1)
  })
})
