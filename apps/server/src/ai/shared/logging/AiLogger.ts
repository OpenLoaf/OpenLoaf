import type { LogContext } from "./LogContext";
import type { LogEntry } from "./LogEntry";

export interface AiLogger {
  /** Log with full entry fields. */
  log(entry: LogEntry): void;
  /** Log debug message with context. */
  debug(message: string, context?: LogContext): void;
  /** Log info message with context. */
  info(message: string, context?: LogContext): void;
  /** Log warning message with context. */
  warn(message: string, context?: LogContext): void;
  /** Log error message with context. */
  error(message: string, context?: LogContext): void;
}
