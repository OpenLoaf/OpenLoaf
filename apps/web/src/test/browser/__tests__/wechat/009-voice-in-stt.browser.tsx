/**
 * wechat/009 — inbound voice message → agent calls CloudSpeechRecognize
 *
 * Inject a voice_item fixture and register a tiny silent WAV as its backing
 * buffer (so MockApiClient.downloadMedia can resolve it; persistMediaItem
 * then writes the buffer to `asset/` and produces a V2 attachment tag).
 * The channel agent should recognise the `[语音]\n<system-tag .../>` prefix
 * in its user message and, per identity.md rule 7, call CloudSpeechRecognize
 * with the persisted path. We assert the tool was invoked and the outbound
 * reply is pure text — we do NOT assert what STT returns, because the mock
 * buffer is silence and real SaaS STT output is unpredictable.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import voiceMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-voice-short.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

/** 44-byte RIFF WAV header with zero PCM samples — smallest valid WAV. */
const TINY_SILENT_WAV_B64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

describe('wechat/009 — voice inbound → CloudSpeechRecognize', () => {
  it('wechat-009-voice-in-stt — voice bubble triggers STT call', async () => {
    const accountId = `wx-browser-test-009-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-009' })
          // Register mock voice buffer BEFORE injecting — mock downloadMedia
          // reads from this map keyed on the item's aes_key.
          await api.registerMockMedia(
            'mock-voice-001-aeskey',
            TINY_SILENT_WAV_B64,
            'voice',
          )
          await api.inject([
            {
              ...voiceMsg,
              message_id: `mock-in-voice-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
            },
          ])
          // Poll until assistant message has a CloudSpeechRecognize tool call
          // or timeout — waiting only for outbound catches the fast-ack bubble
          // before the full agent gets a chance to invoke STT.
          const deadline = Date.now() + 150_000
          let allToolCalls: string[] = []
          while (Date.now() < deadline) {
            const msgs = await api.getMessages()
            const asst = msgs.filter((m: any) => m.role === 'assistant')
            allToolCalls = []
            for (const m of asst) {
              for (const p of (m.parts ?? []) as any[]) {
                const type = typeof p?.type === 'string' ? p.type : ''
                if (type.startsWith('tool-') && type !== 'tool-call') {
                  allToolCalls.push(type.slice('tool-'.length))
                }
              }
            }
            if (allToolCalls.includes('CloudSpeechRecognize')) break
            await new Promise((r) => setTimeout(r, 1_000))
          }
          // Extra settle so the full agent's final text has a chance to land.
          await new Promise((r) => setTimeout(r, 3_000))
          const finalOutbound = await api.getOutbound()
          const messages = await api.getMessages()
          // Grab the user message text so we can assert the attachment tag is
          // preserved (agent should have seen `[语音]\n<system-tag ...>` in prompt).
          const userMsg = messages.find((m: any) => m.role === 'user')
          const userText = Array.isArray(userMsg?.parts)
            ? userMsg.parts
                .filter((p: any) => p?.type === 'text')
                .map((p: any) => p.text)
                .join('')
            : ''
          return {
            outboundLen: finalOutbound.length,
            firstOutboundKind: finalOutbound[0]?.kind ?? null,
            allOutboundKinds: finalOutbound.map((o: any) => o.kind),
            firstOutboundText: String(finalOutbound[0]?.text ?? ''),
            toolCalls: allToolCalls,
            userMessageText: userText.slice(0, 500),
          }
        }}
      />,
    )

    const result = await waitForPageResult(90_000)
    await takePageScreenshot('wechat-009-voice-in-stt')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-009-voice-in-stt',
      prompt: '(wechat: inject voice_item, expect CloudSpeechRecognize invocation)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `out.len=${payload?.outboundLen} kinds=${(payload?.allOutboundKinds ?? []).join(',')} tools=${(payload?.toolCalls ?? []).join(',')}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '入站语音消息触发 AI 自主调用 CloudSpeechRecognize，outbound 为纯文本',
      tags: ['wechat', 'voice', 'multimodal'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Outbound must be text-only (STT failure still yields a polite text reply).
    expect(payload?.outboundLen).toBeGreaterThanOrEqual(1)
    for (const k of (payload?.allOutboundKinds ?? []) as string[]) {
      expect(k).toBe('text')
    }
    // Agent must attempt STT. We don't care what it returned.
    expect(payload?.toolCalls).toEqual(expect.arrayContaining(['CloudSpeechRecognize']))
    // Attachment tag preservation: the user prompt as seen by model includes both
    // the inline `[语音]` marker and the system-tag with a path.
    expect(payload?.userMessageText).toMatch(/\[语音\]/)
    expect(payload?.userMessageText).toMatch(/<system-tag[^>]*type="attachment"/)
  })
})
