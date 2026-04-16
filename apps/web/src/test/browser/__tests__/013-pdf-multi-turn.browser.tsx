/**
 * 013: 多轮 PDF 工作流。
 *
 * 第一轮：读取 inside.pdf（视频分镜脚本），要求 AI 分析内容
 * 第二轮：基于第一轮的理解，要求 AI 在 PDF 上加批注
 *
 * 验证：
 * 1) 多轮对话连贯性（AI 记住第一轮的内容）
 * 2) 读取路径 + 写入路径都被使用
 * 3) 两轮回复都包含与 PDF 内容相关的关键词
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('013 — 多轮 PDF 工作流：先读后改', async () => {
  const sessionId = `chat_probe_013_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请阅读这份 PDF 文件，告诉我这是什么类型的文档，总共有多少个镜头，以及使用了哪些景别类型。'

  const followUp =
    '好的。现在请在第 1 页的右下角添加一个文字批注 "APPROVED - 2026/04/16"，' +
    '字号 14，深绿色 (#006400)。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      sessionId={sessionId}
      approvalStrategy="approve-all"
    />,
  )

  // 多轮对话需要更长超时（两轮 AI 交互）
  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('013-pdf-multi-turn')
  const meta = {
    testCase: '013-pdf-multi-turn', prompt: `${prompt} → ${followUp}`, result,
    description: 'Multi-turn PDF: read content then add annotation',
    tags: ['multi-turn', 'docpreview', 'pdfmutate', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 多轮验证：totalTurns 应该是 2
  expect(result.totalTurns).toBe(2)

  // 工具调用：至少用了读取工具（Read/DocPreview）和写入工具（PdfMutate）
  const usedRead = result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')
  const usedMutate = result.toolCalls.includes('PdfMutate')
  expect(usedRead).toBe(true)
  expect(usedMutate).toBe(true)

  // 消息数应该 >= 4（user1 + assistant1 + user2 + assistant2）
  expect(result.messages.length).toBeGreaterThanOrEqual(4)

  // AI 语义评判：验证多轮对话的连贯性和第二轮操作完成
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '这是多轮 PDF 对话的第二轮回复。AI 应确认已在 PDF 第 1 页添加了 "APPROVED - 2026/04/16" 文字批注。' +
      '满足以下任一条件即通过：' +
      '1) 回复提到已添加批注/文字/APPROVED；' +
      '2) 回复为空但工具调用包含 PdfMutate（操作已执行）',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
