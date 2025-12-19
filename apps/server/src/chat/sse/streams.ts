import { sseEventBus } from "./bus";

type SseChunk = { seq: number; value: string };

type ActiveSseStream = {
  // 历史 chunk（用于断线续传/新订阅者回放）
  chunks: SseChunk[];
  // 单调递增序号：用于避免“订阅+回放”期间产生的重复 chunk
  nextSeq: number;
  done: boolean;
  // 对应的生成任务取消控制器（用于“用户手动停止生成”）
  abortController?: AbortController;
};

// streamId -> active stream data（内存态，best-effort；进程重启会丢）
const ACTIVE_SSE_STREAMS = new Map<string, ActiveSseStream>();

function chunkEvent(streamId: string) {
  return `${streamId}:chunk`;
}

function doneEvent(streamId: string) {
  return `${streamId}:done`;
}

export function initActiveStream(streamId: string): ActiveSseStream {
  const existing = ACTIVE_SSE_STREAMS.get(streamId);
  if (existing) {
    // 同一个 streamId 重新开始生成时，先“结束旧流并清理监听”，避免旧订阅者挂住/泄漏。
    if (!existing.done) {
      existing.done = true;
      sseEventBus.emit(doneEvent(streamId));
    }
    sseEventBus.removeAllListeners(chunkEvent(streamId));
    sseEventBus.removeAllListeners(doneEvent(streamId));
  }

  const activeStream: ActiveSseStream = {
    chunks: [],
    nextSeq: 0,
    done: false,
  };
  ACTIVE_SSE_STREAMS.set(streamId, activeStream);
  return activeStream;
}

export function attachAbortControllerToActiveStream(
  streamId: string,
  abortController: AbortController,
) {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry || entry.done) return;
  entry.abortController = abortController;
}

/**
 * 用户手动停止某个 streamId 的生成：
 * - abort agent（触发 UI stream 的 abort chunk，从而让 onFinish 收到 isAborted）
 * - 结束并删除内存流，防止 resume 继续回放/继续订阅
 */
export function stopActiveStream(streamId: string, reason = "stopped by user") {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry || entry.done) return false;

  try {
    entry.abortController?.abort(reason);
  } catch {
    // ignore
  }

  // 立即终止内存流：resume 将返回 204，避免“停止后又自动续传”
  finalizeActiveStream(streamId);
  return true;
}

export function appendStreamChunk(streamId: string, value: string) {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry || entry.done) return;

  // 写入内存，方便后续“断线续传/新订阅者回放”
  const chunk: SseChunk = { seq: entry.nextSeq++, value };
  entry.chunks.push(chunk);
  // 广播给所有订阅者（跟随 SSE 客户端）
  sseEventBus.emit(chunkEvent(streamId), chunk);
}

export function finalizeActiveStream(streamId: string) {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry || entry.done) return;

  entry.done = true;

  sseEventBus.emit(doneEvent(streamId));
  // 清掉该 streamId 相关监听，避免监听函数长期累计。
  sseEventBus.removeAllListeners(chunkEvent(streamId));
  sseEventBus.removeAllListeners(doneEvent(streamId));
  // 生成已结束：不再允许 replay（避免刷新/切换会话时把同一条 assistant 重放成多条）
  ACTIVE_SSE_STREAMS.delete(streamId);
}

export function resumeExistingStream(streamId: string): ReadableStream<string> | null {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry) return null;
  if (entry.done) return null;

  let cleanupRef: (() => void) | undefined;

  return new ReadableStream<string>({
    start: (controller) => {
      // snapshot：避免回放过程中 entry.chunks 继续增长导致的不一致
      const snapshot = entry.chunks.slice();
      // 订阅先建立，再回放 snapshot；通过 seq 去重，避免重复发送
      const replayedMaxSeq = snapshot.at(-1)?.seq ?? -1;

      let cleanedUp = false;
      let chunkHandler: ((chunk: SseChunk) => void) | undefined;
      let doneHandler: (() => void) | undefined;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (chunkHandler) sseEventBus.off(chunkEvent(streamId), chunkHandler);
        if (doneHandler) sseEventBus.off(doneEvent(streamId), doneHandler);
      };

      cleanupRef = cleanup;

      chunkHandler = (chunk: SseChunk) => {
        // 如果 chunk 属于回放区间（<= replayedMaxSeq），忽略；避免“订阅+回放”期间重复。
        if (chunk.seq <= replayedMaxSeq) return;
        try {
          controller.enqueue(chunk.value);
        } catch (error) {
          console.error("Error sending chunk to subscriber:", error);
          cleanup();
          controller.close();
        }
      };

      doneHandler = () => {
        cleanup();
        controller.close();
      };

      sseEventBus.on(chunkEvent(streamId), chunkHandler);
      sseEventBus.once(doneEvent(streamId), doneHandler);

      (async () => {
        try {
          // 先把历史 chunk 回放给新订阅者（实现断线续传/补齐）
          for (const chunk of snapshot) {
            controller.enqueue(chunk.value);
            await new Promise<void>((resolve) => setImmediate(resolve));
          }

          // 回放完成后如果流已经结束，立刻关闭（避免客户端空等）。
          if (entry.done) {
            cleanup();
            controller.close();
          }
        } catch (error) {
          console.error("Error replaying chunk:", error);
          cleanup();
          controller.error(error);
        }
      })();
    },
    cancel: () => {
      // 客户端断开时移除本订阅者的监听
      cleanupRef?.();
    },
  });
}
