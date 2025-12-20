import { EventEmitter } from "node:events";

type Chunk = { seq: number; value: string };

type ActiveStream = {
  chunks: Chunk[];
  nextSeq: number;
  done: boolean;
  abortController?: AbortController;
  events: EventEmitter;
};

const STREAMS = new Map<string, ActiveStream>();

function getChunkEvent(streamId: string) {
  return `${streamId}:chunk`;
}

function getDoneEvent(streamId: string) {
  return `${streamId}:done`;
}

/**
 * SSE 内存流存储（MVP）：
 * - 支持断线续传：新订阅者先回放 chunks，再订阅后续 chunk
 * - stop 会触发 AbortController，要求业务侧协作式退出
 *
 * cloud-server 迁移时：把此模块替换成 Redis Stream/PubSub 实现。
 */
export const streamStore = {
  /** 初始化一个 streamId（覆盖旧的）。 */
  start: (streamId: string, abortController?: AbortController) => {
    const existing = STREAMS.get(streamId);
    if (existing && !existing.done) {
      existing.done = true;
      existing.events.emit(getDoneEvent(streamId));
    }
    const entry: ActiveStream = {
      chunks: [],
      nextSeq: 0,
      done: false,
      abortController,
      events: new EventEmitter(),
    };
    STREAMS.set(streamId, entry);
    return entry;
  },

  /** 追加 SSE 字符串 chunk（供订阅者消费）。 */
  append: (streamId: string, value: string) => {
    const entry = STREAMS.get(streamId);
    if (!entry || entry.done) return;
    const chunk: Chunk = { seq: entry.nextSeq++, value };
    entry.chunks.push(chunk);
    entry.events.emit(getChunkEvent(streamId), chunk);
  },

  /** 结束 stream（不再允许订阅/回放）。 */
  finalize: (streamId: string) => {
    const entry = STREAMS.get(streamId);
    if (!entry || entry.done) return;
    entry.done = true;
    entry.events.emit(getDoneEvent(streamId));
    STREAMS.delete(streamId);
  },

  /** 停止生成：abort + finalize。 */
  stop: (streamId: string, reason = "stopped") => {
    const entry = STREAMS.get(streamId);
    if (!entry || entry.done) return false;
    try {
      entry.abortController?.abort(reason);
    } catch {
      // ignore
    }
    streamStore.finalize(streamId);
    return true;
  },

  /** 订阅/续传某个 streamId（返回 ReadableStream<string>）。 */
  subscribe: (streamId: string): ReadableStream<string> | null => {
    const entry = STREAMS.get(streamId);
    if (!entry || entry.done) return null;

    return new ReadableStream<string>({
      start: (controller) => {
        const snapshot = entry.chunks.slice();
        const replayedMaxSeq = snapshot.at(-1)?.seq ?? -1;

        const onChunk = (chunk: Chunk) => {
          if (chunk.seq <= replayedMaxSeq) return;
          controller.enqueue(chunk.value);
        };

        const onDone = () => {
          cleanup();
          controller.close();
        };

        const cleanup = () => {
          entry.events.off(getChunkEvent(streamId), onChunk);
          entry.events.off(getDoneEvent(streamId), onDone);
        };

        entry.events.on(getChunkEvent(streamId), onChunk);
        entry.events.once(getDoneEvent(streamId), onDone);

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
    });
  },
} as const;
