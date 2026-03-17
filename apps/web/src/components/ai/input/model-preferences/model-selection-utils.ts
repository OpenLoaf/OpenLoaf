/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

function normalizeIds(value?: string[] | null): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return Array.from(new Set(normalized))
}

/** Keep only the first preferred model id for ChatInput single-select UI. */
export function normalizeSinglePreferredIds(value?: string[] | null): string[] {
  const normalized = normalizeIds(value)
  return normalized.length > 0 ? [normalized[0]] : []
}

/** Build the next preferred id list while preserving the existing array storage shape. */
export function buildSinglePreferredIds(
  currentIds: string[] | null | undefined,
  nextId: string,
): string[] {
  const normalizedNextId = nextId.trim()
  if (!normalizedNextId) return normalizeSinglePreferredIds(currentIds)

  const normalizedCurrentIds = normalizeIds(currentIds)
  if (
    normalizedCurrentIds.length === 1 &&
    normalizedCurrentIds[0] === normalizedNextId
  ) {
    return normalizedCurrentIds
  }
  return [normalizedNextId]
}
