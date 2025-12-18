import { getCdpConfig } from "@teatime-ai/config";

/**
 * 从 /json/version 拉取 CDP webSocketDebuggerUrl（由 @teatime-ai/config 提供 versionUrl）。
 */
export async function getWebSocketDebuggerUrl(): Promise<string> {
  const { versionUrl } = getCdpConfig(process.env);
  const res = await fetch(versionUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch CDP version info: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as { webSocketDebuggerUrl?: string };
  if (!data.webSocketDebuggerUrl) {
    throw new Error("CDP version info missing webSocketDebuggerUrl");
  }
  return data.webSocketDebuggerUrl;
}

