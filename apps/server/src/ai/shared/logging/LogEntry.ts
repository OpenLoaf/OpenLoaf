import type { LogContext } from "./LogContext";
import type { TraceSpan } from "./TraceSpan";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogError = {
  /** Error name or type. */
  name: string;
  /** Error message content. */
  message: string;
  /** Optional error stack. */
  stack?: string;
};

export type LogEntry = {
  /** Log level. */
  level: LogLevel;
  /** Log message. */
  message: string;
  /** Optional log context. */
  context?: LogContext;
  /** Optional tracing span. */
  span?: TraceSpan;
  /** Optional error summary. */
  error?: LogError;
};
