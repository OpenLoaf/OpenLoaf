/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import assert from 'node:assert/strict'

import {
  hasDeletedFlag,
  ensureDeletedFlag,
  removeDeletedFlag,
} from '../emailFlags'

// F1: hasDeletedFlag detects \\Deleted
assert.equal(hasDeletedFlag(['\\Seen', '\\Deleted']), true, 'F1: should detect \\Deleted')

// F2: hasDeletedFlag detects DELETED (no backslash)
assert.equal(hasDeletedFlag(['DELETED']), true, 'F2: should detect DELETED')

// F3: hasDeletedFlag empty flags
assert.equal(hasDeletedFlag([]), false, 'F3: empty flags should return false')

// F4: ensureDeletedFlag idempotent
const alreadyDeleted = ['\\Seen', '\\Deleted']
const result4 = ensureDeletedFlag(alreadyDeleted)
assert.equal(result4.length, 2, 'F4: should not duplicate')
assert.deepEqual(result4, alreadyDeleted, 'F4: should return same array')

// F5: ensureDeletedFlag adds
const noDeleted = ['\\Seen']
const result5 = ensureDeletedFlag(noDeleted)
assert.equal(result5.length, 2, 'F5: should add \\Deleted')
assert.equal(hasDeletedFlag(result5), true, 'F5: should have deleted flag')

// F6: removeDeletedFlag removes
const withDeleted = ['\\Seen', '\\Deleted']
const result6 = removeDeletedFlag(withDeleted)
assert.equal(hasDeletedFlag(result6), false, 'F6: should not have deleted flag')

// F7: removeDeletedFlag preserves other flags
assert.equal(result6.length, 1, 'F7: should keep \\Seen')
assert.equal(result6[0], '\\Seen', 'F7: should preserve \\Seen')

console.log('emailFlags.test.ts: all tests passed')
