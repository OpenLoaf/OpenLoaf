/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Format a date into YYYY-MM-DD. */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD into a Date at 00:00:00. */
export function parseDateKey(value: string): Date {
  const [yearPart, monthPart, dayPart] = value.split("-").map((n) => Number(n));
  const year =
    typeof yearPart === "number" && Number.isFinite(yearPart) ? yearPart : 1970;
  const month =
    typeof monthPart === "number" && Number.isFinite(monthPart) ? monthPart : 1;
  const day =
    typeof dayPart === "number" && Number.isFinite(dayPart) ? dayPart : 1;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Normalize to start of day. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Normalize to end of day. */
export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** List all YYYY-MM-DD keys between two dates (inclusive). */
export function listDateKeysInRange(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let cursor = startOfDay(start);
  const endDay = startOfDay(end);
  while (cursor <= endDay) {
    keys.push(formatDateKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return keys;
}
