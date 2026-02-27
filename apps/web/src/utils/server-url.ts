/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Resolve the server base URL for the current runtime.
 */
export function resolveServerUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = window.openloafElectron?.getRuntimePortsSync?.();
    // 中文注释：桌面端优先使用 runtime 下发的端口。
    if (runtime?.ok && runtime.serverUrl) return runtime.serverUrl;
  }
  return process.env.NEXT_PUBLIC_SERVER_URL ?? "";
}
