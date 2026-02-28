/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatMessageComposer } from '../use-chat-message-composer'

vi.mock('@/lib/chat/image-options', () => ({
  normalizeImageOptions: (opts: any) => opts,
}))

vi.mock('@/lib/chat/codex-options', () => ({
  normalizeCodexOptions: (opts: any) => opts,
}))

describe('useChatMessageComposer', () => {
  const baseInput = { canImageGeneration: false, isCodexProvider: false }
  const baseParams = { textValue: 'hello', imageParts: [] }

  it('includes toolApproval in metadata when autoApproveTools=true', () => {
    const { result } = renderHook(() => useChatMessageComposer(baseInput))
    const compose = result.current

    const { metadata } = compose({ ...baseParams, autoApproveTools: true })

    expect(metadata).toBeDefined()
    expect(metadata).toHaveProperty('toolApproval')
    expect((metadata as any).toolApproval).toEqual({ autoApprove: true })
  })

  it('does not include toolApproval when autoApproveTools=false', () => {
    const { result } = renderHook(() => useChatMessageComposer(baseInput))
    const compose = result.current

    const { metadata } = compose({ ...baseParams, autoApproveTools: false })

    expect(metadata).toBeUndefined()
  })

  it('does not include toolApproval when autoApproveTools is undefined', () => {
    const { result } = renderHook(() => useChatMessageComposer(baseInput))
    const compose = result.current

    const { metadata } = compose({ ...baseParams })

    expect(metadata).toBeUndefined()
  })

  it('preserves other metadata alongside toolApproval', () => {
    const { result } = renderHook(() =>
      useChatMessageComposer({ canImageGeneration: false, isCodexProvider: false }),
    )
    const compose = result.current

    const { metadata } = compose({
      ...baseParams,
      autoApproveTools: true,
      reasoningMode: 'deep',
    })

    expect(metadata).toBeDefined()
    expect((metadata as any).toolApproval).toEqual({ autoApprove: true })
    expect((metadata as any).reasoning).toEqual({ mode: 'deep' })
  })
})
