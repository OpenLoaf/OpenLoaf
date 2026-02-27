/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { describe, it, expect } from 'vitest'
import {
  parsePatch,
  seekSequence,
  computeReplacements,
  applyReplacements,
} from '../applyPatch'

describe('parsePatch', () => {
  it('parses Add File hunk', () => {
    const patch = `*** Begin Patch
*** Add File: src/hello.ts
+export function hello() {
+  return 'world'
+}
*** End Patch`
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]!.type).toBe('add')
    if (hunks[0]!.type === 'add') {
      expect(hunks[0]!.path).toBe('src/hello.ts')
      expect(hunks[0]!.contents).toContain("return 'world'")
    }
  })

  it('parses Delete File hunk', () => {
    const patch = `*** Begin Patch
*** Delete File: src/old.ts
*** End Patch`
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]!.type).toBe('delete')
    if (hunks[0]!.type === 'delete') {
      expect(hunks[0]!.path).toBe('src/old.ts')
    }
  })

  it('parses Update File hunk with context', () => {
    const patch = `*** Begin Patch
*** Update File: src/greet.ts
@@ function greet
 function greet() {
-  return 'hello'
+  return 'hi'
 }
*** End Patch`
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    const h = hunks[0]!
    expect(h.type).toBe('update')
    if (h.type === 'update') {
      expect(h.path).toBe('src/greet.ts')
      expect(h.chunks).toHaveLength(1)
      expect(h.chunks[0]!.changeContext).toBe('function greet')
    }
  })

  it('parses multiple hunks in one patch', () => {
    const patch = `*** Begin Patch
*** Add File: a.ts
+a
*** Delete File: b.ts
*** Update File: c.ts
 line1
-old
+new
 line3
*** End Patch`
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(3)
    expect(hunks[0]!.type).toBe('add')
    expect(hunks[1]!.type).toBe('delete')
    expect(hunks[2]!.type).toBe('update')
  })

  it('parses Move to directive', () => {
    const patch = `*** Begin Patch
*** Update File: old/path.ts
*** Move to: new/path.ts
 keep
*** End Patch`
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    if (hunks[0]!.type === 'update') {
      expect(hunks[0]!.movePath).toBe('new/path.ts')
    }
  })

  it('returns empty for invalid patch', () => {
    expect(parsePatch('no patch here')).toHaveLength(0)
    expect(parsePatch('')).toHaveLength(0)
  })
})

describe('seekSequence', () => {
  const lines = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

  it('finds exact match forward', () => {
    expect(seekSequence(lines, ['beta', 'gamma'], 0, false)).toBe(1)
  })

  it('finds match from start offset', () => {
    expect(seekSequence(lines, ['gamma'], 2, false)).toBe(2)
  })

  it('returns null when not found', () => {
    expect(seekSequence(lines, ['missing'], 0, false)).toBeNull()
  })

  it('finds match from end when eof=true', () => {
    const duped = ['a', 'b', 'a', 'b']
    expect(seekSequence(duped, ['a', 'b'], 0, true)).toBe(2)
  })

  it('matches with trailing whitespace (level 2)', () => {
    const withSpaces = ['alpha  ', 'beta\t']
    expect(seekSequence(withSpaces, ['alpha', 'beta'], 0, false)).toBe(0)
  })

  it('matches ignoring leading whitespace (level 3)', () => {
    const indented = ['  alpha', '  beta']
    expect(seekSequence(indented, ['alpha', 'beta'], 0, false)).toBe(0)
  })
})

describe('computeReplacements', () => {
  it('computes simple replacement', () => {
    const lines = ['a', 'b', 'c', 'd']
    const chunks = [
      {
        changeContext: null,
        oldLines: ['b', 'c'],
        newLines: ['B', 'C'],
        isEndOfFile: false,
      },
    ]
    const result = computeReplacements(lines, 'test.ts', chunks)
    expect(result).toEqual([[1, 3, ['B', 'C']]])
  })

  it('computes pure insertion at EOF', () => {
    const lines = ['a', 'b']
    const chunks = [
      {
        changeContext: null,
        oldLines: [],
        newLines: ['x'],
        isEndOfFile: true,
      },
    ]
    const result = computeReplacements(lines, 'test.ts', chunks)
    expect(result).toEqual([[2, 2, ['x']]])
  })

  it('throws when match not found', () => {
    const lines = ['a', 'b']
    const chunks = [
      {
        changeContext: null,
        oldLines: ['z'],
        newLines: ['Z'],
        isEndOfFile: false,
      },
    ]
    expect(() => computeReplacements(lines, 'test.ts', chunks)).toThrow(
      'could not find matching lines',
    )
  })
})

describe('applyReplacements', () => {
  it('applies single replacement', () => {
    const lines = ['a', 'b', 'c', 'd']
    const result = applyReplacements(lines, [[1, 3, ['B', 'C']]])
    expect(result).toEqual(['a', 'B', 'C', 'd'])
  })

  it('applies multiple replacements in correct order', () => {
    const lines = ['a', 'b', 'c', 'd', 'e']
    const result = applyReplacements(lines, [
      [1, 2, ['B']],
      [3, 4, ['D']],
    ])
    expect(result).toEqual(['a', 'B', 'c', 'D', 'e'])
  })

  it('handles insertion (start === end)', () => {
    const lines = ['a', 'b']
    const result = applyReplacements(lines, [[1, 1, ['x']]])
    expect(result).toEqual(['a', 'x', 'b'])
  })

  it('handles deletion (empty newLines)', () => {
    const lines = ['a', 'b', 'c']
    const result = applyReplacements(lines, [[1, 2, []]])
    expect(result).toEqual(['a', 'c'])
  })
})

describe('end-to-end patch apply', () => {
  it('applies a complete update patch', () => {
    const original = ['function greet() {', "  return 'hello'", '}']
    const patch = `*** Begin Patch
*** Update File: greet.ts
 function greet() {
-  return 'hello'
+  return 'hi'
 }
*** End Patch`
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    const hunk = hunks[0]!
    if (hunk.type !== 'update') throw new Error('expected update')
    const replacements = computeReplacements(original, hunk.path, hunk.chunks)
    const result = applyReplacements(original, replacements)
    expect(result).toEqual(['function greet() {', "  return 'hi'", '}'])
  })
})
