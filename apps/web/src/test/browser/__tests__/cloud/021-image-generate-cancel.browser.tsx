/**
 * 021: Cloud 图片生成 — 任务取消流程。
 *
 * 验证 `ai.cancelCloudTask` trpc 接口在 CloudImageGenerate 进行中被调用时：
 * 1. 能查到 PendingCloudTask 行 → 调 SaaS v3CancelTask 成功 → 接口回 ok=true
 * 2. 消息 tool part 最终反映取消语义（output-error 含 [cancelled]，或 tool 返回
 *    payload.status === 'canceled'）
 *
 * 成本考量：走最便宜的图片生成 variant（modelHint 让 AI 自选 credits 最低的），
 * 而不是跑视频生成那种 5 分钟级长任务，保持测试便宜可重复跑。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

type CancelResult = {
  ok: boolean
  status?: 'cancelled' | 'not_found' | 'already_done'
  message?: string
}

/**
 * 轮询内存消息，等到第一个 CloudImageGenerate tool part 处于"执行中"
 * （state 非 output-available / output-error）且已有 toolCallId，即返回。
 * 超时抛错以便外层 aiJudge 兜底。
 */
function pickInflightImageGenerateToolCallId(): string | null {
  const messages = ((window as any).__probe_getMessages?.() ?? []) as any[]
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    for (const part of parts) {
      const type = typeof part?.type === 'string' ? part.type : ''
      const isTarget =
        type === 'tool-CloudImageGenerate' ||
        part?.toolName === 'CloudImageGenerate'
      if (!isTarget) continue
      const state = part?.state ?? ''
      const terminal = state === 'output-available' || state === 'output-error' || state === 'output-denied'
      if (terminal) continue
      const toolCallId = part?.toolCallId ?? part?.toolInvocation?.toolCallId
      if (typeof toolCallId === 'string' && toolCallId.length > 0) return toolCallId
    }
  }
  return null
}

/**
 * 不断抓 toolCallId 并尝试 cancel，直到拿到终态（cancelled/already_done）或超时。
 *
 * 为什么这样设计：
 * - `insertPending` 发生在 runV3GenerateAndSave 里 v3Generate 返回 taskId 之后，
 *   而 AI SDK 的 tool part 在 LLM 发出 tool call 的一瞬间就已经拿到 toolCallId，
 *   比 insertPending 早 ~500ms-2s。所以首次 cancel 常返回 `not_found` — 这不是
 *   失败，只是时序没对上，继续重试直到窗口打开。
 * - 反过来，如果任务已跑完（状态 'input-available' 稍纵即逝变成 'output-available'），
 *   cancel 会回 `already_done`；这种情况说明任务太快，用例本轮测不到取消路径。
 */
async function raceToCancel(timeout = 60_000): Promise<{ toolCallId: string | null; cancel: CancelResult; attempts: number }> {
  const start = Date.now()
  let lastToolCallId: string | null = null
  let lastCancel: CancelResult = { ok: false, message: 'never attempted' }
  let attempts = 0
  while (Date.now() - start < timeout) {
    const id = pickInflightImageGenerateToolCallId()
    if (id) {
      lastToolCallId = id
      attempts++
      lastCancel = await callCancelCloudTask(id)
      if (lastCancel.ok && lastCancel.status === 'cancelled') return { toolCallId: id, cancel: lastCancel, attempts }
      if (lastCancel.status === 'already_done') return { toolCallId: id, cancel: lastCancel, attempts }
    }
    await new Promise(r => setTimeout(r, 200))
  }
  return { toolCallId: lastToolCallId, cancel: lastCancel, attempts }
}

async function callCancelCloudTask(toolCallId: string): Promise<CancelResult> {
  const res = await fetch(`${SERVER_URL}/trpc/ai.cancelCloudTask?batch=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
    body: JSON.stringify({ '0': { json: { toolCallId } } }),
  })
  const text = await res.text()
  // trpc batch 返回形如 [{ result: { data: { json: {...} } } }]
  try {
    const parsed = JSON.parse(text)
    const data = parsed?.[0]?.result?.data?.json ?? parsed?.[0]?.result?.data
    if (data && typeof data === 'object') return data as CancelResult
  } catch {}
  return { ok: false, message: `cancel trpc raw=${text.slice(0, 200)}` }
}

it('cloud-021-image-generate-cancel — 图片生成过程中手动取消任务', async () => {
  const prompt = '帮我生成一张猫的图片，请使用最便宜的模型'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="021 — Cloud 图片生成取消"
      approvalStrategy="approve-all"
    />,
  )

  // 并发：一条持续抓 toolCallId 并重试 cancel，一条等待整个 chat 结束。
  const cancelPromise = raceToCancel(90_000)

  await waitForChatComplete(300_000)
  // 取消本身必然产生 tool error（CloudImageGenerate 返回 cancelled payload），放行
  const result = await waitForProbeResult(60_000, { allowToolErrors: true })
  const { toolCallId, cancel, attempts } = await cancelPromise
  // eslint-disable-next-line no-console
  console.log('[cloud-021] cancel result:', { toolCallId, cancel, attempts })

  await takeProbeScreenshot('cloud-021-image-generate-cancel')
  const meta = {
    testCase: 'cloud-021-image-generate-cancel',
    prompt,
    result,
    description: '云端图片生成任务手动取消（最便宜模型）',
    tags: ['cloud', 'image', 'cancel'],
    extra: { cancel, toolCallId, attempts },
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.toolCalls).toContain('CloudImageGenerate')

  // 取消接口必须回到 ok=true 且 status='cancelled'。若 not_found / already_done 说明
  // 时序没对上（比如 tool 已经跑完），这个用例没测到取消路径——直接 FAIL。
  expect(cancel.ok).toBe(true)
  expect(cancel.status).toBe('cancelled')

  // 取消生效后，对应 tool part 的最终形态必须反映取消：
  //   A) state==='output-error' 且 errorText 含 '[cancelled]' — 来自 patchMessageToolPart
  //   B) payload.status==='canceled' — pollTaskUntilDone 读到 SaaS 终态时走的分支
  const target = result.toolCallDetails.find(t => t.name === 'CloudImageGenerate')
  expect(target).toBeTruthy()
  const stateOk = target?.state === 'output-error'
  const errorMentionsCancel = typeof target?.errorSummary === 'string' && /cancel/i.test(target.errorSummary)
  const outputRaw = typeof target?.output === 'string' ? target.output : JSON.stringify(target?.output ?? '')
  const outputMentionsCancel = /cancel/i.test(outputRaw)
  expect(stateOk || errorMentionsCancel || outputMentionsCancel).toBe(true)

  // AI 最终回复应对用户说明"已取消"或类似语义，不应继续幻称图片生成成功。
  const judgment = await aiJudge({
    testCase: 'cloud-021-image-generate-cancel',
    serverUrl: SERVER_URL,
    criteria:
      '回复应该清楚告知用户任务已被取消（例如"任务已取消"、"已中止"、"cancel" 等），不应声称图片生成成功或展示生成结果。允许 AI 追问是否重试。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
