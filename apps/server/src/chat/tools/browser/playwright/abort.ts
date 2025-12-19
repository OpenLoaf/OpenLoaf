/**
 * 可取消工具的通用错误类型（用于 stop 后快速退出 while/等待）。
 */
export class AbortError extends Error {
  constructor(message = "aborted") {
    super(message);
    this.name = "AbortError";
  }
}

/**
 * 可取消 sleep：
 * - 正常：等待 ms 后 resolve
 * - 若 abortSignal 被触发：立刻 reject AbortError
 */
export function sleepWithAbort(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (abortSignal?.aborted) return Promise.reject(new AbortError());

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new AbortError());
    };

    const cleanup = () => {
      clearTimeout(timer);
      try {
        abortSignal?.removeEventListener("abort", onAbort);
      } catch {
        // ignore
      }
    };

    try {
      abortSignal?.addEventListener("abort", onAbort, { once: true });
    } catch {
      // ignore
    }
  });
}

