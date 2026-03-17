/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { logger } from '@/common/logger'

export type StreamSessionStatus = 'streaming' | 'completed' | 'error' | 'aborted'

export type StreamEvent =
  | { type: 'chunk'; chunk: unknown; index: number }
  | { type: 'complete' }
  | { type: 'error'; message: string }
  | { type: 'aborted' }

export type StreamListener = (event: StreamEvent) => void

export type StreamSession = {
  sessionId: string
  assistantMessageId: string
  status: StreamSessionStatus
  chunks: unknown[]
  abortController: AbortController
  listeners: Set<StreamListener>
  createdAt: number
  completedAt?: number
  errorMessage?: string
}

/** 已完成 session 的保留时长 (ms)。 */
const COMPLETED_TTL_MS = 120_000
/** streaming session 最大存活时长 (ms)。超过后视为卡住，自动中止。 */
const MAX_STREAMING_TTL_MS = 300_000
/** 清理扫描间隔 (ms)。 */
const CLEANUP_INTERVAL_MS = 30_000

class StreamSessionManager {
  private sessions = new Map<string, StreamSession>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
    // 不阻止进程退出
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  create(sessionId: string, assistantMessageId: string): StreamSession {
    const existing = this.sessions.get(sessionId)
    if (existing && existing.status === 'streaming') {
      // 幂等：已有活跃流，返回现有 session
      return existing
    }
    const session: StreamSession = {
      sessionId,
      assistantMessageId,
      status: 'streaming',
      chunks: [],
      abortController: new AbortController(),
      listeners: new Set(),
      createdAt: Date.now(),
    }
    this.sessions.set(sessionId, session)
    return session
  }

  get(sessionId: string): StreamSession | undefined {
    return this.sessions.get(sessionId)
  }

  pushChunk(sessionId: string, chunk: unknown): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'streaming') return
    const index = session.chunks.length
    session.chunks.push(chunk)
    const event: StreamEvent = { type: 'chunk', chunk, index }
    for (const listener of session.listeners) {
      try {
        listener(event)
      } catch (err) {
        logger.warn({ err, sessionId }, '[streamSession] listener error on chunk')
      }
    }
  }

  subscribe(sessionId: string, listener: StreamListener): () => void {
    const session = this.sessions.get(sessionId)
    if (!session) return () => {}
    session.listeners.add(listener)
    return () => {
      session.listeners.delete(listener)
    }
  }

  /**
   * 原子性订阅：先重放 chunks[offset:]，再订阅后续事件。
   * 保证在重放和订阅之间不会遗漏任何 chunk。
   */
  subscribeFromOffset(
    sessionId: string,
    offset: number,
    listener: StreamListener,
  ): () => void {
    const session = this.sessions.get(sessionId)
    if (!session) return () => {}

    // 先添加 listener（确保新 chunk 不遗漏）
    session.listeners.add(listener)

    // 再重放 chunks[offset:]（同步执行，不会与 pushChunk 交错）
    for (let i = offset; i < session.chunks.length; i++) {
      try {
        listener({ type: 'chunk', chunk: session.chunks[i], index: i })
      } catch (err) {
        logger.warn({ err, sessionId }, '[streamSession] listener error on replay')
      }
    }

    // 如果已结束，立即通知
    if (session.status !== 'streaming') {
      try {
        if (session.status === 'completed') {
          listener({ type: 'complete' })
        } else if (session.status === 'error') {
          listener({ type: 'error', message: session.errorMessage ?? 'Unknown error' })
        } else if (session.status === 'aborted') {
          listener({ type: 'aborted' })
        }
      } catch (err) {
        logger.warn({ err, sessionId }, '[streamSession] listener error on terminal event')
      }
      session.listeners.delete(listener)
      return () => {}
    }

    return () => {
      session.listeners.delete(listener)
    }
  }

  complete(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'streaming') return
    session.status = 'completed'
    session.completedAt = Date.now()
    this.notify(session, { type: 'complete' })
  }

  fail(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'streaming') return
    session.status = 'error'
    session.completedAt = Date.now()
    session.errorMessage = error
    this.notify(session, { type: 'error', message: error })
  }

  abort(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'streaming') return
    session.status = 'aborted'
    session.completedAt = Date.now()
    session.abortController.abort()
    this.notify(session, { type: 'aborted' })
  }

  private notify(session: StreamSession, event: StreamEvent): void {
    for (const listener of session.listeners) {
      try {
        listener(event)
      } catch (err) {
        logger.warn({ err, sessionId: session.sessionId }, '[streamSession] listener error')
      }
    }
    session.listeners.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (session.status === 'streaming') {
        // 超时 streaming session：视为卡住，自动中止
        if (now - session.createdAt > MAX_STREAMING_TTL_MS) {
          logger.warn({ sessionId: id, ageMs: now - session.createdAt }, '[streamSession] streaming session timed out, aborting')
          this.abort(id)
          this.sessions.delete(id)
        }
        continue
      }
      if (session.completedAt && now - session.completedAt > COMPLETED_TTL_MS) {
        this.sessions.delete(id)
      }
    }
  }

  /** 获取活跃 session 数量（用于监控）。 */
  get activeCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.status === 'streaming') count++
    }
    return count
  }

  dispose(): void {
    clearInterval(this.cleanupTimer)
    this.sessions.clear()
  }
}

export const streamSessionManager = new StreamSessionManager()
