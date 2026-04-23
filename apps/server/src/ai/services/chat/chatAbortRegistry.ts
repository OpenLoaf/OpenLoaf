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
 * 同步 /ai/chat 流的 abort 注册表。
 *
 * 背景：依赖 HTTP 连接 close 事件传播 abort 不够可靠（provider 层可能忽略、
 * HTTP/2 下 close 时序不稳定），前端 stop 时显式 POST /ai/chat/abort，
 * 后端按 sessionId 查表直接 abort，强制打断 LLM provider。
 */

import { logger } from "@/common/logger";

const registry = new Map<string, AbortController>();

/** 注册 sessionId → AbortController 关联。同一 session 重复注册以最新为准。 */
export function registerChatAbort(sessionId: string, controller: AbortController): void {
  if (!sessionId) return;
  const prev = registry.get(sessionId);
  if (prev && prev !== controller) {
    // 前一次流未正常 unregister（异常退出），直接 abort 清理。
    try {
      prev.abort();
    } catch {}
  }
  registry.set(sessionId, controller);
}

/** 解除注册。仅当当前持有的 controller 与传入一致时才删除，避免误清新流。 */
export function unregisterChatAbort(sessionId: string, controller: AbortController): void {
  if (!sessionId) return;
  const current = registry.get(sessionId);
  if (current === controller) {
    registry.delete(sessionId);
  }
}

/** 按 sessionId 主动中止。返回是否命中。 */
export function abortChatBySessionId(sessionId: string): boolean {
  const controller = registry.get(sessionId);
  if (!controller) return false;
  try {
    controller.abort();
    logger.info({ sessionId }, "[chat-abort] aborted by sessionId");
  } catch (err) {
    logger.warn({ err, sessionId }, "[chat-abort] abort threw");
  }
  registry.delete(sessionId);
  return true;
}
