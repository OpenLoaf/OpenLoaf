/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useState } from 'react'
import i18next from 'i18next'
import { getPrimaryEntry, getGeneratingEntry, removeFailedEntry } from '../engine/version-stack'
import type { InputSnapshot, VersionStack, VersionStackEntry } from '../engine/types'

// ---------------------------------------------------------------------------
// Error mapping utility
// ---------------------------------------------------------------------------

/**
 * Map a generation error to an i18n message key.
 * Shared across Image/Video/AudioNode for consistent error categorization.
 */
export function mapErrorToMessageKey(error: Error | unknown): string {
  const raw = error instanceof Error ? error.message.toLowerCase() : ''
  if (
    raw.includes('insufficient') ||
    raw.includes('balance') ||
    raw.includes('credit') ||
    raw.includes('quota') ||
    raw.includes('402')
  ) {
    return 'board:polling.errorInsufficientBalance'
  }
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('econnrefused')) {
    return 'board:polling.errorNetwork'
  }
  if (
    raw.includes('401') ||
    raw.includes('403') ||
    raw.includes('unauthorized') ||
    raw.includes('access denied')
  ) {
    return 'board:polling.errorAuth'
  }
  if (raw.includes('429') || raw.includes('rate') || raw.includes('too many')) {
    return 'board:polling.errorRateLimit'
  }
  if (raw.includes('500') || raw.includes('502') || raw.includes('503')) {
    return 'board:polling.errorServer'
  }
  return 'board:polling.errorGeneric'
}

/**
 * Resolve a human-readable error message from a generation error.
 * Prefers the server's original message when no specific i18n category matches.
 */
export function resolveErrorMessage(error: Error | unknown): string {
  const msgKey = mapErrorToMessageKey(error)
  if (msgKey !== 'board:polling.errorGeneric') {
    return i18next.t(msgKey, { defaultValue: 'Generation failed, please retry' })
  }
  // 当无法归类时，优先使用服务端返回的原始错误消息
  const serverMsg = error instanceof Error ? error.message : ''
  if (serverMsg && serverMsg !== 'Request failed') {
    return serverMsg
  }
  return i18next.t(msgKey, { defaultValue: 'Generation failed, please retry' })
}

// ---------------------------------------------------------------------------
// useVersionStackState
// ---------------------------------------------------------------------------

/**
 * Read version stack state — primary entry, generating entry, and convenience booleans.
 */
export function useVersionStackState(versionStack: VersionStack | undefined) {
  const primaryEntry = getPrimaryEntry(versionStack)
  const generatingEntry = getGeneratingEntry(versionStack)

  return {
    primaryEntry,
    generatingEntry,
    isGenerating: Boolean(generatingEntry),
    isReady: primaryEntry?.status === 'ready',
  }
}

// ---------------------------------------------------------------------------
// useVersionStackFailureState
// ---------------------------------------------------------------------------

export type VersionFailure = {
  input: InputSnapshot
  error: { code: string; message: string }
}

/**
 * Manage failure state for version stack — auto-detects failed primary entries,
 * removes them from the stack, and exposes failure UI state.
 */
export function useVersionStackFailureState(
  versionStack: VersionStack | undefined,
  onUpdate: (patch: Record<string, unknown>) => void,
) {
  const [lastFailure, setLastFailure] = useState<VersionFailure | null>(null)
  const [dismissedFailure, setDismissedFailure] = useState(false)

  // Auto-detect and remove failed primary entries
  useEffect(() => {
    const pe = getPrimaryEntry(versionStack)
    if (pe?.status === 'failed' && pe.input && pe.error) {
      setLastFailure({
        input: pe.input,
        error: { code: pe.error.code, message: pe.error.message },
      })
      setDismissedFailure(false)
      const { stack: cleaned } = removeFailedEntry(versionStack!, pe.id)
      onUpdate({ versionStack: cleaned })
    }
  }, [versionStack, onUpdate])

  // Reset dismissal when a new failure arrives
  useEffect(() => {
    if (lastFailure) setDismissedFailure(false)
  }, [lastFailure])

  const isFailed = Boolean(lastFailure && !dismissedFailure)

  return { lastFailure, setLastFailure, dismissedFailure, setDismissedFailure, isFailed }
}

// ---------------------------------------------------------------------------
// useVersionStackEditingOverride
// ---------------------------------------------------------------------------

/** Global set tracking nodes that should enter editing mode on next expand. */
const editingUnlockedIds = new Set<string>()

/** Mark a node to enter editing mode on its next panel expand. */
export function unlockEditing(nodeId: string) {
  editingUnlockedIds.add(nodeId)
}

/**
 * Manage editing override state — automatically enters/exits editing mode
 * based on generation state and panel visibility.
 */
export function useVersionStackEditingOverride(
  nodeId: string,
  expanded: boolean | undefined,
  isGenerating: boolean,
) {
  const [editingOverride, setEditingOverride] = useState(() =>
    editingUnlockedIds.has(nodeId),
  )

  useEffect(() => {
    if (editingUnlockedIds.has(nodeId)) {
      editingUnlockedIds.delete(nodeId)
      setEditingOverride(true)
    }
  }, [expanded, nodeId])

  useEffect(() => {
    if (isGenerating || !expanded) setEditingOverride(false)
  }, [isGenerating, expanded])

  return { editingOverride, setEditingOverride }
}
