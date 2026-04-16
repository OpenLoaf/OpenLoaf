/**
 * 005: 图片读取 + suggest skill。
 * 断言：使用 Read 工具，回复描述了图片内容。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('005 — 图片读取，回复描述图片', async () => {
  const sessionId = `chat_probe_005_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这张图片是什么？'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['21fa3e725d110225873bcc2b9eadae99.jpg'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  // Save data before assertions (recorded even on failure)
  await takeProbeScreenshot('005-read-image')
  const meta = { testCase: '005-read-image-suggest-skill', prompt, result, description: 'Read image, substantive description returned', tags: ['read-tool', 'image', 'suggest-skill'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Assertions
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('Read')
  // 断言：有实质性描述（不是空回复）
  expect(result.textPreview.length).toBeGreaterThan(20)
})
