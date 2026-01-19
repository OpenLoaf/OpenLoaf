export type TraceSpan = {
  /** Span name. */
  name: string;
  /** Span start timestamp (ms). */
  startAt: number;
  /** Span end timestamp (ms). */
  endAt?: number;
  /** Span duration (ms). */
  durationMs?: number;
  /** Span attributes for debugging. */
  attrs?: Record<string, unknown>;
};
