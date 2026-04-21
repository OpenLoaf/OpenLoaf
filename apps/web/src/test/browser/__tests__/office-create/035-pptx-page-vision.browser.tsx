/**
 * office-create/035: PptxInspect.render → CloudImageUnderstand 链路。
 *
 * 附件一份真实 PPTX（含图表/排版），让 AI 看某一页的内容。正确路径是：
 * PptxInspect(render, slideNumbers=[N]) 把目标页渲染成 PNG，再用
 * CloudImageUnderstand 把图丢给视觉模型描述。纯 `text` 抽文字拿不到图表语义。
 * 断言：toolCalls 同时包含 PptxInspect 和 CloudImageUnderstand，aiJudge 判描述是否贴合该页视觉内容。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-035 — PptxInspect.render + CloudImageUnderstand：识别某一页视觉内容', async () => {
  const sessionId = `chat_probe_office_create_035_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '把这份 PPT 的第 3 页渲染成图片，再用视觉识图描述这一页即可。一次 render + 一次识图就够了，不要再调其他 PptxInspect action 交叉验证。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['haikesen-energy-deck.pptx'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(240_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-035-pptx-page-vision')
  const meta = {
    testCase: 'office-create-035-pptx-page-vision', prompt, result,
    description: 'PptxInspect.render → CloudImageUnderstand 对单页识图',
    tags: ['pptxinspect', 'render', 'vision', 'cloudimageunderstand'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 正确路径：PptxInspect 先 render 单页
  expect(result.toolCalls).toContain('PptxInspect')
  // 必须把渲染出来的 PNG 丢给 CloudImageUnderstand（这才是"看图"）
  expect(result.toolCalls).toContain('CloudImageUnderstand')

  // 禁止通过 Bash 执行 python：视觉链路只走 PptxInspect.render + CloudImageUnderstand
  const pythonCalls = (result.toolCallDetails ?? []).filter(
    (d: any) => d.toolName === 'Bash' && /python/.test(d.input?.command ?? ''),
  )
  expect(pythonCalls.length, '不应通过 Bash 执行 python 命令').toBe(0)

  // 步数容差：理想 ≤6（LoadSkill + ToolSearch + summary + render + CloudImageUnderstand + 回答）
  const callCount = result.toolCallDetails?.length ?? result.toolCalls.length
  expect(
    callCount,
    `工具调用 ${callCount} 超标；理想链路 ≤6。`,
  ).toBeLessThanOrEqual(8)

  const judgment = await aiJudge({
    testCase: 'office-create-035-pptx-page-vision',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否通过视觉路径描述了该页内容。满足任一通过：' +
      '1) 回复覆盖了某一页的视觉层信息（标题/要点/图表含义/排版特征）；' +
      '2) 回复为空但 toolCalls 同时包含 PptxInspect 和 CloudImageUnderstand（链路已走通，由客户端展示结果）。' +
      '反例（不通过）：只提"PPT 一共多少页"之类的 summary 输出，没有进入具体页内容。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
