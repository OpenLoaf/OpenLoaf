/**
 * 007: 大 PDF 分段读取 + 内容质量验证。
 *
 * 使用中文大 PDF（超级个体288行动服务手册），验证：
 * 1) AI 使用了文档工具
 * 2) 回复包含 PDF 实际内容的关键词（不是泛泛而谈）
 * 3) 回复有结构化分析（章节/目录/要点）
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('007 — 大 PDF 分段读取：内容关键词和结构化分析', async () => {
  const sessionId = `chat_probe_007_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '这份手册太长了，请先快速浏览一下，告诉我：1) 这本手册的主题是什么？2) 大概有哪些核心章节或部分？3) 这本手册面向什么样的读者？'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['超级个体288行动服务手册.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  // allowToolErrors: true — AI 首轮可能撞大 PDF 的 schema/参数错误后自愈成功（最终答案正确），
  // 严格模式会把中间错误 throw 掉导致绿 prompt 判红。
  const result = await waitForProbeResult(120_000, { allowToolErrors: true })

  // Save data before assertions
  await takeProbeScreenshot('file-read-013-docpreview-pdf-paged')
  const meta = {
    testCase: 'file-read-013-docpreview-pdf-paged', prompt, result,
    description: '大 PDF 分段读取：先 preview 再分页 full',
    tags: ['docpreview', 'pdf', 'paged-read', 'content-verification'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了文档工具
  expect(result.toolCalls.length).toBeGreaterThan(0)

  // AI 语义评判：验证大 PDF 分段读取后的内容理解质量
  const judgment = await aiJudge({
    testCase: 'file-read-013-docpreview-pdf-paged',
    serverUrl: SERVER_URL,
    criteria:
      '回复必须满足以下条件：' +
      '1) 准确说出手册的主题（与"超级个体"或"288行动"相关）；' +
      '2) 列出至少 3 个核心章节或部分（结构化分点，而非泛泛一段话）；' +
      '3) 说明手册面向的读者群体',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
