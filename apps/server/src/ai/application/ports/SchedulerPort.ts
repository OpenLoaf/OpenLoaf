export type ScheduleJobInput = {
  /** Job id. */
  jobId: string;
  /** Next run time. */
  runAt: Date;
  /** Optional payload. */
  payload?: unknown;
};

export interface SchedulerPort {
  /** Schedule a job. */
  schedule(input: ScheduleJobInput): Promise<void>;
  /** Cancel a scheduled job. */
  cancel(jobId: string): Promise<void>;
}
