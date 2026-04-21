/**
 * office-create/035: PptxInspect.render → native vision 链路。
 *
 * 附件一份真实 PPTX（含图表/排版），让 AI 看某一页的内容。正确路径是：
 * PptxInspect(render, slideNumbers=[N]) 把目标页渲染成 PNG，然后 Read 图片路径。
 * Read 返回的 <system-tag type="attachment" .../> 在下一步被展开为原生图片 block，
 * 模型直接看到图片内容并描述。纯 `text` 抽文字拿不到图表语义。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-035 — PptxInspect.render + native vision：识别某一页视觉内容', async () => {
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
    description: 'PptxInspect.render → Read (native vision) 对单页识图',
    tags: ['pptxinspect', 'render', 'vision', 'read', 'native-vision'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 正确路径：PptxInspect 先 render 单页
  expect(result.toolCalls).toContain('PptxInspect')

  // 原生视觉路径：Read 返回 attachment tag → 自动展开为图片 → 模型直接描述
  // 非视觉模型 fallback: CloudImageUnderstand
  const hasRead = result.toolCalls.includes('Read')
  const hasCloudVision = result.toolCalls.includes('CloudImageUnderstand')
  expect(
    hasRead || hasCloudVision,
    '应通过 Read（原生视觉）或 CloudImageUnderstand（非视觉模型）识图',
  ).toBe(true)

  // 禁止通过 Bash 执行 python
  const pythonCalls = (result.toolCallDetails ?? []).filter(
    (d: any) => d.toolName === 'Bash' && /python/.test(d.input?.command ?? ''),
  )
  expect(pythonCalls.length, '不应通过 Bash 执行 python 命令').toBe(0)

  // 步数容差：理想 ≤7（LoadSkill + ToolSearch + render + Read + 回答）
  const callCount = result.toolCallDetails?.length ?? result.toolCalls.length
  expect(
    callCount,
    `工具调用 ${callCount} 超标；理想链路 ≤7。`,
  ).toBeLessThanOrEqual(9)

  const judgment = await aiJudge({
    testCase: 'office-create-035-pptx-page-vision',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否通过视觉路径描述了该页内容。满足任一通过：' +
      '1) 回复覆盖了某一页的视觉层信息（标题/要点/图表含义/排版特征）；' +
      '2) 回复为空但 toolCalls 同时包含 PptxInspect 和 Read/CloudImageUnderstand（链路已走通，由客户端展示结果）。' +
      '反例（不通过）：只提"PPT 一共多少页"之类的 summary 输出，没有进入具体页内容。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
