/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { QueryClient } from '@tanstack/react-query'
import { vi } from 'vitest'

import type {
  EmailAccountView,
  EmailMailboxView,
  EmailMessageDetail,
  EmailMessageSummary,
} from '../email-types'

// ── Mock 数据工厂 ──

let _idCounter = 0

export function createMockMessage(
  overrides: Partial<EmailMessageSummary> = {},
): EmailMessageSummary {
  _idCounter += 1
  return {
    id: `msg-${_idCounter}`,
    accountEmail: 'test@example.com',
    mailbox: 'INBOX',
    from: 'sender@example.com',
    subject: `Test Subject ${_idCounter}`,
    preview: 'Preview text...',
    time: '2026-01-15T10:00:00Z',
    unread: false,
    hasAttachments: false,
    isPrivate: false,
    ...overrides,
  }
}

export function createMockAccount(
  overrides: Partial<EmailAccountView> = {},
): EmailAccountView {
  return {
    emailAddress: 'test@example.com',
    label: 'Test Account',
    status: { lastSyncAt: '2026-01-15T10:00:00Z', lastError: null },
    ...overrides,
  }
}

export function createMockMailbox(
  overrides: Partial<EmailMailboxView> = {},
): EmailMailboxView {
  return {
    path: 'INBOX',
    name: 'Inbox',
    attributes: ['\\Inbox'],
    ...overrides,
  }
}

export function createMockMessageDetail(
  overrides: Partial<EmailMessageDetail> = {},
): EmailMessageDetail {
  _idCounter += 1
  return {
    id: `msg-${_idCounter}`,
    accountEmail: 'test@example.com',
    mailbox: 'INBOX',
    subject: `Test Subject ${_idCounter}`,
    from: ['sender@example.com'],
    to: ['test@example.com'],
    cc: [],
    bcc: [],
    date: '2026-01-15T10:00:00Z',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    attachments: [],
    flags: [],
    isPrivate: false,
    ...overrides,
  }
}

// ── QueryClient 工厂 ──

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

// ── tRPC Mock 工具 ──

/**
 * 创建一个 Proxy 链，拦截 trpc.email.xxx.mutationOptions / queryOptions / pathKey 等调用。
 * 用于 vi.mock('@/utils/trpc') 的工厂函数。
 */
export function createTrpcMock() {
  const mutationFns: Record<string, ReturnType<typeof vi.fn>> = {}

  function getMutationFn(name: string) {
    if (!mutationFns[name]) {
      mutationFns[name] = vi.fn().mockResolvedValue({})
    }
    return mutationFns[name]!
  }

  // 逻辑：用 Proxy 模拟 trpc.email.xxx 的链式调用
  const emailProxy = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return {
          mutationOptions: (opts: Record<string, unknown> = {}) => ({
            mutationFn: getMutationFn(prop),
            ...opts,
          }),
          queryOptions: (input: unknown) => ({
            queryKey: ['email', prop, input],
            queryFn: vi.fn().mockResolvedValue(undefined),
          }),
          infiniteQueryOptions: (input: unknown, opts?: Record<string, unknown>) => ({
            queryKey: ['email', prop, 'infinite', input],
            queryFn: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
            ...opts,
          }),
          pathKey: () => ['email', prop],
        }
      },
    },
  )

  const trpc = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'email') return emailProxy
        return emailProxy
      },
    },
  )

  return { trpc, mutationFns, getMutationFn }
}

export function resetIdCounter() {
  _idCounter = 0
}
