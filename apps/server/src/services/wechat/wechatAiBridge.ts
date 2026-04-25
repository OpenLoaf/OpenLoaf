/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * WeChat AI Bridge V2 —— 双路 race + typing indicator + 进展感知超时兜底
 *
 * 入站消息 **立即**（0ms debounce）做三件事并行：
 *   A. `sendTypingIndicator`               给用户"AI 在处理"的即时视觉反馈
 *   B. `fastAgent` (generateText, isFast)  超轻 LLM 生成 2-15 字应和，预期 ~500-1500ms
 *   C. `fullAgent` (runChatStream)         真正的 channel agent，可调用工具，预期 3-8s
 *
 * 竞争决策（Promise.race between B/C）：
 *   - **full 胜**：发 full 的 text，丢弃 fast 即使后来完成也不发
 *   - **fast 胜**：发 fast 的 text，然后**等 full 完成再发**；若 full 超时
 *     （HARD_TIMEOUT_MS）则调用 summarizer LLM，把 full 的**当前进展快照**
 *     （最新 assistant text 片段 + 调用过的工具名列表，**不含 tool result 正文**）
 *     喂给它生成有依据的兜底消息
 *
 * 连发消息：pending.push + abort 当前 race + 立即重启新 race。**不做 debounce**
 * —— 100ms 窗口在真实手机键盘上太短（拼音两词停顿常 >200ms），0ms abort+合并
 * 的语义更清晰且浪费更少 LLM 调用
 *
 * Orphan 策略：被 abort 的 full 即使已产出完整 text 也**静默丢弃**，不做"半
 * 成品塞给新 turn 做参考"—— qwen 会复读/误读，收益 < 风险
 *
 * 为什么 agent 不感知 ack / typing：ack 是 IM 通道的 UX 补丁（桌面端 OpenLoaf
 * 客户端本身不需要），agent prompt 保持纯粹的"你是业务助手"，不污染心智模型
 */

import { randomUUID } from 'node:crypto'
import { generateText } from 'ai'
import { runChatStream } from '@/ai/services/chat/chatStreamService'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import {
  readJsonlRaw,
  type StoredMessage,
} from '@/ai/services/chat/repositories/chatFileStore'
import { sendWeChatText } from './wechatSendService'
import { createAccountApiClient } from './apiClientFactory'
import { getAccount } from './wechatAccountStore'
import { CHANNEL_DEFAULT_CHAT_MODEL_ID } from '@/ai/agent-templates/templates/channel'
import { resolveChannelFastChatModelId } from '@/ai/agent-templates/templates/channel/fastModelResolver'
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'
import { isFakeLoggedOut } from './wechatMockStore'
import { logger } from '@/common/logger'

/**
 * Hard timeout for full agent after fast ack has been delivered.
 * Multi-step generation tasks (CloudImageGenerate → SendWeChatMedia,
 * CloudVideoGenerate → SendWeChatMedia) can legitimately take 90-180s for the
 * SaaS round-trip plus one more tool call. 120s was empirically too tight;
 * 300s still aborted qwen flash mid-chain on CloudImageGenerate (verified
 * run 0337: step1 returns finishReason=tool-calls with the image ready but
 * step2's SendWeChatMedia never fires). 480s leaves room for 3 steps × up
 * to 150s per step for the heaviest cloud round-trips. Bridge still emits
 * a progress-aware summary via summarizeProgress when even that runs out —
 * the user-facing fast ack has landed long before, so full taking ~5min on
 * a video-gen task doesn't hurt UX.
 */
const FULL_HARD_TIMEOUT_MS = 480_000

/**
 * Provider options that **disable reasoning / thinking** across all common
 * chat providers. Used by fast agent + progress summarizer — they only need
 * one short sentence, CoT latency is pure overhead (qwen flash 默认开 thinking
 * 让 fast ack 从 ~1s 膨胀到 6-10s).
 *
 * 不同 provider 的关推理键名不一样；ai-sdk 忽略不认识的 key，所以把所有常见
 * provider 的关推理配置全塞进来是安全的——哪个 provider 被 resolver 选中，
 * 对应的 key 就生效，其他 key 被对应 SDK 静默丢弃。
 *
 * 参考：
 * - `@ai-sdk/alibaba` v1：`enableThinking: boolean`（qwen flash / plus / max）
 * - `@ai-sdk/google`：`thinkingConfig: { thinkingBudget: 0 }`（gemini 2.5 系列）
 * - `@ai-sdk/anthropic`：`thinking: { type: 'disabled' }`（claude opus 4.x+）
 * - `@ai-sdk/moonshotai`：`reasoningHistory: 'disabled'`（kimi）
 * - openai / deepseek / xai / grok：本身无推理模式，或通过换模型选择；无需选项
 */
const NO_THINKING_PROVIDER_OPTIONS = {
  alibaba: { enableThinking: false },
  google: { thinkingConfig: { thinkingBudget: 0 } },
  anthropic: { thinking: { type: 'disabled' } },
  moonshotai: { reasoningHistory: 'disabled' },
} as const

interface PendingItem {
  text: string
  createTimeMs: number
  contextToken?: string
}

/**
 * An outbound media action queued by the `SendWeChatMedia` tool. The tool
 * itself never calls `api.sendImage` directly — it pushes an action onto the
 * owning race's pendingOutbound queue, and `flushPendingOutbound` drains it
 * in order once the race completes. This way a race that gets aborted (new
 * inbound mid-flight) naturally drops any media the killed agent was about
 * to send, matching the existing orphan-text discard semantics.
 */
export interface PendingOutboundAction {
  kind: 'image' | 'video' | 'file'
  /** Absolute local path to the media file. */
  localPath: string
  /** Required for kind='file' (WeChat file-attachment bubble display name). */
  fileName?: string
  caption?: string
}

interface RaceContext {
  raceId: string
  acFast: AbortController
  acFull: AbortController
  batch: PendingItem[]
  startedAt: number
  /** lastContextToken: 最新 inbound 的 contextToken，回发要用这个 */
  lastContextToken?: string
  /** Was the user signed into OpenLoaf cloud at race start? Drives prompt prefix + tool behaviour. */
  hasCloudLogin: boolean
}

interface SessionState {
  /** Owning iLink account — needed by `sendChannelMediaNow` so it can resolve the api client without a fresh inbound. */
  accountId: string
  raceCtx: RaceContext | null
  pending: PendingItem[]
}

const states = new Map<string, SessionState>()

const QUICK_ACK_SYSTEM_PROMPT = `你是即时消息通道里的应答语气词生成器。

对方刚刚发来一条消息，请只输出一句 2-15 字的口头应和，像真人聊天的自然反应。

- 短任务（问候 / 简单问答）用应和：嗯、好的、在、稍等、让我看看、马上来
- 需要处理（查询 / 生成 / 工具调用）用过程预告：收到，马上查 / 我来看看 / 好的，正在处理

严格约束：
- 不解释、不承诺具体内容、不回答消息本身
- 不包含数字 / 日期 / URL / 名字 / 表情符号 / markdown
- 只输出那一句应和，不要加引号、不要前缀（如"AI:"）、不要换行`

const PROGRESS_SUMMARIZER_SYSTEM_PROMPT = `你是即时消息通道里的进度播报员。

主对话的 AI 助手还在处理用户请求（已超 2 分钟），你需要基于它的**当前进展快照**（包括已产出的部分文本 + 调用过的工具名），生成一条 20-60 字的进度说明发给用户。

严格约束：
- 基于真实进展说话，不要编造具体数字或结论
- 如果已有 assistant text 片段，从中概括"在做什么"（例如"正在整理天气数据"）
- 如果只有工具名列表，用工具名推测意图（WebSearch → 正在搜索；CloudImageGenerate → 正在生成图；MacosObserve → 正在看桌面；PdfInspect → 正在读 PDF）
- 末尾附"再给我点时间"或"马上就好"之类的自然收尾
- 不输出 markdown / URL / 引号 / 前缀 / 换行`

/** ========== Public API ========== */

/**
 * Public entry: called by wechatPollWorker for each inbound message. Fires
 * **immediately** (0ms debounce).
 */
export function scheduleAiReply(input: {
  sessionId: string
  accountId: string
  text: string
  createTimeMs: number
  contextToken?: string
}): void {
  const { sessionId, accountId, text, createTimeMs, contextToken } = input

  // 1) 立即发 typing（fire-and-forget，不等）
  if (contextToken) {
    void sendTypingSafe({ accountId, contextToken })
  }

  // 2) push into pending
  const state = states.get(sessionId) ?? {
    accountId,
    raceCtx: null,
    pending: [],
  }
  states.set(sessionId, state)
  state.pending.push({ text, createTimeMs, contextToken })

  // 3) 有 in-flight race → abort；然后立即启动新 race
  if (state.raceCtx) {
    logger.info(
      { sessionId, raceId: state.raceCtx.raceId },
      '[wechat-ai] aborting in-flight race for new inbound',
    )
    state.raceCtx.acFast.abort()
    state.raceCtx.acFull.abort()
    state.raceCtx = null
    // Media already sent via SendWeChatMedia (sync) cannot be unsent — that's
    // intentional: the model called the tool, the bytes are already on the
    // user's phone. Aborting only stops in-flight text generation.
  }
  // 立即启动（非 debounce）
  void startRace(sessionId, accountId)
}

/**
 * Called by `SendWeChatMedia` to deliver an outbound media bubble **synchronously**.
 *
 * Earlier design enqueued the action and let the race coordinator flush it
 * after the winning text. That made the tool return `ok: true` long before
 * the real iLink upload/send finished, so any failure (token expiry, file
 * too large, network) was swallowed in `try/catch` while the model went on
 * to tell the user "已发送" — a false promise the user couldn't see through.
 *
 * Sync delivery fixes that: the tool awaits the actual `api.sendImage/Video/File`
 * call and the model receives the real ok/err it needs to truthfully report
 * delivery status. Race-abort no longer affects already-sent bubbles (bytes
 * are on the user's phone; can't unsend).
 */
export async function sendChannelMediaNow(
  sessionId: string,
  action: PendingOutboundAction,
): Promise<
  | { ok: true; messageId: string }
  | { ok: false; code: 'no_session' | 'no_account' | 'no_context_token' | 'send_failed'; error: string }
> {
  const state = states.get(sessionId)
  if (!state) {
    return {
      ok: false,
      code: 'no_session',
      error: `No active wechat session for sessionId=${sessionId}.`,
    }
  }
  const acc = getAccount(state.accountId)
  if (!acc?.ownerUserId) {
    return {
      ok: false,
      code: 'no_account',
      error: `WeChat account ${state.accountId} not found or missing ownerUserId.`,
    }
  }
  // Use the most recent inbound's contextToken — iLink requires a fresh
  // token bound to the user's last message. If the race already cleaned up
  // (rare: tool called after race ended), fall back to most recent pending.
  const contextToken =
    state.raceCtx?.lastContextToken ??
    state.pending[state.pending.length - 1]?.contextToken
  if (!contextToken) {
    return {
      ok: false,
      code: 'no_context_token',
      error: 'No contextToken available — SendWeChatMedia must be called inside an active wechat reply turn.',
    }
  }

  const api = createAccountApiClient(acc)
  const to = acc.ownerUserId
  try {
    let messageId: string
    if (action.kind === 'image') {
      messageId = await api.sendImage(to, action.localPath, contextToken, action.caption)
    } else if (action.kind === 'video') {
      messageId = await api.sendVideo(to, action.localPath, contextToken, action.caption)
    } else {
      messageId = await api.sendFile(
        to,
        action.localPath,
        action.fileName ?? basenameFromPath(action.localPath),
        contextToken,
        action.caption,
      )
    }
    logger.info(
      {
        sessionId,
        raceId: state.raceCtx?.raceId,
        kind: action.kind,
        fileName: action.fileName,
        messageId,
      },
      '[wechat-ai] media sent',
    )
    return { ok: true, messageId }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.warn(
      {
        err: errorMessage,
        sessionId,
        raceId: state.raceCtx?.raceId,
        kind: action.kind,
        localPath: action.localPath,
      },
      '[wechat-ai] media send failed',
    )
    return {
      ok: false,
      code: 'send_failed',
      error: errorMessage,
    }
  }
}

/** ========== Typing indicator ========== */

async function sendTypingSafe(input: {
  accountId: string
  contextToken: string
}): Promise<void> {
  try {
    const acc = getAccount(input.accountId)
    if (!acc?.ownerUserId) return
    const api = createAccountApiClient(acc)
    await api.sendTypingIndicator(acc.ownerUserId, input.contextToken)
  } catch {
    /* best-effort — typing indicator failure doesn't matter */
  }
}

/** ========== Race orchestration ========== */

async function startRace(sessionId: string, accountId: string): Promise<void> {
  const state = states.get(sessionId)
  if (!state) return
  const batch = state.pending
  if (batch.length === 0) return
  state.pending = []

  const raceId = randomUUID().slice(0, 8)
  const acFast = new AbortController()
  const acFull = new AbortController()
  const lastContextToken = batch[batch.length - 1]?.contextToken

  // Check SaaS login state up front — identity.md has explicit rules for the
  // "not logged in" branch; we inject a prefix into the user message so the
  // model can see it. `ensureServerAccessToken()` reads a cached token first
  // and falls back to a background refresh when a refresh-token is stored;
  // unauthenticated sessions resolve to undefined quickly.
  //
  // `isFakeLoggedOut(accountId)` is a test-only override: when wechat/012
  // flips the flag, we skip the real token check entirely so the rest of the
  // test can assert the not-logged-in branch without signing out the dev box.
  const faked = isFakeLoggedOut(accountId)
  const token = faked ? undefined : await ensureServerAccessToken().catch(() => undefined)
  const hasCloudLogin = typeof token === 'string' && token.length > 0

  const ctx: RaceContext = {
    raceId,
    acFast,
    acFull,
    batch,
    startedAt: Date.now(),
    lastContextToken,
    hasCloudLogin,
  }
  state.raceCtx = ctx

  const userMessageText = buildUserMessageText(batch, { hasCloudLogin })

  logger.info(
    { sessionId, raceId, batchSize: batch.length, hasCloudLogin },
    '[wechat-ai] race started',
  )

  // fast 和 full 并发启动，用 .catch 吃掉异常（race 不会因为一方异常而整体挂）
  const fastPromise = runFastAgent({
    raceId,
    userText: userMessageText,
    signal: acFast.signal,
  }).catch((err) => {
    logger.warn(
      { err: String(err), raceId, sessionId },
      '[wechat-ai] fast agent failed',
    )
    return ''
  })

  const fullPromise = runFullAgent({
    raceId,
    sessionId,
    userMessageText,
    signal: acFull.signal,
  }).catch((err) => {
    if ((err as { name?: string })?.name === 'AbortError' || acFull.signal.aborted) {
      logger.info({ raceId, sessionId }, '[wechat-ai] full agent aborted')
    } else {
      logger.warn(
        { err: String(err), raceId, sessionId },
        '[wechat-ai] full agent failed',
      )
    }
    return ''
  })

  try {
    // 核心竞争：谁先 resolve 非空 text 就胜
    const winner = await firstNonEmpty([
      { kind: 'fast', promise: fastPromise },
      { kind: 'full', promise: fullPromise },
    ])

    // 中断检查：如果 ctx 已被替换（新消息进来），直接退出不发
    if (stateRaceCtxChanged(sessionId, ctx)) {
      logger.info(
        { raceId, sessionId },
        '[wechat-ai] race ctx changed during winner await — skipping send',
      )
      return
    }

    if (!winner) {
      // 两个都返回空
      logger.warn(
        { raceId, sessionId },
        '[wechat-ai] both fast and full returned empty',
      )
      return
    }

    if (winner.kind === 'full') {
      // full 胜：发 full text；丢弃 fast。SendWeChatMedia 已经在工具内同步发了。
      acFast.abort()
      await sendIfStillCurrent({
        sessionId,
        accountId,
        ctx,
        text: winner.text,
        contextToken: lastContextToken,
        role: 'full',
      })
      return
    }

    // fast 胜：先发 fast ack，再等 full；full 到达后发 full text。
    // SendWeChatMedia 调用是同步的，已在工具内完成；这里不再处理媒体。
    await sendIfStillCurrent({
      sessionId,
      accountId,
      ctx,
      text: winner.text,
      contextToken: lastContextToken,
      role: 'fast',
    })

    const fullText = await Promise.race<string>([
      fullPromise,
      sleep(FULL_HARD_TIMEOUT_MS).then(() => ''),
    ])

    if (stateRaceCtxChanged(sessionId, ctx)) return

    if (fullText) {
      await sendIfStillCurrent({
        sessionId,
        accountId,
        ctx,
        text: fullText,
        contextToken: lastContextToken,
        role: 'full-after-fast',
      })
    } else {
      // Full truly went silent (timeout or crashed): read whatever partial
      // progress made it into jsonl and let the summarizer generate a
      // progress-aware status line.
      const snapshot = await captureProgressSnapshot(sessionId)
      const fallback = await summarizeProgress({
        raceId,
        snapshot,
        userText: userMessageText,
      })
      acFull.abort()
      if (fallback) {
        await sendIfStillCurrent({
          sessionId,
          accountId,
          ctx,
          text: fallback,
          contextToken: lastContextToken,
          role: 'timeout-summary',
        })
      }
    }
  } finally {
    // 清理：只清自己这一轮的 ctx
    const cur = states.get(sessionId)
    if (cur && cur.raceCtx === ctx) {
      cur.raceCtx = null
    }
    // 处理 race 期间累积的 pending
    const remaining = states.get(sessionId)?.pending ?? []
    if (remaining.length > 0) {
      void startRace(sessionId, accountId)
    }
    logger.info(
      {
        sessionId,
        raceId,
        elapsedMs: Date.now() - ctx.startedAt,
      },
      '[wechat-ai] race ended',
    )
  }
}

/** ========== Fast agent ========== */

async function runFastAgent(input: {
  raceId: string
  userText: string
  signal: AbortSignal
}): Promise<string> {
  const startedAt = Date.now()
  const chatModelId = await resolveChannelFastChatModelId()
  const resolvedModelAt = Date.now()
  const resolved = await resolveChatModel({
    chatModelId,
    chatModelSource: 'cloud',
  })
  const builtModelAt = Date.now()
  const { text } = await generateText({
    model: resolved.model as any,
    system: QUICK_ACK_SYSTEM_PROMPT,
    prompt: input.userText,
    maxOutputTokens: 40,
    temperature: 0.3,
    abortSignal: input.signal,
    // 关掉 thinking —— qwen flash 默认开 CoT 会让 fast ack 慢 6-10s；我们只要
    // 一句应和，完全不需要推理链。@ai-sdk/alibaba 原生支持此选项。
    providerOptions: NO_THINKING_PROVIDER_OPTIONS,
  })
  const generatedAt = Date.now()
  const ack = sanitizeShortReply(text, 30)
  logger.info(
    {
      raceId: input.raceId,
      chatModelId,
      totalMs: generatedAt - startedAt,
      resolveFastIdMs: resolvedModelAt - startedAt,
      resolveProviderMs: builtModelAt - resolvedModelAt,
      generateTextMs: generatedAt - builtModelAt,
      ackLen: ack.length,
    },
    '[wechat-ai] fast agent produced',
  )
  return ack
}

/** ========== Full agent ========== */

async function runFullAgent(input: {
  raceId: string
  sessionId: string
  userMessageText: string
  signal: AbortSignal
}): Promise<string> {
  const startedAt = Date.now()
  const userMessage = {
    id: randomUUID(),
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: input.userMessageText }],
    createdAt: new Date(),
  }

  const response = await runChatStream({
    request: {
      sessionId: input.sessionId,
      messages: [userMessage as any],
      trigger: 'submit-message',
      agentType: 'channel',
      chatModelId: CHANNEL_DEFAULT_CHAT_MODEL_ID,
      chatModelSource: 'cloud',
      // Channel scope has no approval UI — if Tier 2 tools stall in
      // `approval-requested` state, the race burns 480s with the artifact
      // ready but never delivered (verified run 0340 on 011/016:
      // CloudImageGenerate landed at state=approval-requested and SendWeChatMedia
      // never fired). The "text-confirmation" protocol in approval.zh.md is
      // the correct user-facing gate; the runtime gate is redundant here.
      autoApproveTools: true,
    } as any,
    cookies: {},
    requestSignal: input.signal,
  })

  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } finally {
      reader.releaseLock()
    }
  }

  if (input.signal.aborted) {
    throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  }

  // 从 jsonl 读最新 assistant text（这是 full 的"最终答案"）
  const snapshot = await captureProgressSnapshot(input.sessionId)
  const text = snapshot.textChunks.join('').trim()

  logger.info(
    {
      raceId: input.raceId,
      latencyMs: Date.now() - startedAt,
      textLen: text.length,
      toolsUsed: snapshot.toolsUsed,
    },
    '[wechat-ai] full agent produced',
  )
  return text
}

/** ========== Progress snapshot + summarizer ========== */

interface ProgressSnapshot {
  /** Ordered assistant text fragments from the in-flight full turn. */
  textChunks: string[]
  /** Tool names encountered (in call order, duplicates preserved). */
  toolsUsed: string[]
}

async function captureProgressSnapshot(
  sessionId: string,
): Promise<ProgressSnapshot> {
  const msgs = await readJsonlRaw(sessionId).catch(() => [] as StoredMessage[])
  const latestAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
  if (!latestAssistant) return { textChunks: [], toolsUsed: [] }
  const parts = Array.isArray(latestAssistant.parts) ? latestAssistant.parts : []
  const textChunks: string[] = []
  const toolsUsed: string[] = []
  for (const p of parts as Array<Record<string, unknown>>) {
    const type = typeof p?.type === 'string' ? p.type : ''
    if (type === 'text') {
      const t = typeof p.text === 'string' ? p.text : ''
      if (t.trim()) textChunks.push(t)
      continue
    }
    // AI SDK v5 tool part types: "tool-<toolName>" 或 "tool-call"
    if (type.startsWith('tool-') || type === 'tool-call') {
      const name =
        typeof p.toolName === 'string'
          ? p.toolName
          : typeof p.name === 'string'
          ? p.name
          : type.startsWith('tool-') && type !== 'tool-call'
          ? type.slice(5)
          : ''
      if (name) toolsUsed.push(name)
    }
  }
  return { textChunks, toolsUsed }
}

async function summarizeProgress(input: {
  raceId: string
  snapshot: ProgressSnapshot
  userText: string
}): Promise<string> {
  const textPreview = input.snapshot.textChunks
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
  const toolsLine =
    input.snapshot.toolsUsed.length > 0
      ? input.snapshot.toolsUsed.slice(0, 8).join(' → ')
      : '（暂无工具调用记录）'
  const prompt = [
    `用户原请求：${input.userText.slice(0, 200)}`,
    `已产出文本片段：${textPreview || '（暂无文本输出）'}`,
    `已调用工具序列：${toolsLine}`,
  ].join('\n')
  try {
    const chatModelId = await resolveChannelFastChatModelId()
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource: 'cloud',
    })
    const { text } = await generateText({
      model: resolved.model as any,
      system: PROGRESS_SUMMARIZER_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 120,
      temperature: 0.4,
      // 同 fast agent —— summarizer 只做一句进度播报，也不需要 thinking。
      providerOptions: {
        alibaba: { enableThinking: false },
      },
    })
    const summary = sanitizeShortReply(text, 120)
    logger.info(
      { raceId: input.raceId, summaryLen: summary.length },
      '[wechat-ai] progress summary produced',
    )
    return summary || '还在帮你处理，再给我一会儿。'
  } catch (err) {
    logger.warn(
      { err: String(err), raceId: input.raceId },
      '[wechat-ai] summarizer failed; using generic fallback',
    )
    return '处理时间比预期长，再给我一会儿；如果你想换别的我也可以。'
  }
}

/** ========== Send + guard ========== */

async function sendIfStillCurrent(input: {
  sessionId: string
  accountId: string
  ctx: RaceContext
  text: string
  contextToken?: string
  role: string
}): Promise<void> {
  const { sessionId, accountId, ctx, text, contextToken, role } = input
  if (stateRaceCtxChanged(sessionId, ctx)) {
    logger.info(
      { raceId: ctx.raceId, role, sessionId },
      '[wechat-ai] skip send — race ctx changed',
    )
    return
  }
  if (!text || !contextToken) {
    // Empty text is a legitimate outcome when the agent only sent media via
    // SendWeChatMedia — don't log a warning in that case.
    if (!contextToken) {
      logger.warn(
        { raceId: ctx.raceId, role, sessionId },
        '[wechat-ai] skip send — missing contextToken',
      )
    } else {
      logger.info(
        { raceId: ctx.raceId, role, sessionId },
        '[wechat-ai] skip send — empty text (media-only turn)',
      )
    }
    return
  }
  await sendWeChatText({ accountId, text, contextToken })
  logger.info(
    { raceId: ctx.raceId, role, sessionId, textLen: text.length },
    '[wechat-ai] sent',
  )
}

/** ========== Helpers ========== */

function stateRaceCtxChanged(sessionId: string, ctx: RaceContext): boolean {
  const cur = states.get(sessionId)
  return !cur || cur.raceCtx !== ctx
}

function sanitizeShortReply(raw: string, maxLen: number): string {
  let s = String(raw ?? '').trim()
  // 去首尾各种引号
  s = s.replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, '')
  s = s.replace(/[\n\r]+/g, ' ').trim()
  return s.slice(0, maxLen)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 等多个 promise，返回第一个产出非空字符串的结果。
 * - 若所有都产出空（或抛错被 .catch 成空）→ 返回 null
 * - 若先完成的是空字符串，则继续等剩下的
 */
async function firstNonEmpty(
  entries: Array<{ kind: 'fast' | 'full'; promise: Promise<string> }>,
): Promise<{ kind: 'fast' | 'full'; text: string } | null> {
  const results: Array<{ kind: 'fast' | 'full'; text: string }> = []
  let remaining = entries.length
  return new Promise((resolve) => {
    const settle = (kind: 'fast' | 'full', text: string): void => {
      remaining -= 1
      if (text) {
        resolve({ kind, text })
        return
      }
      results.push({ kind, text })
      if (remaining === 0) resolve(null)
    }
    for (const { kind, promise } of entries) {
      promise.then(
        (text) => settle(kind, text ?? ''),
        () => settle(kind, ''),
      )
    }
  })
}

function buildUserMessageText(
  batch: PendingItem[],
  opts: { hasCloudLogin: boolean },
): string {
  // identity.md rule 9 triggers on this exact marker. Keep the prefix
  // verbatim so a future translation / reword happens in both places.
  const notLoggedInPrefix = opts.hasCloudLogin
    ? ''
    : '[会话上下文：用户尚未登录 OpenLoaf 云端，所有 Cloud* 工具和语音/视频/图片识别都将失败。] \n'
  if (batch.length === 1) return `${notLoggedInPrefix}${batch[0]!.text}`
  return [
    notLoggedInPrefix,
    `[以下是对方连续发来的 ${batch.length} 条消息]`,
    ...batch.map((it) => {
      const d = new Date(it.createTimeMs)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `[${hh}:${mm}] ${it.text}`
    }),
  ]
    .filter((s) => s.length > 0)
    .join('\n')
}

function basenameFromPath(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || 'attachment'
}

/** ========== Debug: fast-agent stand-alone ping ========== */

/**
 * Debug helper — invokes the fast path (resolveChannelFastChatModelId →
 * resolveChatModel → generateText) once and returns the breakdown so we can
 * tell where latency is sitting.
 */
export async function __debugFastAgentPing(userText: string): Promise<{
  text: string
  totalMs: number
  resolveFastIdMs: number
  resolveProviderMs: number
  generateTextMs: number
  chatModelId: string
}> {
  const t0 = Date.now()
  const chatModelId = await resolveChannelFastChatModelId()
  const t1 = Date.now()
  const resolved = await resolveChatModel({
    chatModelId,
    chatModelSource: 'cloud',
  })
  const t2 = Date.now()
  const { text } = await generateText({
    model: resolved.model as any,
    system: QUICK_ACK_SYSTEM_PROMPT,
    prompt: userText,
    maxOutputTokens: 40,
    temperature: 0.3,
    providerOptions: NO_THINKING_PROVIDER_OPTIONS,
  })
  const t3 = Date.now()
  return {
    text: sanitizeShortReply(text, 30),
    chatModelId,
    totalMs: t3 - t0,
    resolveFastIdMs: t1 - t0,
    resolveProviderMs: t2 - t1,
    generateTextMs: t3 - t2,
  }
}

/** ========== Test-only reset ========== */

export function __resetBridgeStateForTests(): void {
  for (const state of states.values()) {
    if (state.raceCtx) {
      state.raceCtx.acFast.abort()
      state.raceCtx.acFull.abort()
    }
  }
  states.clear()
}

export function __resetBridgeStateForSession(sessionId: string): void {
  const state = states.get(sessionId)
  if (state?.raceCtx) {
    state.raceCtx.acFast.abort()
    state.raceCtx.acFull.abort()
  }
  states.delete(sessionId)
}
