/** Format a date into YYYY-MM-DD. */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD into a Date at 00:00:00. */
export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map((n) => Number(n));
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
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
