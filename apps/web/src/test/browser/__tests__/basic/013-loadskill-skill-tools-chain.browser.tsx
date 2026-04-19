/**
 * 基础 smoke / 回归：LoadSkill 触发 → skill 正文返回 → 按清单 ToolSearch
 * 批量激活工具 → 工具被实际调用，整条链路必须无错跑通。
 *
 * 选用 visualization-ops-skill 作为载体：
 *   - 触发词明确（"搜 ... 对比"），LoadSkill 必被调
 *   - skill 清单里有 WebSearch + JsxCreate/ChartRender，需要 ToolSearch 再激活
 *   - 覆盖 "LoadSkill + 加载后加载工具" 完整链路
 *
 * 关注点不是回答内容质量，而是三个阶段都发生且无错误：
 *   1. LoadSkill(skillName="visualization-ops-skill")
 *   2. ToolSearch 激活 WebSearch（及其他可视化工具）
 *   3. WebSearch 实际执行拿到结果
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

it('basic-013-loadskill-skill-tools-chain — LoadSkill 后按清单 ToolSearch 并调用工具', async () => {
  const prompt = '搜一下最近主流的 3 款 AI 编码助手（如 Cursor、Copilot 之类），简单对比一下各家核心特点。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('basic-013-loadskill-skill-tools-chain')
  const meta = {
    testCase: 'basic-013-loadskill-skill-tools-chain',
    prompt,
    result,
    description: 'LoadSkill → ToolSearch → 工具调用完整链路，不能在中间退化',
    tags: ['basic', 'tool-loading', 'loadskill', 'toolsearch', 'chain'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 阶段 1：LoadSkill 被调用，参数指向 visualization-ops-skill
  expect(result.toolCalls).toContain('LoadSkill')
  const loadSkillCalls = result.toolCallDetails.filter(t => t.name === 'LoadSkill')
  expect(loadSkillCalls.length).toBeGreaterThanOrEqual(1)
  const loadedVisualization = loadSkillCalls.some(call => {
    const input = call.input as any
    const skillName = typeof input?.skillName === 'string' ? input.skillName : ''
    return skillName === 'visualization-ops-skill'
  })
  expect(loadedVisualization).toBe(true)

  // 阶段 2：ToolSearch 被调用（加载技能清单里非 core 的工具）
  expect(result.toolCalls).toContain('ToolSearch')

  // 阶段 3：WebSearch 被实际调用（skill 工具清单主干之一）
  expect(result.toolCalls).toContain('WebSearch')

  // 工具名不应被误当 shell 命令（同 011 回归）
  const bashCalls = result.toolCallDetails.filter(t => t.name === 'Bash')
  const suspiciousCommandPattern = /\b(web[_-]?search|tool[_-]?search|load[_-]?skill|jsx[_-]?create|chart[_-]?render)\b/i
  for (const call of bashCalls) {
    const cmd = typeof (call.input as any)?.command === 'string' ? (call.input as any).command : ''
    expect(cmd).not.toMatch(suspiciousCommandPattern)
  }

  // 链路任一环节出错都视为回归
  expect(result.toolErrorCount).toBe(0)

  // 最终回复应覆盖 3 家工具相关主题
  expect(result.textPreview.length).toBeGreaterThan(80)
})
