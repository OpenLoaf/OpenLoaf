/**
 * wechat/014 — inbound text file → agent reads + summarizes.
 *
 * Send a tiny "季度报告.txt" as a file_item. Since it's a plain text file,
 * Read / DocConvert should pick it up. Per identity.md rule 7, the agent
 * should at least call one of PdfInspect/WordInspect/ExcelInspect/Read/DocConvert.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import fileMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-file-report.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

/** `季度营收 100 万，同比增长 20%。\n最大客户：A 公司。\n` UTF-8 base64.
 *  Browser env has no `Buffer`; compute via TextEncoder + btoa(binary string). */
const TINY_TXT_B64 = (() => {
  const bytes = new TextEncoder().encode(
    '季度营收 100 万，同比增长 20%。\n最大客户：A 公司。\n',
  )
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
})()

describe('wechat/014 — file inbound → read + summarize', () => {
  it('wechat-014-file-in-summarize — file bubble triggers read tool', { timeout: 240_000 }, async () => {
    const accountId = `wx-browser-test-014-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-014' })
          await api.registerMockMedia(
            'mock-file-001-aeskey',
            TINY_TXT_B64,
            'file',
            '季度报告.txt',
          )
          await api.inject([
            {
              ...fileMsg,
              message_id: `mock-in-file-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
              item_list: [
                {
                  file_item: {
                    file_name: '季度报告.txt',
                    media: {
                      aes_key: 'mock-file-001-aeskey',
                      encrypt_query_param: 'mock-file-001-eqp',
                    },
                    // atob decodes base64 → binary string; its length == byte length.
                    len: String(atob(TINY_TXT_B64).length),
                  },
                },
                { text_item: { text: '帮我总结这份报告的要点' } },
              ],
            },
          ])
          // fast-ack lands first with a generic "好的，正在处理"; poll until
          // the full agent has actually invoked a reader tool before closing.
          const READER_TOOLS = ['Read', 'DocConvert', 'PdfInspect', 'WordInspect', 'ExcelInspect', 'PptxInspect']
          const deadline = Date.now() + 150_000
          while (Date.now() < deadline) {
            const msgs = await api.getMessages()
            const hit = msgs.some((m: any) =>
              (m.parts ?? []).some((p: any) => {
                const t = typeof p?.type === 'string' ? p.type : ''
                return t.startsWith('tool-') && READER_TOOLS.includes(t.slice(5))
              }),
            )
            if (hit) break
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
          return {
            outboundLen: finalOutbound.length,
            allOutboundKinds: finalOutbound.map((o: any) => o.kind),
            outboundText: finalOutbound
              .filter((o: any) => o.kind === 'text')
              .map((o: any) => o.text)
              .join(' | '),
            toolCalls: allToolCalls,
          }
        }}
      />,
    )

    const result = await waitForPageResult(180_000)
    await takePageScreenshot('wechat-014-file-in-summarize')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-014-file-in-summarize',
      prompt: '(wechat: inject txt file + "总结要点", expect Read/DocConvert tool invocation)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `tools=${(payload?.toolCalls ?? []).join(',')} text=${String(payload?.outboundText ?? '').slice(0, 120)}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '入站文件 + 文字求总结 → agent 调 Read/DocConvert/*Inspect 之一消化并给出纯文本摘要',
      tags: ['wechat', 'file', 'multimodal', 'inbound'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    expect(payload?.outboundLen).toBeGreaterThanOrEqual(1)
    for (const k of (payload?.allOutboundKinds ?? []) as string[]) {
      expect(k).toBe('text')
    }
    const readerTools = ['Read', 'DocConvert', 'PdfInspect', 'WordInspect', 'ExcelInspect', 'PptxInspect']
    const hit = readerTools.some((t) => (payload?.toolCalls ?? []).includes(t))
    expect(hit, `expected one of ${readerTools.join('/')} in toolCalls, got ${JSON.stringify(payload?.toolCalls)}`).toBe(true)
  })
})
