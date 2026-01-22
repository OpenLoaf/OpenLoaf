export type TaskStatusValue = "pending" | "running" | "completed" | "failed";

export type TaskStatusRecord = {
  /** Task id. */
  taskId: string;
  /** Current task status. */
  status: TaskStatusValue;
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
};

export interface TaskStatusRepository {
  /** Persist task status. */
  upsertStatus(record: TaskStatusRecord): Promise<void>;
  /** Read task status by id. */
  getStatus(taskId: string): Promise<TaskStatusRecord | null>;
  /** List task statuses with optional filters. */
  listStatuses?(
    filter?: {
      projectId?: string;
      workspaceId?: string;
      status?: TaskStatusValue[];
    },
  ): Promise<TaskStatusRecord[]>;
}
