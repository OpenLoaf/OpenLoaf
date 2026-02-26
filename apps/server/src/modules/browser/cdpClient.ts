/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { getCdpConfig } from "@openloaf/config";
import { getCdpSession } from "@/modules/browser/cdpSessionPool";

type CdpTargetInfo = {
  id?: string;
  webSocketDebuggerUrl?: string;
};

type CdpTargetList = CdpTargetInfo[];

type TargetCache = {
  expiresAt: number;
  targets: CdpTargetList;
};

const TARGET_CACHE_TTL_MS = 2_000;
let targetCache: TargetCache | null = null;

/** Fetch CDP target list from the remote debugging endpoint. */
async function fetchTargetList(): Promise<CdpTargetList> {
  const config = getCdpConfig();
  const res = await fetch(`${config.baseUrl}/json/list`);
  if (!res.ok) throw new Error(`Failed to fetch CDP targets: ${res.status}`);
  return (await res.json()) as CdpTargetList;
}

/** Return cached CDP target list with a short TTL. */
async function getCachedTargetList(): Promise<CdpTargetList> {
  const now = Date.now();
  // 缓存列表，避免频繁请求 /json/list。
  if (targetCache && targetCache.expiresAt > now) return targetCache.targets;
  const targets = await fetchTargetList();
  targetCache = { targets, expiresAt: now + TARGET_CACHE_TTL_MS };
  return targets;
}

/**
 * Resolve a CDP websocket URL for a given targetId.
 */
export async function resolveTargetWebSocketUrl(targetId: string): Promise<string> {
  // 通过 /json/list 定位 targetId 对应的 websocket 地址。
  const list = await getCachedTargetList();
  const found = list.find((item) => item?.id === targetId);
  const url = String(found?.webSocketDebuggerUrl ?? "").trim();
  if (!url) throw new Error(`CDP target not found: ${targetId}`);
  return url;
}

/**
 * Send a CDP command to the targetId via WebSocket.
 */
export async function sendCdpCommand(input: {
  targetId: string;
  method: string;
  params?: Record<string, unknown>;
}) {
  const wsUrl = await resolveTargetWebSocketUrl(input.targetId);
  const session = getCdpSession({ targetId: input.targetId, wsUrl });
  // 复用 session，避免每次命令都重新建立连接。
  return await session.send(input.method, input.params);
}
