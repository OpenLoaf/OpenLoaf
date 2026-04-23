/**
 * wechat/003 — new inbound mid-AI-run aborts and restarts.
 *
 * Inject A, wait until debounce fires (~3.2s) and AI run starts, then inject
 * B. Expect activeAbort to fire, debounce to reset, and exactly 1 final
 * outbound (the merged A+B reply). Timing-sensitive — generous budgets.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/003 — abort in-flight AI run on new inbound', () => {
  it('wechat-003-abort-on-new — inject A, then B mid-run → 1 outbound', async () => {
    const accountId = `wx-browser-test-003-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-003' })
          const ts = Date.now()
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-A-${ts}`,
              create_time_ms: ts,
              context_token: `ctx-${accountId}-A`,
              item_list: [{ text_item: { text: '第一条 在吗' } }],
            },
          ])
          // Wait for debounce (3s) + a bit so AI run is mid-flight
          await new Promise((r) => setTimeout(r, 3_500))
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-B-${ts}`,
              create_time_ms: ts + 4000,
              context_token: `ctx-${accountId}-B`,
              item_list: [{ text_item: { text: '第二条 帮我查个东西' } }],
            },
          ])
          const outbound = await api.waitForOutbound(1, 35_000)
          // Settle window — assert no 2nd send
          await new Promise((r) => setTimeout(r, 1_500))
          const finalOutbound = await api.getOutbound()
          return {
            outboundLen: finalOutbound.length,
            outboundText: outbound[0]?.text ?? '',
          }
        }}
      />,
    )

    const result = await waitForPageResult(60_000)
    await takePageScreenshot('wechat-003-abort-on-new')

    const meta = {
      testCase: 'wechat-003-abort-on-new',
      prompt: '(wechat: inject A then B mid-run, expect 1 merged outbound)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `outLen=${result.payload?.outboundLen} preview=${String(result.payload?.outboundText ?? '').slice(0, 100)}`,
        startedAt: result.startedAt,
        payload: result.payload,
      },
      description: '消息 A 触发 AI → 中途消息 B 进入 → abort + 重跑 → 最终 1 条回复',
      tags: ['wechat', 'abort'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    expect(result.payload?.outboundLen).toBe(1)
  })
})
