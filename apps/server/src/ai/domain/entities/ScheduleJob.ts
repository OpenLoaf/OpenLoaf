export type ScheduleJob = {
  /** Job id. */
  jobId: string;
  /** Run time. */
  runAt: Date;
  /** Optional payload. */
  payload?: Record<string, unknown>;
};
