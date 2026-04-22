/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * WeChat AI Bridge
 *
 * Drives the AI auto-reply loop for a WeChat session:
 *   inbound message -> debounce 3s -> runChatStream -> pick latest assistant text -> sendText back.
 *
 * Per-session state machine:
 *   - pending queue holds inbound items arriving within the debounce window
 *   - a new inbound ABORTS any in-flight runChatStream for the same session
 *     and resets the debounce timer, so the AI always replies to the merged
 *     latest view rather than a half-stale one
 *   - if pendingCount > 1 when the timer fires, the AI sees a synthesized
 *     "user sent N messages" bundle with HH:MM timestamps — so rapid-fire
 *     3-in-a-row turns into one coherent reply instead of three
 *
 * No AI-toggle, no local-input path: WeChat sessions in OpenLoaf are readonly
 * mirrors driven by the phone, and auto-reply is always on for bound accounts.
 */

import { randomUUID } from 'node:crypto'
import { runChatStream } from '@/ai/services/chat/chatStreamService'
import {
  readJsonlRaw,
  type StoredMessage,
} from '@/ai/services/chat/repositories/chatFileStore'
import { sendWeChatText } from './wechatSendService'
import { logger } from '@/common/logger'

const DEBOUNCE_MS = 3_000

interface PendingItem {
  text: string
  createTimeMs: number
  contextToken?: string
}

interface SessionState {
  timer: NodeJS.Timeout | null
  activeAbort: AbortController | null
}

const pending = new Map<string, PendingItem[]>()
const states = new Map<string, SessionState>()

export function scheduleAiReply(input: {
  sessionId: string
  accountId: string
  text: string
  createTimeMs: number
  contextToken?: string
}): void {
  const { sessionId, accountId, text, createTimeMs, contextToken } = input

  const arr = pending.get(sessionId) ?? []
  arr.push({ text, createTimeMs, contextToken })
  pending.set(sessionId, arr)

  const state = states.get(sessionId) ?? { timer: null, activeAbort: null }
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  if (state.activeAbort) {
    logger.info({ sessionId }, '[wechat-ai] aborting in-flight run for new message')
    state.activeAbort.abort()
    state.activeAbort = null
  }
  state.timer = setTimeout(() => {
    void runAiTurn(sessionId, accountId)
  }, DEBOUNCE_MS)
  states.set(sessionId, state)
}

async function runAiTurn(sessionId: string, accountId: string): Promise<void> {
  const state = states.get(sessionId)
  if (!state) return
  state.timer = null

  const batch = pending.get(sessionId) ?? []
  pending.set(sessionId, [])
  if (batch.length === 0) return

  const ac = new AbortController()
  state.activeAbort = ac
  const lastContextToken = batch[batch.length - 1]?.contextToken

  try {
    const userMessage = buildUserMessage(batch)
    logger.info(
      { sessionId, accountId, batchSize: batch.length },
      '[wechat-ai] triggering runChatStream',
    )
    const response = await runChatStream({
      request: {
        sessionId,
        messages: [userMessage as any],
        trigger: 'submit-message',
      } as any,
      cookies: {},
      requestSignal: ac.signal,
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

    if (ac.signal.aborted) {
      logger.info({ sessionId }, '[wechat-ai] run aborted — skipping sendText')
      return
    }

    const msgs = await readJsonlRaw(sessionId)
    const latestAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
    const text = extractAssistantText(latestAssistant)
    if (!text) {
      logger.warn({ sessionId }, '[wechat-ai] no assistant text after stream')
      return
    }

    if (!lastContextToken) {
      logger.warn({ sessionId }, '[wechat-ai] missing contextToken — cannot send')
      return
    }
    await sendWeChatText({ accountId, text, contextToken: lastContextToken })
  } catch (err) {
    if ((err as any)?.name === 'AbortError' || ac.signal.aborted) {
      logger.info({ sessionId }, '[wechat-ai] aborted (expected on new inbound)')
    } else {
      logger.warn({ err: String(err), sessionId }, '[wechat-ai] turn failed')
    }
  } finally {
    if (state.activeAbort === ac) state.activeAbort = null
    // If new messages came in while we were running, a fresh timer was already
    // scheduled by scheduleAiReply — nothing to do here.
  }
}

function buildUserMessage(batch: PendingItem[]) {
  const text =
    batch.length === 1
      ? batch[0]!.text
      : [
          `[以下是对方连续发来的 ${batch.length} 条消息]`,
          ...batch.map((it) => {
            const d = new Date(it.createTimeMs)
            const hh = String(d.getHours()).padStart(2, '0')
            const mm = String(d.getMinutes()).padStart(2, '0')
            return `[${hh}:${mm}] ${it.text}`
          }),
        ].join('\n')
  return {
    id: randomUUID(),
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }],
    createdAt: new Date(),
    parentMessageId: null,
  }
}

function extractAssistantText(msg: StoredMessage | undefined): string {
  if (!msg) return ''
  const parts = Array.isArray(msg.parts) ? msg.parts : []
  return parts
    .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text as string)
    .join('')
    .trim()
}

/** Test-only: reset all in-memory state. */
export function __resetBridgeStateForTests(): void {
  for (const state of states.values()) {
    if (state.timer) clearTimeout(state.timer)
    if (state.activeAbort) state.activeAbort.abort()
  }
  states.clear()
  pending.clear()
}
