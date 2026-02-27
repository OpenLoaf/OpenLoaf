/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Normalize email flags into string array. */
export function normalizeEmailFlags(value: unknown): string[] {
  // 逻辑：兼容 JSON 数组、字符串和空值三种来源。
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // 逻辑：忽略 JSON 解析失败，按普通字符串处理。
    }
    return [trimmed];
  }
  return [];
}

/** Check if flags contain Seen. */
export function hasSeenFlag(flags: string[]): boolean {
  return flags.some((flag) => {
    const normalized = flag.trim().toUpperCase();
    return normalized === "\\SEEN" || normalized === "SEEN";
  });
}

/** Check if flags contain given flag. */
export function hasFlag(flags: string[], target: string): boolean {
  const normalizedTarget = target.trim().toUpperCase();
  return flags.some((flag) => {
    const normalized = flag.trim().toUpperCase();
    return normalized === normalizedTarget || normalized === `\\${normalizedTarget}`;
  });
}

/** Ensure Seen flag exists. */
export function ensureSeenFlag(flags: string[]): string[] {
  // 逻辑：幂等补齐已读标记。
  if (hasSeenFlag(flags)) return flags;
  return [...flags, "\\Seen"];
}

/** Ensure Flagged flag exists. */
export function ensureFlaggedFlag(flags: string[]): string[] {
  // 逻辑：幂等补齐星标标记。
  if (hasFlag(flags, "FLAGGED")) return flags;
  return [...flags, "\\Flagged"];
}

/** Remove Flagged flag if present. */
export function removeFlaggedFlag(flags: string[]): string[] {
  // 逻辑：过滤掉所有形式的星标标记。
  return flags.filter((flag) => !hasFlag([flag], "FLAGGED"));
}

/** Check if flags contain Deleted. */
export function hasDeletedFlag(flags: string[]): boolean {
  return flags.some((flag) => {
    const normalized = flag.trim().toUpperCase();
    return normalized === "\\DELETED" || normalized === "DELETED";
  });
}

/** Ensure Deleted flag exists (idempotent). */
export function ensureDeletedFlag(flags: string[]): string[] {
  if (hasDeletedFlag(flags)) return flags;
  return [...flags, "\\Deleted"];
}

/** Remove Deleted flag if present. */
export function removeDeletedFlag(flags: string[]): string[] {
  return flags.filter((flag) => !hasDeletedFlag([flag]));
}
