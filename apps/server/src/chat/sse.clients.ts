const ACTIVE_SSE_STREAM_CLIENTS = new Map<string, Set<string>>();

export function tryAddSseClient(streamId: string, clientId: string): boolean {
  if (!clientId) return true;

  const existing = ACTIVE_SSE_STREAM_CLIENTS.get(streamId);
  if (existing?.has(clientId)) return false;

  // 这里用 (streamId + clientId) 做“跟随者”去重：
  // 同一个客户端重复建立 SSE 连接时，直接返回 204，避免一份流被消费多次。
  const next = existing ?? new Set<string>();
  next.add(clientId);
  ACTIVE_SSE_STREAM_CLIENTS.set(streamId, next);
  return true;
}

export function removeSseClient(streamId: string, clientId: string) {
  if (!clientId) return;

  const set = ACTIVE_SSE_STREAM_CLIENTS.get(streamId);
  if (!set) return;

  // 连接结束/abort 时释放，避免 Set 泄漏。
  set.delete(clientId);
  if (set.size === 0) ACTIVE_SSE_STREAM_CLIENTS.delete(streamId);
}
