/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { UIMessage } from '@ai-sdk/react'
import MessageTaskReport from '../MessageTaskReport'

// Mock the dependent components
vi.mock('@/components/ai-elements/message', () => ({
  Message: ({ children }: { children: React.ReactNode }) => <div data-testid="message">{children}</div>,
  MessageContent: ({ children }: { children: React.ReactNode }) => <div data-testid="message-content">{children}</div>,
}))

vi.mock('@openloaf/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
}))

vi.mock('../MessageParts', () => ({
  default: () => <div data-testid="message-parts" />,
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}))

function createMessage(overrides: Partial<UIMessage> & { metadata?: any } = {}): UIMessage {
  return {
    id: 'test-msg-1',
    role: 'assistant',
    parts: [{ type: 'text' as const, text: 'Task completed successfully.' }],
    ...overrides,
  } as UIMessage
}

describe('MessageTaskReport', () => {
  afterEach(() => {
    cleanup()
  })

  describe('Agent identity rendering', () => {
    it('displays PM label for pm agent type', () => {
      const message = createMessage({
        metadata: {
          agentIdentity: { type: 'pm', name: 'Project Manager' },
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('PM')).toBeTruthy()
    })

    it('displays specialist label for specialist agent type', () => {
      const message = createMessage({
        metadata: {
          agentIdentity: { type: 'specialist', name: 'Code Expert' },
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('专家')).toBeTruthy()
    })

    it('displays secretary label for secretary agent type', () => {
      const message = createMessage({
        metadata: {
          agentIdentity: { type: 'secretary', name: 'Assistant' },
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('秘书')).toBeTruthy()
    })

    it('displays displayName from agentIdentity', () => {
      const message = createMessage({
        metadata: {
          agentIdentity: { type: 'pm', name: '项目经理' },
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('项目经理')).toBeTruthy()
    })

    it('displays project title when provided', () => {
      const message = createMessage({
        metadata: {
          agentIdentity: { type: 'pm', name: 'PM', projectTitle: 'OpenLoaf' },
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('[OpenLoaf]')).toBeTruthy()
    })
  })

  describe('Status rendering', () => {
    it('shows completed styling for completed status', () => {
      const message = createMessage({
        parts: [
          { type: 'task-ref', status: 'completed', title: '任务完成' } as any,
          { type: 'text' as const, text: 'Done' },
        ],
        metadata: { agentIdentity: { type: 'pm', name: 'PM' } },
      })
      render(<MessageTaskReport message={message} />)
      // Check that completed classes are applied
      const fallback = screen.getByTestId('avatar-fallback')
      expect(fallback.className).toContain('ol-green')
    })

    it('shows failed styling for failed status', () => {
      const message = createMessage({
        parts: [
          { type: 'task-ref', status: 'failed', title: '任务失败' } as any,
          { type: 'text' as const, text: 'Error' },
        ],
        metadata: { agentIdentity: { type: 'pm', name: 'PM' } },
      })
      render(<MessageTaskReport message={message} />)
      const fallback = screen.getByTestId('avatar-fallback')
      expect(fallback.className).toContain('ol-red')
    })
  })

  describe('Fallback logic', () => {
    it('falls back to displayName from metadata when no agentIdentity', () => {
      const message = createMessage({
        metadata: {
          displayName: 'Custom Agent',
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('Custom Agent')).toBeTruthy()
    })

    it('falls back to 任务助手 when no identity info', () => {
      const message = createMessage({})
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('任务助手')).toBeTruthy()
    })

    it('falls back agentType from metadata.agentType=pm', () => {
      const message = createMessage({
        metadata: {
          agentType: 'pm',
          displayName: 'PM Agent',
        },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('PM')).toBeTruthy()
    })
  })

  describe('Task title rendering', () => {
    it('displays task title from task-ref part', () => {
      const message = createMessage({
        parts: [
          { type: 'task-ref', status: 'completed', title: '实现登录模块' } as any,
          { type: 'text' as const, text: 'Done' },
        ],
        metadata: { agentIdentity: { type: 'pm', name: 'PM' } },
      })
      render(<MessageTaskReport message={message} />)
      expect(screen.getByText('实现登录模块')).toBeTruthy()
    })
  })
})
