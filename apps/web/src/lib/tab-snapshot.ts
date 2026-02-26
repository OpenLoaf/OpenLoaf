/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { trpcClient } from "@/utils/trpc";
import { getTabViewById } from "@/hooks/use-tab-view";
import { getWebClientId } from "@/lib/chat/streamClientId";

type CacheKey = string;

const seqByKey = new Map<CacheKey, number>();
const lastJsonByKey = new Map<CacheKey, string>();

function buildKey(input: { sessionId: string; tabId: string }): CacheKey {
  return `${input.sessionId}:${input.tabId}`;
}

/**
 * Upsert the current tab snapshot to server immediately.
 */
export async function upsertTabSnapshotNow(input: {
  sessionId: string;
  tabId: string;
}) {
  const tab = getTabViewById(input.tabId);
  if (!tab) return;

  let json = "";
  try {
    json = JSON.stringify(tab);
  } catch {
    return;
  }

  const key = buildKey(input);
  // 如果 tab 没变就不重复上报，减少服务端写入与网络开销。
  if (json === lastJsonByKey.get(key)) return;
  lastJsonByKey.set(key, json);

  const nextSeq = (seqByKey.get(key) ?? 0) + 1;
  seqByKey.set(key, nextSeq);

  await trpcClient.tab.upsertSnapshot.mutate({
    sessionId: input.sessionId,
    clientId: getWebClientId(),
    tabId: input.tabId,
    seq: nextSeq,
    tab,
  });
}
