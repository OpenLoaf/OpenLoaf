export type LogContext = {
  /** Request correlation id. */
  requestId?: string;
  /** Session id for the chat. */
  sessionId?: string;
  /** Workspace id for the request. */
  workspaceId?: string;
  /** Project id for the request. */
  projectId?: string;
  /** User id for the request. */
  userId?: string;
  /** Agent id handling the request. */
  agentId?: string;
  /** Model id for the request. */
  modelId?: string;
  /** Provider id for the model. */
  providerId?: string;
  /** Tool id for the call. */
  toolId?: string;
  /** Tool call id for the call. */
  toolCallId?: string;
  /** Command id for the action. */
  commandId?: string;
  /** Task id for background execution. */
  taskId?: string;
};
