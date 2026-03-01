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
 * In-memory registry that maps active Claude Code session IDs to their
 * SDK Query objects. This allows external callers (e.g. tRPC routes) to
 * send user responses back to a running Claude Code session.
 */

/** Opaque handle – we only need the streamInput method. */
type QueryHandle = {
  streamInput(stream: AsyncIterable<unknown>): Promise<void>;
};

const activeQueries = new Map<string, QueryHandle>();

export function setActiveQuery(sessionId: string, query: QueryHandle) {
  activeQueries.set(sessionId, query);
}

export function getActiveQuery(sessionId: string): QueryHandle | undefined {
  return activeQueries.get(sessionId);
}

export function clearActiveQuery(sessionId: string) {
  activeQueries.delete(sessionId);
}
