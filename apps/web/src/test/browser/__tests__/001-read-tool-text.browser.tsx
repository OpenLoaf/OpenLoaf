/**
 * 001: Read 工具读取纯文本附件。
 * 断言：调用 Read 工具，回复提到会议纪要相关内容。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('001 — Read 纯文本，回复总结会议纪要', async () => {
  const sessionId = `chat_probe_001_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '请用 Read 工具读取附件里的文本文件，告诉我这份会议纪要主要讨论了什么内容，有哪些关键结论。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['20260411094153-转写_赵振预定的会议-纪要文本-1.txt'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  // Save data before assertions (recorded even on failure)
  await takeProbeScreenshot('001-read-tool-text')
  const meta = { testCase: '001-read-tool-text', prompt, result, description: 'Read tool used, response summarizes meeting notes', tags: ['read-tool'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Assertions
  expect(result.status).toBe('ok')
  // 断言：应该使用了 Read 工具
  expect(result.toolCalls).toContain('Read')
  // 断言：回复有实质内容（会议纪要总结）
  expect(result.textPreview.length).toBeGreaterThan(50)
  expect(result.textPreview).toMatch(/会议|纪要|讨论|结论|总结/)
})
