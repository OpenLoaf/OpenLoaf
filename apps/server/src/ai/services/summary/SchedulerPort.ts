/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
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
