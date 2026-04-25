/**
 * wechat/012 — SaaS 未登录 → prompt 前缀注入 + agent 礼貌说明.
 *
 * Hijack ensureServerAccessToken to return undefined for this account, then
 * inject a voice. Bridge's startRace must inject the
 * `[会话上下文：用户尚未登录 OpenLoaf 云端...]` prefix; the agent then per
 * identity.md rule 9 should NOT retry cloud tools and reply with a polite
 * login prompt.
 *
 * We stub login via a dedicated /debug/wechat/setFakeLoggedOut flag (added
 * alongside this test). Absent that flag, a server with real SaaS token will
 * falsify the premise — test will fail loudly and tell the dev to disable
 * login before running.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import voiceMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-voice-short.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

const TINY_SILENT_WAV_B64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

describe('wechat/012 — not-logged-in context prefix + polite refusal', () => {
  it('wechat-012-not-logged-in — voice while logged out returns login-prompt text', async () => {
    const accountId = `wx-browser-test-012-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-012' })
          // Flip the mock-only "this account's bridge should see hasCloudLogin=false"
          // switch. See wechatMockRoutes.ts `/debug/wechat/setFakeLoggedOut`.
          await fetch(`${SERVER_URL}/debug/wechat/setFakeLoggedOut`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accountId, value: true }),
          })
          await api.registerMockMedia(
            'mock-voice-001-aeskey',
            TINY_SILENT_WAV_B64,
            'voice',
          )
          try {
            await api.inject([
              {
                ...voiceMsg,
                message_id: `mock-in-voice-loggedout-${Date.now()}`,
                create_time_ms: Date.now(),
                context_token: `ctx-${accountId}`,
              },
            ])
            // Poll until a full-agent assistant message (with text part) lands
            // OR timeout. Waiting just for the first outbound catches the fast
            // ack ("收到，正在处理") before the full agent has decided not to
            // call Cloud tools.
            const deadline = Date.now() + 90_000
            let fullAssistantText = ''
            let allToolCalls: string[] = []
            while (Date.now() < deadline) {
              const msgs = await api.getMessages()
              const asst = msgs.filter((m: any) => m.role === 'assistant')
              allToolCalls = []
              fullAssistantText = ''
              for (const m of asst) {
                for (const p of (m.parts ?? []) as any[]) {
                  const type = typeof p?.type === 'string' ? p.type : ''
                  if (type === 'text' && typeof p?.text === 'string') {
                    fullAssistantText += p.text
                  }
                  if (type.startsWith('tool-') && type !== 'tool-call') {
                    allToolCalls.push(type.slice('tool-'.length))
                  }
                }
              }
              if (fullAssistantText.trim().length > 0) break
              await new Promise((r) => setTimeout(r, 1_000))
            }
            await new Promise((r) => setTimeout(r, 1_500))
            const finalOutbound = await api.getOutbound()
            return {
              outboundLen: finalOutbound.length,
              allOutboundKinds: finalOutbound.map((o: any) => o.kind),
              // Combine bubble texts for a robust keyword check (fast ack +
              // full reply both count as "the model's outbound").
              outboundText: finalOutbound
                .filter((o: any) => o.kind === 'text')
                .map((o: any) => o.text ?? '')
                .join(' | '),
              fullAssistantText: fullAssistantText.slice(0, 500),
              toolCalls: allToolCalls,
            }
          } finally {
            // Always reset the flag, even if assertions fail below.
            await fetch(`${SERVER_URL}/debug/wechat/setFakeLoggedOut`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ accountId, value: false }),
            })
          }
        }}
      />,
    )

    const result = await waitForPageResult(90_000)
    await takePageScreenshot('wechat-012-not-logged-in')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-012-not-logged-in',
      prompt: '(wechat: voice while faked-logged-out, expect polite login-prompt reply)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `out.len=${payload?.outboundLen} tools=${(payload?.toolCalls ?? []).join(',')} text=${String(payload?.outboundText ?? '').slice(0, 80)}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '未登录时 bridge 注入上下文前缀，agent 按 identity rule 9 提示用户登录，不调 Cloud 系工具',
      tags: ['wechat', 'auth', 'multimodal'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Agent must NOT attempt to call a Cloud-family tool when the bridge has
    // prefixed the user message with the "not logged in" context marker.
    expect(payload?.toolCalls).not.toContain('CloudSpeechRecognize')
    expect(payload?.toolCalls).not.toContain('CloudImageUnderstand')
    // Outbound is plain text with a login-hint keyword. We check BOTH the
    // concatenated outbound text and the jsonl-persisted full assistant text —
    // the full reply is where the polite "please log in" line should land.
    for (const k of (payload?.allOutboundKinds ?? []) as string[]) {
      expect(k).toBe('text')
    }
    const combined = `${String(payload?.outboundText ?? '')} ${String(payload?.fullAssistantText ?? '')}`
    expect(combined).toMatch(/登录|login/i)
  })
})
