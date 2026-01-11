/**
 * Resolve the server base URL for the current runtime.
 */
export function resolveServerUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = window.tenasElectron?.getRuntimePortsSync?.();
    // 中文注释：桌面端优先使用 runtime 下发的端口。
    if (runtime?.ok && runtime.serverUrl) return runtime.serverUrl;
  }
  return process.env.NEXT_PUBLIC_SERVER_URL ?? "";
}
