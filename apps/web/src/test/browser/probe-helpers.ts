/**
 * Chat Probe 测试辅助函数。
 *
 * 提供等待完成、截图、查询消息、读取结果等工具方法，
 * 供 *.browser.tsx 测试文件使用。
 */
import { page } from '@vitest/browser/context'
import type { ProbeResult } from './ChatProbeHarness'

/**
 * 等待 chat probe 进入指定状态。
 */
export async function waitForProbeStatus(
  status: 'complete' | 'error' | 'streaming' | 'ready',
  timeout = 120_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const attr = page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-status')
    if (attr === status) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Timeout waiting for probe status: ${status}`)
}

/**
 * 等待 chat 进入终态（complete 或 error）。error 也算"跑完了"——
 * 测试用例可以自己读 result.status 判断是否真的成功。
 */
export async function waitForChatComplete(timeout = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const attr = page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-status')
    if (attr === 'complete' || attr === 'error') return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for probe status: complete|error')
}

/**
 * 等待消息数量达到指定值。
 */
export async function waitForMessageCount(count: number, timeout = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = page.getByTestId('chat-probe-harness').element()
    const attr = el.getAttribute('data-probe-message-count')
    if (attr && Number.parseInt(attr, 10) >= count) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Timeout waiting for message count >= ${count}`)
}

/**
 * 获取当前 probe 状态。
 */
export function getProbeStatus(): string {
  return page.getByTestId('probe-status').element().textContent ?? ''
}

/**
 * 获取当前消息数量。
 */
export function getMessageCount(): number {
  const attr = page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-message-count')
  return attr ? Number.parseInt(attr, 10) : 0
}

/**
 * 获取 sessionId。
 */
export function getSessionId(): string {
  return page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-session-id') ?? ''
}

/**
 * 读取 ProbeResult JSON（在 onComplete 后可用）。
 */
export function getProbeResult(): ProbeResult | null {
  const el = page.getByTestId('probe-result-json').element()
  const raw = el.textContent
  if (!raw) return null
  try {
    return JSON.parse(raw) as ProbeResult
  } catch {
    return null
  }
}

export type WaitForProbeResultOptions = {
  /**
   * 允许 probe 过程中出现工具调用失败（`hasError=true`）。
   * 默认 `false`：任一工具报错都会 throw，强制暴露"工具异常"——符合"异常必须重视"原则。
   * 专门验证错误处理 / 审批拒绝 / 超时兜底的测试显式传 `true` 以放行。
   */
  allowToolErrors?: boolean
}

/**
 * 等待 ProbeResult 可用（onComplete 已触发）。
 *
 * 默认严格模式：若 `toolErrorCount > 0` 直接 throw，让测试 fail 到"工具失败列表"。
 * 这阻止了"aiJudge 看最终回复通过 → 过程中的 tool error 被忽略"的漏网。
 */
export async function waitForProbeResult(
  timeout = 120_000,
  options: WaitForProbeResultOptions = {},
): Promise<ProbeResult> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const result = getProbeResult()
    if (result) {
      // 把 ChatProbeHarness 在 onComplete 前抓到的 DOM 快照粘到 result 上。
      // `_domSnapshot` 是隐藏字段（不在 ProbeResult 类型里），saveTestData 在 Node 端
      // 会把它抽出来落到 data/<testCase>.dom.html，再从 result.json 里删掉，
      // 避免 result.json 因为 100KB-1MB 的 outerHTML 而变得难处理。
      try {
        const snap = typeof window !== 'undefined' ? window.__probeDomSnapshot : undefined
        if (typeof snap === 'string' && snap.length > 0) {
          ;(result as ProbeResult & { _domSnapshot?: string })._domSnapshot = snap
        }
      } catch {
        // ignore: dom snapshot is best-effort observability
      }
      if (!options.allowToolErrors && result.toolErrorCount > 0) {
        const failed = (result.toolCallDetails || [])
          .filter(t => t.hasError)
          .map(t => `${t.name}${t.errorSummary ? `: ${String(t.errorSummary).slice(0, 120)}` : ''}`)
          .join('\n  - ')
        throw new Error(
          `Probe completed but ${result.toolErrorCount} tool call(s) failed:\n  - ${failed}\n` +
            `若此用例刻意验证工具错误，调用 waitForProbeResult(timeout, { allowToolErrors: true }).`,
        )
      }
      return result
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for ProbeResult')
}

/**
 * 等待 DOM 停止变更（连续 `quietMs` 毫秒无任何 mutation），或到达 `maxWaitMs` 上限。
 *
 * 为什么需要：`waitForChatComplete` 只看 `data-probe-status=complete`，但此时：
 * - 工具流式输出（例如 bash 的 10%→100%→DONE）的 React state 批处理可能还在 flush
 * - Markdown / 代码高亮 / 消息列表 auto-scroll 还在 re-paint
 * - useChat 拿到 finishReason 后仍有 1-2 个 render cycle 把最后一帧正文提交到 DOM
 *
 * 如果截图紧跟 `waitForChatComplete` 就会截到"半成品"。
 */
export async function waitForDomSettle(
  target: Node = document.body,
  quietMs = 400,
  maxWaitMs = 3000,
) {
  return new Promise<void>((resolve) => {
    const deadline = Date.now() + maxWaitMs
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (Date.now() >= deadline) {
        cleanup(); resolve(); return
      }
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => { cleanup(); resolve() }, quietMs)
    })
    function cleanup() {
      if (quietTimer) clearTimeout(quietTimer)
      observer.disconnect()
    }
    observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true })
    // 立即启动一次静默窗口，完全没 mutation 的情况下也能解锁
    quietTimer = setTimeout(() => { cleanup(); resolve() }, quietMs)
  })
}

/**
 * 截图 — 保存到当前运行目录的 screenshots/ 下，
 * generate-report.mjs 会在生成报告时把 png 内嵌到 HTML 里。
 *
 * 注意：harness 默认 `height: 100vh` + 内部消息列表走 `overflow: auto`，
 * 直接 locator.screenshot 只会截到 viewport 一屏高度。
 * 截图前临时把 harness 和所有滚动容器展开成内容自然高度，截完恢复，
 * 这样能拿到完整会话高度的截图（Playwright 会滚 page 拼接）。
 *
 * 时序：先 `waitForDomSettle` 让流式输出/markdown 渲染真正落地，再展开容器、
 * 等 2 个 RAF 让布局 reflow 完成，最后截图。
 */
declare const __BROWSER_TEST_RUN_DIR__: string
export async function takeProbeScreenshot(name: string) {
  const locator = page.getByTestId('chat-probe-harness')
  const harness = locator.element() as HTMLElement | null
  const dir = typeof __BROWSER_TEST_RUN_DIR__ === 'string' ? __BROWSER_TEST_RUN_DIR__ : '.'

  // 1) 等 DOM 真正稳定下来（流式 tool output、markdown 渲染、auto-scroll 全部完成）
  await waitForDomSettle(harness ?? document.body, 400, 3000)

  const snapshots: Array<{ el: HTMLElement; prop: string; prev: string; hadInline: boolean }> = []
  const setStyle = (el: HTMLElement, prop: string, value: string) => {
    snapshots.push({
      el,
      prop,
      prev: el.style.getPropertyValue(prop),
      hadInline: el.style.getPropertyValue(prop) !== '',
    })
    el.style.setProperty(prop, value, 'important')
  }

  if (harness) {
    // 展开 harness 自己 —— 高度跟内容；width 显式锁 100vw，否则 flex 容器会被 shrink-to-fit
    setStyle(harness, 'height', 'auto')
    setStyle(harness, 'min-height', '0')
    setStyle(harness, 'max-height', 'none')
    setStyle(harness, 'width', '100vw')
    setStyle(harness, 'min-width', '100vw')
    // 展开所有 overflow auto/scroll 的子孙
    for (const el of harness.querySelectorAll<HTMLElement>('*')) {
      const s = getComputedStyle(el)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflow === 'auto' || s.overflow === 'scroll') {
        setStyle(el, 'overflow', 'visible')
        setStyle(el, 'height', 'auto')
        setStyle(el, 'min-height', 'auto')
        setStyle(el, 'max-height', 'none')
      }
    }
    // page 级别 —— fullPage 截图依赖 document 能按内容高度扩展
    setStyle(document.documentElement, 'overflow', 'visible')
    setStyle(document.documentElement, 'height', 'auto')
    setStyle(document.body, 'overflow', 'visible')
    setStyle(document.body, 'height', 'auto')
    window.scrollTo(0, 0)
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }

  try {
    // fullPage 截整份文档（按 DOM 实际高度），不受 element bounding box 限制
    return await page.screenshot({
      path: `${dir}/screenshots/${name}.png`,
      // @ts-expect-error vitest ScreenshotOptions 继承自 Playwright 但 d.ts 未显式导出 fullPage
      fullPage: true,
    })
  } finally {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i]
      if (s.hadInline) s.el.style.setProperty(s.prop, s.prev)
      else s.el.style.removeProperty(s.prop)
    }
  }
}

/**
 * 等待工具审批卡片出现。
 */
export async function waitForToolApproval(timeout = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = document.querySelector('[data-testid="tool-approval-actions"]')
    if (el) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for tool approval actions')
}

/**
 * 等待 AI 回复文本包含指定内容。
 */
export async function waitForAssistantTextContains(
  text: string,
  timeout = 120_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const elements = page.getByTestId('probe-message-assistant').all()
    for (const el of elements) {
      const content = el.element().textContent
      if (content?.includes(text)) return
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Timeout waiting for assistant text containing: "${text}"`)
}

// ── AI Judge ──
// 调用服务端辅助模型进行语义评判，替代硬编码的正则断言。

export type AiJudgment = {
  /** 是否通过 */
  pass: boolean
  /** 判断理由 */
  reason: string
  /** 0-100 评分 */
  score: number
  /** 辅助模型返回的原始文本（调试用） */
  raw?: string
}

const AI_JUDGE_SYSTEM_PROMPT = `You are a test evaluator for an AI assistant. Given an AI response and evaluation criteria, judge whether the response meets the criteria.

Output ONLY a JSON object (no markdown, no extra text):
{
  "pass": true/false,
  "score": 0-100,
  "reason": "brief explanation in the same language as the criteria"
}

Scoring guide:
- 90-100: Fully meets all criteria
- 70-89: Meets most criteria with minor gaps
- 50-69: Partially meets criteria
- 0-49: Does not meet criteria

"pass" should be true when score >= 70.`

/**
 * 调用服务端辅助模型，对 AI 回复进行语义评判。
 *
 * 用法：
 * ```ts
 * const judgment = await aiJudge({
 *   serverUrl: SERVER_URL,
 *   criteria: 'AI 应该识别出这是一份 PDF 分镜脚本，提到镜头数量和景别类型',
 *   aiResponse: result.textPreview,
 *   toolCalls: result.toolCalls,
 * })
 * expect(judgment.pass).toBe(true)
 * ```
 */
export async function aiJudge(options: {
  /** 后端地址 */
  serverUrl: string
  /** 评判标准（自然语言描述） */
  criteria: string
  /** AI 的回复文本 */
  aiResponse: string
  /** AI 使用的工具列表 */
  toolCalls?: string[]
  /** 用户原始 prompt（可选，提供更多上下文） */
  userPrompt?: string
  /** 超时毫秒数（默认 30s） */
  timeout?: number
  /**
   * 测试用例名（可选）。传入后，判决结果会通过 `appendAiJudge` browser command
   * 追加到 `browser-test-runs/<seq>/data/<testCase>.json` 的 `aiJudges` 数组，
   * 由 generate-report.mjs 渲染到 HTML 报告。不传则仅 console.log（兼容旧调用）。
   */
  testCase?: string
  /**
   * 裁判未通过时是否自动 throw 带完整 reason 的 AssertionError（默认 true）。
   *
   * Why：旧 API 返回 `{ pass: false, reason }` 后由测试自己 `expect(judgment.pass).toBe(true)`，
   * vitest 捕获到的只有 `"expected false to be true"`，HTML 报告的「❌ 失败信息」卡
   * 看不到 reason，debug 体验差。默认直接 throw 带 reason + aiResponse 片段的断言错误，
   * 失败栈自带全部上下文，且 28 个测试文件无需改写；仍需旧行为的测试显式传 `false`。
   */
  throwOnFail?: boolean
}): Promise<AiJudgment> {
  const {
    serverUrl, criteria, aiResponse, toolCalls, userPrompt, testCase,
    throwOnFail = true, timeout = 30_000,
  } = options

  const contextParts = []
  if (userPrompt) contextParts.push(`## User Prompt\n${userPrompt}`)
  contextParts.push(`## AI Response\n${aiResponse || '(empty response)'}`)
  if (toolCalls?.length) contextParts.push(`## Tool Calls Used\n${toolCalls.join(', ')}`)
  contextParts.push(`## Evaluation Criteria\n${criteria}`)
  const context = contextParts.join('\n\n')

  const body = JSON.stringify({
    json: {
      capabilityKey: 'text.translate',
      context,
      customPrompt: AI_JUDGE_SYSTEM_PROMPT,
    },
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${serverUrl}/trpc/settings.testAuxiliaryCapability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { pass: false, score: 0, reason: `auxiliary model HTTP error: ${res.status} ${text.slice(0, 200)}` }
    }

    const json = await res.json()
    // tRPC single response format: { result: { data: { json: { ok, result, ... } } } }
    const data = json?.result?.data?.json
    if (!data?.ok) {
      return { pass: false, score: 0, reason: `auxiliary model error: ${data?.error ?? 'unknown'}` }
    }

    const raw = typeof data.result === 'string' ? data.result : JSON.stringify(data.result)
    const judgment = parseJudgment(raw)
    console.log('[aiJudge] criteria:', criteria)
    console.log('[aiJudge] aiResponse (first 300):', (aiResponse || '').slice(0, 300))
    console.log('[aiJudge] result:', JSON.stringify(judgment))
    if (testCase) await persistJudgment({ testCase, criteria, aiResponse, userPrompt, toolCalls, judgment })
    if (!judgment.pass && throwOnFail) throw buildJudgmentError(judgment, criteria, aiResponse)
    return judgment
  } catch (err: any) {
    clearTimeout(timer)
    // 如果 err 是我们自己 throw 的 AssertionError（judgment 已完整），直接往上抛；不要吞掉消息
    if (err && err.name === 'AssertionError' && typeof err.message === 'string' && err.message.includes('aiJudge FAIL')) {
      throw err
    }
    const reason = err?.name === 'AbortError'
      ? `auxiliary model timeout (${timeout}ms)`
      : `auxiliary model call failed: ${err?.message ?? err}`
    console.error('[aiJudge] error:', reason)
    const judgment: AiJudgment = { pass: false, score: 0, reason }
    if (testCase) await persistJudgment({ testCase, criteria, aiResponse, userPrompt, toolCalls, judgment })
    if (throwOnFail) throw buildJudgmentError(judgment, criteria, aiResponse)
    return judgment
  }
}

/**
 * 构造一条信息丰富的断言错误：reason + score + criteria 摘要 + AI 回复前 400 字。
 * 测试挂在 `expect(judgment.pass).toBe(true)` 时只有 "expected false to be true"，
 * 靠这个 Error 把所有断言上下文一次性带到 vitest 的 failureMessages，
 * HTML 报告的「❌ 失败信息」卡就能直接看到全貌，不用去翻 AI 裁判卡或 console。
 */
function buildJudgmentError(judgment: AiJudgment, criteria: string, aiResponse: string): Error {
  const lines = [
    `aiJudge FAIL (score=${judgment.score}): ${judgment.reason}`,
    '',
    `评判标准：${criteria}`,
    '',
    `AI 回复（前 400 字）：${(aiResponse || '(空)').slice(0, 400)}`,
  ]
  const err = new Error(lines.join('\n'))
  err.name = 'AssertionError'
  return err
}

/**
 * 把 aiJudge 的判决落盘到当前 run 的 data/<testCase>.json。
 * 通过 vitest browser server command `appendAiJudge` 异步写入；任何失败（命令
 * 未注册 / data 文件不存在 / IO 错误）都只在 console 警告，不影响测试断言。
 */
async function persistJudgment(input: {
  testCase: string
  criteria: string
  aiResponse: string
  userPrompt?: string
  toolCalls?: string[]
  judgment: AiJudgment
}): Promise<void> {
  try {
    const mod = await import('@vitest/browser/context')
    const commands = (mod as unknown as {
      commands?: { appendAiJudge?: (args: unknown) => Promise<unknown> }
    }).commands
    const fn = commands?.appendAiJudge
    if (typeof fn !== 'function') return
    await fn(input)
  } catch (err) {
    console.warn('[aiJudge] persist failed:', err instanceof Error ? err.message : String(err))
  }
}

function parseJudgment(raw: string): AiJudgment {
  // 尝试从文本中提取 JSON
  const jsonMatch = raw.match(/\{[\s\S]*?"pass"[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        pass: Boolean(parsed.pass),
        score: typeof parsed.score === 'number' ? parsed.score : (parsed.pass ? 80 : 30),
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'no reason provided',
        raw,
      }
    } catch {
      // fallthrough to regex-based extraction for malformed JSON
      // (e.g. judge LLM emitted literal newlines inside reason string)
    }
  }

  const source = jsonMatch ? jsonMatch[0] : raw
  const passMatch = source.match(/"pass"\s*:\s*(true|false)/i)
  if (!passMatch) {
    return { pass: false, score: 0, reason: `failed to parse judgment from: ${raw.slice(0, 200)}`, raw }
  }
  const scoreMatch = source.match(/"score"\s*:\s*(-?\d+(?:\.\d+)?)/)
  const reasonMatch = source.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const pass = passMatch[1].toLowerCase() === 'true'
  return {
    pass,
    score: scoreMatch ? Number(scoreMatch[1]) : (pass ? 80 : 30),
    reason: reasonMatch ? reasonMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : 'recovered via regex fallback',
    raw,
  }
}

// ── Interactive Actions ──
// 以下函数用于 AI 介入式测试：approvalStrategy="manual" 时，
// AI agent 可以通过这些函数观察页面状态并决定操作。

export type InteractionState = {
  /** 当前 probe 状态 */
  probeStatus: string
  /** 消息数量 */
  messageCount: number
  /** 是否有待审批的工具调用 */
  hasPendingApproval: boolean
  /** 待审批工具数量 */
  pendingApprovalCount: number
  /** 页面可见文本摘要（前 1000 字符） */
  visibleTextSummary: string
  /** 是否有 AI 提问输入框 */
  hasQuestionInput: boolean
}

/**
 * 获取当前页面交互状态摘要。
 * AI agent 用这个来决定下一步操作。
 */
export function getInteractionState(): InteractionState {
  const harness = page.getByTestId('chat-probe-harness').element()
  const probeStatus = harness.getAttribute('data-probe-status') ?? 'unknown'
  const messageCount = Number.parseInt(
    harness.getAttribute('data-probe-message-count') ?? '0', 10,
  )

  // 检查待审批工具
  const approvalButtons = document.querySelectorAll('[data-testid="tool-approval-approve"]')
  const enabledApprovals = Array.from(approvalButtons).filter(
    btn => !(btn as HTMLButtonElement).disabled,
  )

  // 检查 AskUserQuestion 工具
  const questionInputs = document.querySelectorAll('[data-testid="user-input-tool"]')

  // 获取可见文本摘要
  const contentEl = harness.querySelector('[style*="flex: 1"]') ?? harness
  const visibleTextSummary = (contentEl.textContent ?? '').slice(0, 1000)

  return {
    probeStatus,
    messageCount,
    hasPendingApproval: enabledApprovals.length > 0,
    pendingApprovalCount: enabledApprovals.length,
    visibleTextSummary,
    hasQuestionInput: questionInputs.length > 0,
  }
}

/**
 * 等待出现需要交互的状态（审批弹窗或 AI 提问），或聊天完成（无待审批）。
 *
 * 注意：AI SDK 流式完成后 chat.status 变为 ready（probeStatus=complete），
 * 但此时可能仍有 pending approval（工具等待审批）。
 * 所以"有 pending approval"优先于"status complete"。
 */
export async function waitForInteraction(timeout = 120_000): Promise<InteractionState> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const state = getInteractionState()
    // 优先检查交互需求
    if (state.hasPendingApproval || state.hasQuestionInput) {
      return state
    }
    // 无交互需求且已完成/出错 → 真正结束
    if (state.probeStatus === 'complete' || state.probeStatus === 'error') {
      return state
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for interaction point')
}

/**
 * 点击第 N 个审批弹窗的「允许」按钮（默认第一个）。
 */
export async function approveCurrentTool(index = 0) {
  const buttons = document.querySelectorAll('[data-testid="tool-approval-approve"]')
  const btn = buttons[index] as HTMLButtonElement | undefined
  if (!btn) throw new Error(`No approve button found at index ${index}`)
  if (btn.disabled) throw new Error('Approve button is disabled')
  btn.click()
  // 等待一帧让 React 处理状态更新
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击第 N 个审批弹窗的「拒绝」按钮（默认第一个）。
 */
export async function rejectCurrentTool(index = 0) {
  const buttons = document.querySelectorAll('[data-testid="tool-approval-reject"]')
  const btn = buttons[index] as HTMLButtonElement | undefined
  if (!btn) throw new Error(`No reject button found at index ${index}`)
  if (btn.disabled) throw new Error('Reject button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击第 N 个审批弹窗的「始终允许」按钮。
 */
export async function alwaysAllowCurrentTool(index = 0) {
  const buttons = document.querySelectorAll('[data-testid="tool-approval-always-allow"]')
  const btn = buttons[index] as HTMLButtonElement | undefined
  if (!btn) throw new Error(`No always-allow button found at index ${index}`)
  if (btn.disabled) throw new Error('Always-allow button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 通过 CSS 选择器点击元素。
 */
export async function clickElement(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) throw new Error(`Element not found: ${selector}`)
  el.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 通过 data-testid 点击元素。
 */
export async function clickByTestId(testId: string) {
  await clickElement(`[data-testid="${testId}"]`)
}

// ── AskUserQuestion / RequestUserInput 交互 ──

export type QuestionInfo = {
  /** 工具标题 */
  title: string
  /** 模式：form（表单字段）或 choice（选项卡） */
  mode: 'form' | 'choice' | 'unknown'
  /** 表单字段列表（form 模式） */
  fields: Array<{ key: string, label: string, type: string, placeholder: string }>
  /** 选项列表（choice 模式） */
  choices: Array<{ index: number, label: string, description: string, selected: boolean }>
  /** 可见文本摘要 */
  visibleText: string
}

/**
 * 提取 RequestUserInputTool 的问题信息（标题、字段、选项等）。
 * AI agent 用这个来理解问题内容并决定答案。
 */
export function getQuestionInfo(): QuestionInfo | null {
  const tool = document.querySelector('[data-testid="user-input-tool"]')
  if (!tool) return null

  const title = tool.querySelector('[class*="muted-foreground"]')?.textContent?.trim() ?? ''

  // 检测 form 字段
  const fields: QuestionInfo['fields'] = []
  const inputs = tool.querySelectorAll('[data-testid^="user-input-field-"]')
  for (const input of inputs) {
    const testId = input.getAttribute('data-testid') ?? ''
    const key = testId.replace('user-input-field-', '')
    const label = input.closest('div')?.querySelector('label')?.textContent?.trim() ?? key
    const type = input.tagName.toLowerCase() === 'select' ? 'select'
      : input.tagName.toLowerCase() === 'textarea' ? 'textarea'
      : (input as HTMLInputElement).type ?? 'text'
    const placeholder = (input as HTMLInputElement).placeholder ?? ''
    fields.push({ key, label, type, placeholder })
  }

  // 检测 choice 选项
  const choices: QuestionInfo['choices'] = []
  const choiceBtns = tool.querySelectorAll('[data-testid^="user-input-choice-"]')
  for (const btn of choiceBtns) {
    const idx = Number.parseInt(
      (btn.getAttribute('data-testid') ?? '').replace('user-input-choice-', ''), 10,
    )
    const label = btn.getAttribute('data-choice-label') ?? btn.textContent?.trim() ?? ''
    const description = btn.querySelector('[class*="muted-foreground"]')?.textContent?.trim() ?? ''
    const selected = btn.classList.contains('selected') || btn.getAttribute('aria-selected') === 'true'
    choices.push({ index: idx, label, description, selected })
  }

  const mode = choices.length > 0 ? 'choice' : fields.length > 0 ? 'form' : 'unknown'
  const visibleText = (tool.textContent ?? '').slice(0, 500)

  return { title, mode, fields, choices, visibleText }
}

/**
 * 等待 RequestUserInputTool 出现。
 */
export async function waitForQuestionInput(timeout = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (document.querySelector('[data-testid="user-input-tool"]')) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for user input tool')
}

/**
 * 填写表单字段值（form 模式）。
 * 通过 React 的 onChange 事件触发。
 */
export async function fillFormField(key: string, value: string) {
  const input = document.querySelector(`[data-testid="user-input-field-${key}"]`) as
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!input) throw new Error(`Form field not found: ${key}`)

  // 触发 React 的 onChange（需要用 native setter）
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : input.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype,
    'value',
  )?.set
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value)
  } else {
    input.value = value
  }
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 100))
}

/**
 * 选择一个 choice 选项（choice 模式）。
 * @param labelOrIndex 选项的 label 文本或索引
 */
export async function selectChoiceOption(labelOrIndex: string | number) {
  let btn: HTMLElement | null = null
  if (typeof labelOrIndex === 'number') {
    btn = document.querySelector(`[data-testid="user-input-choice-${labelOrIndex}"]`)
  } else {
    btn = document.querySelector(`[data-choice-label="${labelOrIndex}"]`)
  }
  if (!btn) throw new Error(`Choice option not found: ${labelOrIndex}`)
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击「确认」提交表单/选项。
 */
export async function submitQuestionForm() {
  const btn = document.querySelector('[data-testid="user-input-confirm"]') as HTMLButtonElement | null
  if (!btn) throw new Error('Confirm button not found')
  if (btn.disabled) throw new Error('Confirm button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击「跳过」。
 */
export async function skipQuestion() {
  const btn = document.querySelector('[data-testid="user-input-skip"]') as HTMLButtonElement | null
  if (!btn) throw new Error('Skip button not found')
  if (btn.disabled) throw new Error('Skip button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}
