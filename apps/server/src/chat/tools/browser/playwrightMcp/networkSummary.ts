import { truncateText } from "./text";

/**
 * 将 headers 收敛为“keys + 常见关键 header 摘要”，避免返回过大。
 */
export function summarizeHeaders(headers?: Record<string, string>) {
  if (!headers) return undefined;
  const allKeys = Object.keys(headers);
  const keys = allKeys.slice(0, 50);
  const important: Record<string, string> = {};
  const pick = (k: string) => {
    const v = headers[k];
    if (typeof v !== "string") return;
    important[k] = truncateText(v, 500);
  };
  pick("content-type");
  pick("location");
  pick("referer");
  pick("user-agent");
  return {
    count: allKeys.length,
    keys,
    important,
  };
}

