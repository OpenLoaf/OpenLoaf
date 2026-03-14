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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, act } from '@testing-library/react'
import ChatAgentMention, { type ChatAgentMentionHandle } from '../ChatAgentMention'

// Mock trpc
vi.mock('@/utils/trpc', () => ({
  trpc: {
    chat: {
      listSidebarSessions: {
        queryOptions: () => ({
          queryKey: ['chat', 'listSidebarSessions'],
          queryFn: async () => [],
        }),
      },
    },
  },
}))

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: [],
    isLoading: false,
  }),
}))

describe('ChatAgentMention', () => {
  let onChange: ReturnType<typeof vi.fn>
  let ref: React.RefObject<ChatAgentMentionHandle | null>

  beforeEach(() => {
    onChange = vi.fn()
    ref = React.createRef<ChatAgentMentionHandle>()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Trigger conditions', () => {
    it('does not render menu when input has no @agents/ trigger', () => {
      const { container } = render(
        <ChatAgentMention
          ref={ref}
          value="hello world"
          onChange={onChange}
          isFocused={true}
        />,
      )
      // Portal renders to document.body, component returns null
      expect(container.innerHTML).toBe('')
    })

    it('renders menu when input contains @agents/', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )
      // Menu is portaled to document.body
      const menu = document.querySelector('[class*="fixed"]')
      expect(menu).toBeTruthy()
    })

    it('renders menu when @agents/ appears after space', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="help me @agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )
      const menu = document.querySelector('[class*="fixed"]')
      expect(menu).toBeTruthy()
    })

    it('does not render menu when isFocused is false', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={false}
        />,
      )
      const menu = document.querySelector('[class*="fixed"]')
      expect(menu).toBeNull()
    })

    it('filters items when typing after @agents/', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/p"
          onChange={onChange}
          isFocused={true}
        />,
      )
      // PM matches "p"
      const buttons = document.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThanOrEqual(1)
      expect(buttons[0]?.textContent).toContain('PM')
    })

    it('shows no items when filter matches nothing', () => {
      const { container } = render(
        <ChatAgentMention
          ref={ref}
          value="@agents/zzzzz"
          onChange={onChange}
          isFocused={true}
        />,
      )
      // No matching agents → returns null (no portal)
      expect(container.innerHTML).toBe('')
    })
  })

  describe('Keyboard interaction', () => {
    function createKeyEvent(key: string) {
      return {
        key,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent
    }

    it('Enter selects current item and calls onChange', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      const handled = ref.current?.handleKeyDown(createKeyEvent('Enter'))
      expect(handled).toBe(true)
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('@agents/pm '))
    })

    it('Tab selects current item', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      const handled = ref.current?.handleKeyDown(createKeyEvent('Tab'))
      expect(handled).toBe(true)
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('@agents/pm '))
    })

    it('Escape clears @agents/ prefix', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="hello @agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      const handled = ref.current?.handleKeyDown(createKeyEvent('Escape'))
      expect(handled).toBe(true)
      expect(onChange).toHaveBeenCalled()
      // The @agents/ part should be removed
      const newValue = onChange.mock.calls[0][0]
      expect(newValue).not.toContain('@agents/')
    })

    it('ArrowDown/ArrowUp do not crash with single item', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      const downEvent = createKeyEvent('ArrowDown')
      const handled1 = ref.current?.handleKeyDown(downEvent)
      expect(handled1).toBe(true)

      const upEvent = createKeyEvent('ArrowUp')
      const handled2 = ref.current?.handleKeyDown(upEvent)
      expect(handled2).toBe(true)
    })

    it('returns false for non-menu keys', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      const handled = ref.current?.handleKeyDown(createKeyEvent('a'))
      expect(handled).toBe(false)
    })

    it('returns false when menu is not open', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="hello"
          onChange={onChange}
          isFocused={true}
        />,
      )

      const handled = ref.current?.handleKeyDown(createKeyEvent('Enter'))
      expect(handled).toBe(false)
    })
  })

  describe('Selection callback', () => {
    it('selecting PM produces correct @agents/pm prefix in value', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="@agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      // Select via Enter
      ref.current?.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)

      expect(onChange).toHaveBeenCalledTimes(1)
      const newValue = onChange.mock.calls[0][0] as string
      expect(newValue).toContain('@agents/pm ')
    })

    it('selecting with preceding text preserves it', () => {
      render(
        <ChatAgentMention
          ref={ref}
          value="请帮我 @agents/"
          onChange={onChange}
          isFocused={true}
        />,
      )

      ref.current?.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)

      const newValue = onChange.mock.calls[0][0] as string
      expect(newValue).toContain('请帮我')
      expect(newValue).toContain('@agents/pm ')
    })
  })
})
