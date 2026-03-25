/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Convert a media source string to the correct API input format.
 * - data: / http(s): / blob: URLs -> { url: src }
 * - Board-relative paths (e.g. "asset/xxx.jpg") -> { path: src }
 */
export function toMediaInput(src: string): { url: string } | { path: string } {
  if (/^(data:|https?:|blob:)/i.test(src)) {
    return { url: src }
  }
  return { path: src }
}
