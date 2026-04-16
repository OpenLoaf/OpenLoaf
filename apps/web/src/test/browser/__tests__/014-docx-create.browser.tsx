/**
 * 014: DOCX 创建。
 *
 * 要求 AI 用 WordMutate create 生成一份中文 Word 报告。
 * 断言：调用了 WordMutate 工具，AI 语义评判确认文件已创建。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('014 — DOCX 创建：生成中文会议纪要', async () => {
  const prompt =
    '帮我创建一份 Word 会议纪要。会议主题："Q2 产品规划讨论"，日期 2026-04-16，' +
    '参会人：张三、李四、王五。讨论要点：1) 确定 Q2 核心功能优先级；' +
    '2) 移动端适配计划推迟到 Q3；3) 需要在 4 月底前完成 API 文档。' +
    '决议：张三负责功能排期，李四负责 API 文档。' +
    '保存为 meeting_notes_014.docx。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(90_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('014-docx-create')
  const meta = {
    testCase: '014-docx-create', prompt, result,
    description: 'WordMutate create action generates a Chinese meeting notes DOCX',
    tags: ['wordmutate', 'create', 'docx'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 WordMutate
  expect(result.toolCalls).toContain('WordMutate')

  // AI 语义评判：验证回复确认了 DOCX 创建并提及关键内容
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已成功创建 Word 会议纪要文件，并提到以下至少 2 项：' +
      'Q2 产品规划、参会人（张三/李四/王五）、讨论要点、决议内容、文件名',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
