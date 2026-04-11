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
 * 全局 task status 缓存 — 用于 ScheduledTaskTool 卡片实时更新状态。
 *
 * ChatCoreProvider 的 onSessionUpdate 订阅收到 TaskStatus-change 事件后
 * 调用 set()，ScheduledTaskTool 组件通过 useTaskStatus() 订阅变化。
 */

type Listener = () => void

const MAX_CACHE_SIZE = 500

const statusMap = new Map<string, string>()
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

export const taskStatusCache = {
  get(taskId: string): string | undefined {
    return statusMap.get(taskId)
  },

  set(taskId: string, status: string) {
    // LRU 淘汰：超出上限时删除最早的条目
    if (!statusMap.has(taskId) && statusMap.size >= MAX_CACHE_SIZE) {
      const firstKey = statusMap.keys().next().value
      if (firstKey !== undefined) statusMap.delete(firstKey)
    }
    statusMap.set(taskId, status)
    notify()
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
