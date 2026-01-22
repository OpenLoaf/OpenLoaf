import type { ScheduleJobInput, SchedulerPort } from "@/ai/application/ports/SchedulerPort";

export class InProcessSchedulerAdapter implements SchedulerPort {
  /** Active timer handles. */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /** Schedule a job. */
  async schedule(input: ScheduleJobInput): Promise<void> {
    await this.cancel(input.jobId);
    const delay = Math.max(0, input.runAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      const handler = input.payload as (() => void) | undefined;
      handler?.();
      this.timers.delete(input.jobId);
    }, delay);
    this.timers.set(input.jobId, timer);
  }

  /** Cancel a scheduled job. */
  async cancel(jobId: string): Promise<void> {
    const timer = this.timers.get(jobId);
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(jobId);
  }
}

export class ExternalSchedulerAdapter implements SchedulerPort {
  /** Schedule a job. */
  async schedule(_input: ScheduleJobInput): Promise<void> {
    // 中文注释：外部调度由外部系统触发，内部无需注册定时器。
  }

  /** Cancel a scheduled job. */
  async cancel(_jobId: string): Promise<void> {
    // 中文注释：外部调度不维护本地任务，直接忽略取消请求。
  }
}
