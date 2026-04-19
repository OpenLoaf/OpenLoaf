/**
 * Thinking shimmer「等待工具结果...」文案测试。
 *
 * 回归场景：工具已派发但尚未返回（input-available / output-streaming）期间，
 * MessageList 应强制渲染 MessageThinking，且文案切换为 tool.thinkingAwaitingTool。
 *
 * 策略：
 * 1. 让模型通过 Bash 工具执行一个持续 10 秒的阻塞脚本（每秒输出一次百分比）。
 * 2. 流式开始后并行采样 DOM，持续监听是否命中 i18n 后的「等待工具结果...」文案。
 * 3. 命中时立刻截图作为中段证据，最后再截一张完成态对照图。
 *
 * 匹配四语言都保留的相同 key — zh-CN / zh-TW / en-US / ja-JP。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  waitForProbeStatus,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

const AWAITING_TOOL_CANDIDATES = [
  '等待工具结果',
  '等待工具結果',
  'Waiting for tool result',
  'ツールの結果を待機中',
]

it('030 — Thinking shimmer switches to "awaiting tool" while Bash is blocking', async () => {
  // 严格要求模型调用一个长阻塞的 Bash，产生可观察的等待窗口。
  // 脚本：每秒输出一次百分比进度，10 秒后自动结束。
  const prompt = [
    '请使用 Bash 工具执行下面这条命令（原样执行，不要改写、不要拆成多个命令、也不要提前终止）：',
    '',
    '```bash',
    'for i in $(seq 1 10); do echo "${i}0%"; sleep 1; done; echo DONE',
    '```',
    '',
    '这个脚本会阻塞约 10 秒、每秒输出一次百分比进度，最后输出 DONE。',
    '完整执行完后，用一句中文告诉我是否观察到 10% → 100% 的百分比进度以及 DONE 标记。',
  ].join('\n')

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
    />,
  )

  // 等流式开始，避免在提交阶段误采样到旧 DOM
  await waitForProbeStatus('streaming', 60_000)

  // 并行采样：在流式期间持续检查 Thinking shimmer 是否出现等待文案
  let sawAwaitingTool = false
  let midstreamShotSaved = false
  const maxSampleMs = 180_000
  const sampler = (async () => {
    const start = Date.now()
    while (Date.now() - start < maxSampleMs) {
      const harness = document.querySelector('[data-testid="chat-probe-harness"]') as HTMLElement | null
      const text = harness?.textContent ?? ''
      if (!sawAwaitingTool && AWAITING_TOOL_CANDIDATES.some((c) => text.includes(c))) {
        sawAwaitingTool = true
        if (!midstreamShotSaved) {
          midstreamShotSaved = true
          try {
            await takeProbeScreenshot('chat-ui-003-thinking-awaiting-tool-midstream')
          } catch {
            /* 截图失败不影响断言 */
          }
        }
      }
      const status = harness?.getAttribute('data-probe-status')
      if (status === 'complete' || status === 'error') break
      await new Promise((r) => setTimeout(r, 250))
    }
  })()

  await Promise.all([waitForChatComplete(240_000), sampler])
  const result = await waitForProbeResult()

  await takeProbeScreenshot('chat-ui-003-thinking-awaiting-tool')

  const meta = {
    testCase: 'chat-ui-003-thinking-awaiting-tool',
    prompt,
    result: { ...result, sawAwaitingTool },
    description:
      '阻塞型 Bash 执行时切到「等待工具结果…」文案',
    tags: ['thinking', 'bash', 'awaiting-tool', 'i18n'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 工具被正确调用 ──
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('Bash')

  // ── 阻塞期间命中「等待工具结果...」文案 ──
  expect(sawAwaitingTool).toBe(true)
}, 300_000)
