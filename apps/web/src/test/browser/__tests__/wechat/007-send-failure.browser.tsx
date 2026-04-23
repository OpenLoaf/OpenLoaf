/**
 * wechat/007 — sendText failure path writes session.errorMessage.
 *
 * Set mock to 'sendFails' before injecting. AI completes (assistant in
 * jsonl) but sendText throws. Verify outbox=0 (no fake success record),
 * session.errorMessage non-empty so the UI banner shows real cause.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/007 — sendText fail → errorMessage written', () => {
  it('wechat-007-send-failure — sendFails mode → outbox=0 + errorMessage', async () => {
    const accountId = `wx-browser-test-007-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'sendFails', ownerUserId: 'mock-owner-007' })
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-fail-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}-fail`,
              item_list: [{ text_item: { text: '这条会让 sendText 抛错' } }],
            },
          ])
          // Poll until errorMessage is written (sendText catch path runs after
          // debounce 3s + AI run + sendText attempt — total can exceed 30s under
          // saas latency). Avoids flake from a fixed sleep that's too short.
          const deadline = Date.now() + 80_000
          let session: any = null
          while (Date.now() < deadline) {
            session = await api.getSession()
            if (session?.errorMessage) break
            await new Promise((r) => setTimeout(r, 500))
          }
          const outbound = await api.getOutbound()
          const messages = await api.getMessages()
          return {
            outboundLen: outbound.length,
            errorMessage: session?.errorMessage ?? null,
            assistantCount: messages.filter((m: any) => m.role === 'assistant').length,
          }
        }}
      />,
    )

    const result = await waitForPageResult(105_000)
    await takePageScreenshot('wechat-007-send-failure')

    const meta = {
      testCase: 'wechat-007-send-failure',
      prompt: '(wechat: sendFails mode, expect errorMessage written)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `outLen=${result.payload?.outboundLen} err="${String(result.payload?.errorMessage ?? '').slice(0, 100)}" assistantN=${result.payload?.assistantCount}`,
        startedAt: result.startedAt,
        payload: result.payload,
      },
      description: 'sendText 抛错 → outbox 不增 + session.errorMessage 写入',
      tags: ['wechat', 'error-path'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    expect(result.payload?.outboundLen).toBe(0)
    expect(typeof result.payload?.errorMessage).toBe('string')
    expect((result.payload?.errorMessage as string).length).toBeGreaterThan(0)
  })
})
