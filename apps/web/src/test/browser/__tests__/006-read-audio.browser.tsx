/**
 * 006: 音频读取 + suggest skill。
 * 断言：使用 Read 工具，回复有实质内容。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('006 — 音频读取，回复有实质内容', async () => {
  const sessionId = `chat_probe_006_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这段录音说了什么？'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['20260411202356_8e98e4aeea1e5b29.wav'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(90_000)
  const result = await waitForProbeResult()

  // Save data before assertions (recorded even on failure)
  await takeProbeScreenshot('006-read-audio')
  const meta = { testCase: '006-read-audio-suggest-skill', prompt, result, description: 'Read audio, substantive response', tags: ['read-tool', 'audio', 'suggest-skill'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Assertions
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('Read')
  expect(result.textPreview.length).toBeGreaterThan(20)
})
