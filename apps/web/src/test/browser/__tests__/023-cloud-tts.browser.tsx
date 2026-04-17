/**
 * 023: Cloud TTS 语音合成。
 *
 * 验证 AI 用命名工具 CloudTTS 完成文生语音（内部自动选 TTS variant），
 * 不传 undefined，不会 400。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('023 — Cloud TTS：文字转语音', async () => {
  const prompt = '帮我把下面这段话转成语音：今天的天气特别好，适合出去散散步，呼吸一下新鲜空气。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} title="023 — Cloud TTS 语音合成" approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('023-cloud-tts')
  const meta = {
    testCase: '023-cloud-tts', prompt, result,
    description: '云端文字转语音：按 Detail 返回的 input key 调用',
    tags: ['cloud', 'audio', 'tts'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 命名工具路径：TTS 扁平入口
  expect(result.toolCalls).toContain('CloudTTS')

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认语音已生成成功（如"已生成语音"、"点击播放"、"音频已合成"等）。' +
      '前端 UI 会自动渲染音频播放器，所以 AI 不需要在文本里给出 URL 路径，一句确认即可。' +
      '不应出现 "400"、"expected string"、"received undefined"、"API 参数兼容"、"无法完成" 之类的报错或失败词汇。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
