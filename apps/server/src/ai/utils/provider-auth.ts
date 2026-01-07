/** 从 authConfig 里读取 apiKey。 */
export function readApiKey(authConfig: Record<string, unknown>): string {
  const apiKey = authConfig.apiKey;
  return typeof apiKey === "string" ? apiKey.trim() : "";
}
