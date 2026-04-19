/**
 * 基础 smoke / 回归：ToolSearch 加载工具后，下一轮必须调用工具本身，
 * 不能把工具名当 Bash 命令执行（如 `web_search "..."`）。
 *
 * 历史 bug：basic-007 session chat_probe_20260418131846_a6ng26ad
 *   模型 ToolSearch(names: "WebSearch") 成功拿到 schema 后，
 *   下一轮却调了 Bash(command: `web_search "..."`) → zsh: command not found。
 *   之后才回正调真 WebSearch。
 *
 * 本用例用一个纯事实查询诱导 ToolSearch→WebSearch 路径：
 *   - 单句事实问答，不触发 visualization-ops-skill
 *   - 模型知识里没有（版本号会过时），必须走搜索
 *   - Bash 在此场景没有任何正当用途 → 出现即视为退化
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForMessageCount,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('basic-011-toolsearch-tool-not-bash — ToolSearch 加载的工具不应被当作 Bash 命令执行', async () => {
  const prompt = '查一下 Next.js 目前的最新稳定版本号是几点几。一句话回答就行。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(120_000)

  // allowToolErrors: true — 我们需要自己分析 Bash 调用，严格模式会先 throw 失去信息
  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('basic-011-toolsearch-tool-not-bash')
  const meta = {
    testCase: 'basic-011-toolsearch-tool-not-bash',
    prompt,
    result,
    description: 'ToolSearch 加载工具后必须调工具本身，禁止把工具名当 Bash 命令执行',
    tags: ['basic', 'tool-loading', 'toolsearch', 'regression'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 主路径：必须真的调到 WebSearch 本体
  expect(result.toolCalls).toContain('WebSearch')

  // 回归断言 A：Bash 根本不该被调用 —— 这是事实查询，Bash 毫无正当用途
  expect(result.toolCalls).not.toContain('Bash')

  // 回归断言 B（兜底）：若真出现 Bash，command 里不能塞任何已知工具名
  // 防的是主模型把工具名当 shell 命令这种退化
  const bashCalls = result.toolCallDetails.filter(t => t.name === 'Bash')
  const suspiciousCommandPattern = /\b(web[_-]?search|tool[_-]?search|load[_-]?skill|cloud[_-]?image|cloud[_-]?video|cloud[_-]?tts|cloud[_-]?user[_-]?info)\b/i
  for (const call of bashCalls) {
    const cmd = typeof (call.input as any)?.command === 'string' ? (call.input as any).command : ''
    expect(cmd).not.toMatch(suspiciousCommandPattern)
  }

  // 任何工具失败都视为回归
  expect(result.toolErrorCount).toBe(0)

  // 回复必须言之有物
  expect(result.textPreview.length).toBeGreaterThan(5)
})
