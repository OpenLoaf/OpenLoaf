/**
 * 003: DOCX 读取。
 * 断言：使用 Read 工具，回复包含文档相关内容。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('003 — DOCX 读取，回复描述文档内容', async () => {
  const sessionId = `chat_probe_003_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这份 Word 文档在讲什么？大概多长？'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['意大利光储充项目汇报(1).docx'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  // Save data before assertions (recorded even on failure)
  await takeProbeScreenshot('003-read-docx')
  const meta = { testCase: '003-read-docx-preview-format', prompt, result, description: 'Read tool used on DOCX, substantive response', tags: ['read-tool', 'docx'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Assertions
  expect(result.status).toBe('ok')
  expect(result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')).toBe(true)

  // AI 语义评判：验证回复准确描述了 DOCX 内容
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '这是一份关于意大利光储充项目的 Word 文档。回复应满足：' +
      '1) 准确说出文档主题（与意大利、光储充、能源项目相关）；' +
      '2) 说明文档大致长度或结构；' +
      '3) 有实质内容分析，不是泛泛而谈',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
