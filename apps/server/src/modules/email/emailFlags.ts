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

/** Ensure Seen flag exists. */
export function ensureSeenFlag(flags: string[]): string[] {
  // 逻辑：幂等补齐已读标记。
  if (hasSeenFlag(flags)) return flags;
  return [...flags, "\\Seen"];
}
