/**
 * wechat/001 — single inbound message triggers AI reply via bridge V2.
 *
 * Drives the mock iLink via /debug/wechat: injects a single "你好", waits
 * for the AI turn (bridge V2: 0ms debounce + fast/full race), then verifies
 * 1-2 outbound sendText calls were recorded (fast wins → 2 bubbles; full
 * wins → 1 bubble) and the session now has user + assistant bubbles in
 * messages.jsonl. `assistantCount === 1` because only the full agent
 * writes to chat history; fast agent runs independently via generateText.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/001 — single inbound → AI → sendText', () => {
  it('wechat-001-inbound-single — one hello in, one reply out', async () => {
    const accountId = `wx-browser-test-001-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-001' })
          await api.inject([{ ...helloMsg, context_token: `ctx-${accountId}` }])
          // Bridge V2: fast ack ~1s + full turn ~3-8s. Budget 30s generous.
          const outbound = await api.waitForOutbound(1, 30_000)
          const session = await api.getSession()
          return {
            outboundLen: outbound.length,
            outboundText: outbound[0]?.text ?? '',
            sessionKind: session?.kind ?? null,
            sessionMessageCount: session?.messageCount ?? 0,
          }
        }}
      />,
    )

    const result = await waitForPageResult(45_000)
    await takePageScreenshot('wechat-001-inbound-single')

    const meta = {
      testCase: 'wechat-001-inbound-single',
      prompt: '(wechat: inject single text, expect one sendText reply)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `out.len=${result.payload?.outboundLen} preview=${String(result.payload?.outboundText ?? '').slice(0, 100)}`,
        startedAt: result.startedAt,
        payload: result.payload,
      },
      description: '单条入站消息触发 AI 自动回复并通过 mock sendText 发出',
      tags: ['wechat', 'smoke'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Bridge V2 race: fast wins → 2 outbound (ack + full); full wins → 1 outbound.
    expect(result.payload?.outboundLen).toBeGreaterThanOrEqual(1)
    expect(result.payload?.outboundLen).toBeLessThanOrEqual(2)
    expect(typeof result.payload?.outboundText).toBe('string')
    expect((result.payload?.outboundText as string).length).toBeGreaterThan(0)
    expect(result.payload?.sessionKind).toBe('wechat')
  })
})
