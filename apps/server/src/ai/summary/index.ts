import type { MessageRepository, SessionRepository } from "@/ai/chat";
import type { SchedulerPort } from "@/ai/summary/SchedulerPort";
import type { TaskStatusRepository } from "@/ai/summary/TaskStatusRepository";

export type { SchedulerPort } from "@/ai/summary/SchedulerPort";
export type { TaskStatusRepository } from "@/ai/summary/TaskStatusRepository";

export type SummaryPorts = {
  /** Repository for chat messages. */
  messageRepository: MessageRepository;
  /** Repository for chat sessions. */
  sessionRepository: SessionRepository;
  /** Scheduler port for summary jobs. */
  scheduler: SchedulerPort;
  /** Task status repository for background tasks. */
  taskStatusRepository: TaskStatusRepository;
};
