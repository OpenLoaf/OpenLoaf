/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Tests the wrapToolWithAutoApproval algorithm from:
 *   apps/server/src/ai/tools/toolRegistry.ts
 *
 * Since the server package cannot be directly imported by the web vitest,
 * the core logic is reproduced here with a configurable context provider
 * to verify all approval-wrapping combinations.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Reproduce the core algorithm from toolRegistry.ts with injectable context
// ---------------------------------------------------------------------------

const AUTO_APPROVE_EXCLUDED_TOOLS = new Set(['request-user-input'])

type RequestContext = {
  autoApproveTools?: boolean
  supervisionMode?: boolean
}

function wrapToolWithAutoApproval(
  toolId: string,
  tool: any,
  getContext: () => RequestContext | undefined,
): any {
  if (AUTO_APPROVE_EXCLUDED_TOOLS.has(toolId)) return tool
  const original = tool.needsApproval
  if (original === undefined || original === false) return tool
  return {
    ...tool,
    needsApproval:
      typeof original === 'function'
        ? (...args: any[]) => {
            const ctx = getContext()
            if (ctx?.autoApproveTools || ctx?.supervisionMode) return false
            return (original as Function)(...args)
          }
        : () => {
            const ctx = getContext()
            return !(ctx?.autoApproveTools || ctx?.supervisionMode)
          },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wrapToolWithAutoApproval', () => {
  const noop = () => undefined

  it('returns original tool for excluded tool id (request-user-input)', () => {
    const tool = { needsApproval: true, execute: vi.fn() }
    const result = wrapToolWithAutoApproval('request-user-input', tool, noop)
    expect(result).toBe(tool)
  })

  it('returns original tool when needsApproval is undefined', () => {
    const tool = { execute: vi.fn() }
    const result = wrapToolWithAutoApproval('some-tool', tool, noop)
    expect(result).toBe(tool)
  })

  it('returns original tool when needsApproval is false', () => {
    const tool = { needsApproval: false, execute: vi.fn() }
    const result = wrapToolWithAutoApproval('some-tool', tool, noop)
    expect(result).toBe(tool)
  })

  describe('needsApproval = true (static)', () => {
    it('returns false when autoApproveTools is true', () => {
      const tool = { needsApproval: true }
      const getCtx = () => ({ autoApproveTools: true })
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, getCtx)
      expect(wrapped.needsApproval()).toBe(false)
    })

    it('returns true when autoApproveTools is false', () => {
      const tool = { needsApproval: true }
      const getCtx = () => ({ autoApproveTools: false })
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, getCtx)
      expect(wrapped.needsApproval()).toBe(true)
    })

    it('returns false when supervisionMode is true', () => {
      const tool = { needsApproval: true }
      const getCtx = () => ({ supervisionMode: true })
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, getCtx)
      expect(wrapped.needsApproval()).toBe(false)
    })

    it('returns true when context is undefined', () => {
      const tool = { needsApproval: true }
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, noop)
      expect(wrapped.needsApproval()).toBe(true)
    })
  })

  describe('needsApproval = function', () => {
    it('returns false when autoApproveTools is true (skips original)', () => {
      const originalFn = vi.fn().mockReturnValue(true)
      const tool = { needsApproval: originalFn }
      const getCtx = () => ({ autoApproveTools: true })
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, getCtx)

      expect(wrapped.needsApproval('arg1', 'arg2')).toBe(false)
      expect(originalFn).not.toHaveBeenCalled()
    })

    it('delegates to original function when autoApproveTools is false', () => {
      const originalFn = vi.fn().mockReturnValue(true)
      const tool = { needsApproval: originalFn }
      const getCtx = () => ({ autoApproveTools: false })
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, getCtx)

      expect(wrapped.needsApproval('arg1', 'arg2')).toBe(true)
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('returns false when supervisionMode is true (skips original)', () => {
      const originalFn = vi.fn().mockReturnValue(true)
      const tool = { needsApproval: originalFn }
      const getCtx = () => ({ supervisionMode: true })
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, getCtx)

      expect(wrapped.needsApproval()).toBe(false)
      expect(originalFn).not.toHaveBeenCalled()
    })

    it('delegates to original when context is undefined', () => {
      const originalFn = vi.fn().mockReturnValue(false)
      const tool = { needsApproval: originalFn }
      const wrapped = wrapToolWithAutoApproval('some-tool', tool, noop)

      expect(wrapped.needsApproval()).toBe(false)
      expect(originalFn).toHaveBeenCalled()
    })
  })

  it('preserves other tool properties after wrapping', () => {
    const tool = {
      needsApproval: true,
      execute: vi.fn(),
      description: 'test tool',
    }
    const wrapped = wrapToolWithAutoApproval('some-tool', tool, noop)
    expect(wrapped.execute).toBe(tool.execute)
    expect(wrapped.description).toBe('test tool')
  })
})
