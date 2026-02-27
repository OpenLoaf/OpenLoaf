/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  TaskStatusRecord,
  TaskStatusRepository,
  TaskStatusValue,
} from "@/ai/services/summary/TaskStatusRepository";

export class InMemoryTaskStatusRepository implements TaskStatusRepository {
  /** In-memory task status store. */
  private readonly store = new Map<string, TaskStatusRecord>();

  /** Persist task status. */
  async upsertStatus(record: TaskStatusRecord): Promise<void> {
    this.store.set(record.taskId, record);
  }

  /** Read task status by id. */
  async getStatus(taskId: string): Promise<TaskStatusRecord | null> {
    return this.store.get(taskId) ?? null;
  }

  /** List task statuses with optional filters. */
  async listStatuses(filter?: {
    projectId?: string;
    workspaceId?: string;
    status?: TaskStatusValue[];
  }): Promise<TaskStatusRecord[]> {
    const records = Array.from(this.store.values());
    if (!filter) return records;
    return records.filter((record) => {
      if (filter.projectId && record.metadata?.projectId !== filter.projectId) return false;
      if (filter.workspaceId && record.metadata?.workspaceId !== filter.workspaceId) return false;
      if (filter.status && !filter.status.includes(record.status)) return false;
      return true;
    });
  }
}
