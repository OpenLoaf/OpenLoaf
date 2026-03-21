/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { nanoid } from 'nanoid'
import type { InputSnapshot, VersionStack, VersionStackEntry } from './types'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Create a new InputSnapshot from generation parameters. */
export function createInputSnapshot(params: {
  prompt?: string
  negativePrompt?: string
  /** @deprecated v2 uses feature-based routing; kept for backward compat. */
  modelId?: string
  parameters?: Record<string, unknown>
  upstreamRefs?: InputSnapshot['upstreamRefs']
}): InputSnapshot {
  return {
    prompt: params.prompt ?? '',
    negativePrompt: params.negativePrompt,
    modelId: params.modelId ?? '',
    parameters: params.parameters ?? {},
    upstreamRefs: params.upstreamRefs ?? [],
    timestamp: Date.now(),
  }
}

/** Create a new VersionStackEntry with status='generating'. */
export function createGeneratingEntry(
  input: InputSnapshot,
  taskId: string,
): VersionStackEntry {
  return {
    id: nanoid(),
    status: 'generating',
    input,
    taskId,
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Stack mutations (pure — always return new objects)
// ---------------------------------------------------------------------------

/** Add a new entry to the version stack, setting it as primary. */
export function pushVersion(
  stack: VersionStack | undefined,
  entry: VersionStackEntry,
): VersionStack {
  const existing = stack?.entries ?? []
  return {
    entries: [...existing, entry],
    primaryId: entry.id,
  }
}

/** Update an entry's status to 'ready' with output data. */
export function markVersionReady(
  stack: VersionStack,
  entryId: string,
  output: { urls: string[]; metadata?: Record<string, unknown> },
): VersionStack {
  return {
    ...stack,
    entries: stack.entries.map((e) =>
      e.id === entryId
        ? { ...e, status: 'ready' as const, output }
        : e,
    ),
  }
}

/** Update an entry's status to 'failed' with error info. */
export function markVersionFailed(
  stack: VersionStack,
  entryId: string,
  error: { code: string; message: string; taskId?: string },
): VersionStack {
  return {
    ...stack,
    entries: stack.entries.map((e) =>
      e.id === entryId
        ? { ...e, status: 'failed' as const, error }
        : e,
    ),
  }
}

/** Switch primary to a different entry. */
export function switchPrimary(
  stack: VersionStack,
  entryId: string,
): VersionStack {
  return {
    ...stack,
    primaryId: entryId,
  }
}

// ---------------------------------------------------------------------------
// Queries (pure, read-only)
// ---------------------------------------------------------------------------

/** Get the primary entry from the stack. */
export function getPrimaryEntry(
  stack: VersionStack | undefined,
): VersionStackEntry | undefined {
  if (!stack || stack.entries.length === 0) return undefined
  if (stack.primaryId) {
    const found = stack.entries.find((e) => e.id === stack.primaryId)
    if (found) return found
  }
  // Fallback: return the last entry when primaryId is unset or stale.
  return stack.entries[stack.entries.length - 1]
}

/** Get the currently generating entry (if any). */
export function getGeneratingEntry(
  stack: VersionStack | undefined,
): VersionStackEntry | undefined {
  if (!stack || stack.entries.length === 0) return undefined
  return stack.entries.find((e) => e.status === 'generating')
}

/** Get entry count. */
export function getVersionCount(
  stack: VersionStack | undefined,
): number {
  return stack?.entries.length ?? 0
}
