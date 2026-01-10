/** Normalize string input. */
export function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
