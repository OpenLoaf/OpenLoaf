/**
 * wechat/017 — "给我写份 word 纪要" → office-create → SendWeChatMedia(file).
 *
 * Agent should pick JsSandbox or a DocConvert/docx-creating tool chain,
 * produce a .docx (or .pdf/.xlsx) file, then deliver it via
 * SendWeChatMedia(kind='file'). We don't pin the exact creation path —
 * several tool combos could produce the artifact. Assert the outbound
 * kind='file' bubble exists with a reasonable fileName extension.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/017 — file outbound via docx creation → SendWeChatMedia(file)', () => {
  it('wechat-017-file-out-docx — "做份 word" request triggers SendWeChatMedia(file)', async () => {
    const accountId = `wx-browser-test-017-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-017' })
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-docx-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
              item_list: [
                {
                  text_item: {
                    text: '帮我生成一份 Word 会议纪要，主题"新产品发布会"，包含议程和结论各 3 条，发给我',
                  },
                },
              ],
            },
          ])
          // docx/pdf creation via JsSandbox/DocConvert is tens of seconds;
          // waiting only for the first outbound catches fast-ack. Poll until a
          // file-kind outbound appears OR timeout.
          const deadline = Date.now() + 240_000
          while (Date.now() < deadline) {
            const cur = await api.getOutbound()
            if (cur.some((o: any) => o.kind === 'file')) break
            await new Promise((r) => setTimeout(r, 1_500))
          }
          await new Promise((r) => setTimeout(r, 2_000))
          const finalOutbound = await api.getOutbound()
          const messages = await api.getMessages()
          const assistantMsgs = messages.filter((m: any) => m.role === 'assistant')
          const allToolCalls: string[] = []
          for (const m of assistantMsgs) {
            for (const p of (m.parts ?? []) as any[]) {
              const type = typeof p?.type === 'string' ? p.type : ''
              if (type.startsWith('tool-') && type !== 'tool-call') {
                allToolCalls.push(type.slice('tool-'.length))
              }
            }
          }
          const fileOut = finalOutbound.find((o: any) => o.kind === 'file')
          return {
            outboundLen: finalOutbound.length,
            allOutboundKinds: finalOutbound.map((o: any) => o.kind),
            fileOutbound: fileOut ?? null,
            toolCalls: allToolCalls,
          }
        }}
      />,
    )

    const result = await waitForPageResult(300_000)
    await takePageScreenshot('wechat-017-file-out-docx')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-017-file-out-docx',
      prompt: '(wechat: "生成 word 会议纪要" → create + SendWeChatMedia(file))',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `kinds=${(payload?.allOutboundKinds ?? []).join(',')} fileName=${payload?.fileOutbound?.fileName ?? ''} tools=${(payload?.toolCalls ?? []).join(',')}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '"给我写份 Word 纪要" → 生成 docx/pdf/... → SendWeChatMedia(file) 发回微信',
      tags: ['wechat', 'file', 'multimodal', 'outbound'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Ground truth: a file bubble arrived (SendWeChatMedia delivered the
    // generated docx). See 011 for why we no longer assert on toolCalls.
    expect(payload?.fileOutbound).not.toBeNull()
    expect(String(payload?.fileOutbound?.fileName ?? '')).toMatch(/\.(docx|pdf|xlsx|pptx|txt|md)$/i)
  })
})
