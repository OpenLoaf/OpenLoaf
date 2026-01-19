export type AgentStreamChunk = {
  /** Chunk payload. */
  data: unknown;
};

export interface AgentRunnerPort {
  /** Stream agent output chunks. */
  stream(): AsyncIterable<AgentStreamChunk>;
}
