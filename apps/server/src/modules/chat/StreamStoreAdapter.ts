import { EventEmitter } from "node:events";
import Keyv from "keyv";

type Chunk = { seq: number; value: string; bytes: number };

type StreamEntry = {
  chunks: Chunk[];
  nextSeq: number;
  done: boolean;
  totalBytes: number;
  createdAt: number;
  updatedAt: number;
};

type ActiveControl = {
  abortController?: AbortController;
  events: EventEmitter;
  lastActiveAt: number;
  lock: Promise<void>;
  assistantMessageId?: string;
};

const STREAM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STREAM_BUFFER_BYTES = 2 * 1024 * 1024;
const MAX_STREAM_CHUNKS = 5000;
const MAX_ACTIVE_STREAMS = 256;

const streamCache = new Keyv<StreamEntry>({ namespace: "chat:sseStream" });
const activeControls = new Map<string, ActiveControl>();

function getChunkEvent(streamId: string) {
  return `${streamId}:chunk`;
}

function getDoneEvent(streamId: string) {
  return `${streamId}:done`;
}

function touchControl(streamId: string, now: number) {
  const control = activeControls.get(streamId);
  if (!control) return;
  control.lastActiveAt = now;
}

async function withStreamLock<T>(streamId: string, fn: () => Promise<T>): Promise<T> {
  const control = activeControls.get(streamId);
  if (!control) return fn();

  const run = async () => fn();
  const chained = control.lock.then(run, run);
  control.lock = chained.then(
    () => undefined,
    () => undefined,
  );
  return chained;
}

function enforceActiveStreamsCap(now: number) {
  if (activeControls.size <= MAX_ACTIVE_STREAMS) return;
  // 兜底保护，避免异常情况下 active stream 无限增长导致内存压力。
  const candidates = Array.from(activeControls.entries()).sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
  const toEvict = candidates.slice(0, Math.max(0, activeControls.size - MAX_ACTIVE_STREAMS));
  for (const [streamId] of toEvict) {
    void streamStore.stop(streamId, "evicted");
    touchControl(streamId, now);
  }
}

function scheduleStaleSweep() {
  // 惰性 TTL 可能在长时间无请求时不触发；用定时 sweep 兜底释放资源。
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [streamId, control] of activeControls.entries()) {
      if (now - control.lastActiveAt <= STREAM_IDLE_TTL_MS) continue;
      void streamStore.stop(streamId, "idle-timeout");
    }
  }, 5 * 60 * 1000);
  interval.unref?.();
}

scheduleStaleSweep();

/**
 * SSE 内存流存储（MVP）：
 * - 支持断线续传：新订阅者先回放 chunks，再订阅后续 chunk
 * - stop 会触发 AbortController，要求业务侧协作式退出
 *
 * cloud-server 迁移时：把此模块替换成 Redis Stream/PubSub 实现。
 */
export const streamStore = {
  /** 初始化一个 streamId（覆盖旧的）。 */
  start: async (streamId: string, abortController?: AbortController) => {
    const now = Date.now();
    enforceActiveStreamsCap(now);

    const existing = activeControls.get(streamId);
    if (existing) {
      existing.events.emit(getDoneEvent(streamId));
      activeControls.delete(streamId);
    }

    const control: ActiveControl = {
      abortController,
      events: new EventEmitter(),
      lastActiveAt: now,
      lock: Promise.resolve(),
    };
    activeControls.set(streamId, control);

    const entry: StreamEntry = {
      chunks: [],
      nextSeq: 0,
      done: false,
      totalBytes: 0,
      createdAt: now,
      updatedAt: now,
    };
    await streamCache.set(streamId, entry, STREAM_IDLE_TTL_MS);
  },
  /** 记录当前流的 assistant messageId（用于 stop 时定位消息）。 */
  setAssistantMessageId: (streamId: string, assistantMessageId: string) => {
    const control = activeControls.get(streamId);
    if (!control) return;
    control.assistantMessageId = assistantMessageId;
  },
  /** 读取当前流的 assistant messageId。 */
  getAssistantMessageId: (streamId: string): string | undefined => {
    return activeControls.get(streamId)?.assistantMessageId;
  },

  /** 追加 SSE 字符串 chunk（供订阅者消费）。 */
  append: async (streamId: string, value: string) => {
    const now = Date.now();
    touchControl(streamId, now);

    await withStreamLock(streamId, async () => {
      const entry = await streamCache.get(streamId);
      if (!entry || entry.done) return;

      const bytes = Buffer.byteLength(value, "utf8");
      const chunk: Chunk = { seq: entry.nextSeq++, value, bytes };
      entry.chunks.push(chunk);
      entry.totalBytes += bytes;
      entry.updatedAt = now;

      // 限制 buffer，避免长对话/异常输出导致内存无限增长（断线续传会退化为“只回放最近一段”）。
      while (entry.chunks.length > MAX_STREAM_CHUNKS || entry.totalBytes > MAX_STREAM_BUFFER_BYTES) {
        const removed = entry.chunks.shift();
        if (!removed) break;
        entry.totalBytes -= removed.bytes;
      }

      await streamCache.set(streamId, entry, STREAM_IDLE_TTL_MS);

      const control = activeControls.get(streamId);
      if (!control) return;
      control.events.emit(getChunkEvent(streamId), chunk);
    });
  },

  /** 结束 stream（保留回放窗口）。 */
  finalize: async (streamId: string) => {
    const now = Date.now();
    touchControl(streamId, now);

    await withStreamLock(streamId, async () => {
      const entry = await streamCache.get(streamId);
      if (!entry || entry.done) return;
      entry.done = true;
      entry.updatedAt = now;

      const control = activeControls.get(streamId);
      if (control) {
        control.events.emit(getDoneEvent(streamId));
        activeControls.delete(streamId);
      }

      // 保留一段时间用于断线续传（done=true 但仍可回放）。
      await streamCache.set(streamId, entry, STREAM_IDLE_TTL_MS);
    });
  },

  /** 停止生成：abort + finalize。 */
  stop: async (streamId: string, reason = "stopped") => {
    const now = Date.now();
    touchControl(streamId, now);

    const control = activeControls.get(streamId);
    const entry = await streamCache.get(streamId);
    if (!entry || entry.done) return false;

    try {
      control?.abortController?.abort(reason);
    } catch {
      // ignore
    }
    await streamStore.finalize(streamId);
    return true;
  },

  /** 订阅/续传某个 streamId（返回 ReadableStream<string>）。 */
  subscribe: async (streamId: string): Promise<ReadableStream<string> | null> => {
    const now = Date.now();
    touchControl(streamId, now);

    const entry = await streamCache.get(streamId);
    const control = activeControls.get(streamId);
    if (!entry) return null;

    if (entry.done && !control) {
      const snapshot = entry.chunks.slice();
      return new ReadableStream<string>({
        start: (controller) => {
          (async () => {
            for (const chunk of snapshot) {
              controller.enqueue(chunk.value);
              await new Promise<void>((r) => setImmediate(r));
            }
            controller.close();
          })().catch((err) => controller.error(err));
        },
      });
    }

    if (!control) return null;

    // subscribe 也算“活跃”，刷新 idle TTL，避免断线续传窗口过早过期。
    entry.updatedAt = now;
    await streamCache.set(streamId, entry, STREAM_IDLE_TTL_MS);

    let cleanupListener: (() => void) | null = null;

    return new ReadableStream<string>({
      start: (controller) => {
        const snapshot = entry.chunks.slice();
        const replayedMaxSeq = snapshot.at(-1)?.seq ?? -1;
        let cleaned = false;

        const onChunk = (chunk: Chunk) => {
          if (chunk.seq <= replayedMaxSeq) return;
          controller.enqueue(chunk.value);
        };

        const onDone = () => {
          cleanup();
          controller.close();
        };

        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          control.events.off(getChunkEvent(streamId), onChunk);
          control.events.off(getDoneEvent(streamId), onDone);
        };
        cleanupListener = cleanup;

        control.events.on(getChunkEvent(streamId), onChunk);
        control.events.once(getDoneEvent(streamId), onDone);

        (async () => {
          for (const chunk of snapshot) {
            controller.enqueue(chunk.value);
            await new Promise<void>((r) => setImmediate(r));
          }
          if (entry.done) {
            cleanup();
            controller.close();
          }
        })().catch((err) => {
          cleanup();
          controller.error(err);
        });
      },
      cancel: () => {
        // 客户端断开/取消订阅时，确保移除监听器，避免 event listener 泄漏。
        cleanupListener?.();
      },
    });
  },
} as const;
