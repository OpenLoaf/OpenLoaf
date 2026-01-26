import type { AgentRunnerPort } from "@/ai/agents";
import type { AuthGateway } from "@/ai/chat/AuthGateway";
import type { MessageRepository } from "@/ai/chat/MessageRepository";
import type { ModelRegistryPort } from "@/ai/models";
import type { SessionRepository } from "@/ai/chat/SessionRepository";
import type { SettingsRepository } from "@/ai/chat/SettingsRepository";
import type { ToolRegistryPort } from "@/ai/tools";
import type { VfsGateway } from "@/ai/chat/VfsGateway";

export type { AuthGateway } from "@/ai/chat/AuthGateway";
export type { MessageRepository } from "@/ai/chat/MessageRepository";
export type { SessionRepository } from "@/ai/chat/SessionRepository";
export type { SettingsRepository } from "@/ai/chat/SettingsRepository";
export type { VfsGateway } from "@/ai/chat/VfsGateway";

export type ChatPorts = {
  /** Repository for chat messages. */
  messageRepository: MessageRepository;
  /** Repository for chat sessions. */
  sessionRepository: SessionRepository;
  /** Gateway for auth/session lookup. */
  authGateway: AuthGateway;
  /** Repository for settings access. */
  settingsRepository: SettingsRepository;
  /** Gateway for VFS access. */
  vfsGateway: VfsGateway;
  /** Registry for model resolution. */
  modelRegistry: ModelRegistryPort;
  /** Registry for tool exposure. */
  toolRegistry: ToolRegistryPort;
  /** Runner for agent streaming. */
  agentRunner: AgentRunnerPort;
};
