/**
 * 039: PDF 总结 → DOCX（多轮）— 覆盖真实故障场景。
 *
 * 真实故障 session: chat_20260418_154659_tdvozv1n
 * 用户给 170 页 PDF，先让 AI 分析，再要求"输出总结到 Word 文档"。
 * Qwen Flash 在第二轮的灾难性 fallback 链：
 *   1. Write SPA65_AHTS_Summary.md
 *   2. DocConvert md→docx → [TOOL_ERROR] Unsupported conversion: .md → .docx
 *   3. 改走 Write summary.html + DocConvert html→docx，仍失败
 *   4. pip install python-docx + 写 326 行 Python 脚本 + 4 次 Edit 修 API bug
 *   最终累计 4 轮重试 / 15 步 / 680KB 错产出，用户才勉强拿到 40KB 残缺 DOCX。
 *
 * 正确路径：直接 WordMutate(action='create', content=[结构化块])，一次产出 DOCX。
 *
 * 正向断言：第一轮读 PDF + 第二轮 WordMutate create
 * 负向断言：禁止 md/html→docx 转换尝试；禁止 Python 脚本手撸；禁止 Agent 子代理 fallback
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'
// 与真实故障 session 一致：Qwen Flash（小模型更容易退化为 Python 脚本 fallback）
const MODEL_ID = 'qwen:OL-TX-006'

it('039 — PDF 总结 → Word：直接 WordMutate create，不走 MD 中转', async () => {
  const sessionId = `chat_probe_039_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '分析一下里面的内容'
  const followUp = '输出总结到 Word 文档'

  const { tags } = await (commands as any).stageAttachments({
    sessionId,
    files: ['BMR_PLA34_en_v2-3.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      sessionId={sessionId}
      chatModelId={MODEL_ID}
      approvalStrategy="approve-all"
    />,
  )

  // 多轮 + PDF 分析需要较长超时（session 单轮就花了 79s）
  await waitForChatComplete(300_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-021-pdf-summary-to-docx')
  const meta = {
    testCase: 'office-create-021-pdf-summary-to-docx',
    prompt: `${prompt} → ${followUp}`,
    model: MODEL_ID,
    result,
    description: '多轮：读 PDF 后总结输出到 Word，禁止 MD 中转 / Python 手撸 fallback',
    tags: ['multi-turn', 'pdf', 'docx', 'wordmutate', 'regression'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 正向断言 ──
  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(2)
  expect(result.messages.length).toBeGreaterThanOrEqual(4)

  // 第一轮必须读 PDF
  const usedRead = result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')
  expect(usedRead).toBe(true)

  // 第二轮必须用 WordMutate 直接 create（唯一正确路径）
  expect(result.toolCalls).toContain('WordMutate')

  // ── 负向断言：覆盖真实故障 session 的 4 种 fallback 模式 ──
  const details = result.toolCallDetails ?? []

  // 1) 任意工具失败（session 里 DocConvert md→docx 报了 TOOL_ERROR）
  const failed = details.filter(d => d.hasError).map(d => ({ name: d.name, err: d.errorSummary }))
  expect(result.toolErrorCount, `工具失败明细: ${JSON.stringify(failed)}`).toBe(0)

  // 2) Python 脚本手撸 fallback：Write 出 .py + Bash python3 跑
  const wroteAnyPy = details.some(d => {
    if (d.name !== 'Write') return false
    const p = (d.input as Record<string, unknown> | undefined)?.file_path
    return typeof p === 'string' && p.endsWith('.py')
  })
  expect(wroteAnyPy, 'AI 退化到写 Python 脚本手撸 DOCX（应直接用 WordMutate create）').toBe(false)

  // 3) DocConvert 不支持 md/html → docx：模型若尝试即视为走错路径
  const triedMdOrHtmlToDocx = details.some(d => {
    if (d.name !== 'DocConvert') return false
    const input = d.input as Record<string, unknown> | undefined
    const src = input?.filePath
    const out = input?.outputFormat
    return typeof src === 'string'
      && out === 'docx'
      && (src.endsWith('.md') || src.endsWith('.html'))
  })
  expect(
    triedMdOrHtmlToDocx,
    'AI 试图用 DocConvert 把 md/html 转 docx（DocConvert 不支持，应直接 WordMutate create）',
  ).toBe(false)

  // 4) Agent 子代理 fallback（session 里是"绝望"退路）
  expect(result.toolCalls).not.toContain('Agent')

  // AI 语义评判：第二轮回复应确认 Word 已创建且内容来自 PDF 总结
  const judgment = await aiJudge({
    testCase: 'office-create-021-pdf-summary-to-docx',
    serverUrl: SERVER_URL,
    criteria:
      '这是多轮对话的第二轮回复。AI 应确认已生成一份总结原 PDF 内容的 Word 文档。' +
      '满足以下任一即通过：1) 提到 Word / DOCX 文件已创建/生成/保存；' +
      '2) 工具调用包含 WordMutate 且回复不为空',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
