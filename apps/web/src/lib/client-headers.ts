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
 * Header name required by the server's `aiRouteGuard` middleware.
 *
 * All POST/PUT/DELETE requests to `/ai/*` endpoints must include this header
 * to pass the CSRF-style guard. The value can be any non-empty string.
 */
export const CLIENT_HEADER_NAME = 'X-OpenLoaf-Client'

/** Standard client header record to spread into fetch headers. */
export const CLIENT_HEADERS: Record<string, string> = {
  [CLIENT_HEADER_NAME]: '1',
}
