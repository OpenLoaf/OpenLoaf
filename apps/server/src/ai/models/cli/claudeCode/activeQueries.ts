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
 * Stub module – kept for import compatibility.
 * The CLI subprocess mode does not support interactive query handles.
 */

export function setActiveQuery(_sessionId: string, _query: unknown) {}

export function getActiveQuery(_sessionId: string): undefined {
  return undefined;
}

export function clearActiveQuery(_sessionId: string) {}
