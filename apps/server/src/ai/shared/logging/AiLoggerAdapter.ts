import { logger } from "@/common/logger";
import type { AiLogger } from "@/ai/shared/logging/AiLogger";
import type { LogContext } from "@/ai/shared/logging/LogContext";
import type { LogEntry } from "@/ai/shared/logging/LogEntry";

export class AiLoggerAdapter implements AiLogger {
  /** Log with full entry fields. */
  log(entry: LogEntry): void {
    logger[entry.level]({ context: entry.context, span: entry.span, error: entry.error }, entry.message);
  }

  /** Log debug message with context. */
  debug(message: string, context?: LogContext): void {
    this.log({ level: "debug", message, context });
  }

  /** Log info message with context. */
  info(message: string, context?: LogContext): void {
    this.log({ level: "info", message, context });
  }

  /** Log warning message with context. */
  warn(message: string, context?: LogContext): void {
    this.log({ level: "warn", message, context });
  }

  /** Log error message with context. */
  error(message: string, context?: LogContext): void {
    this.log({ level: "error", message, context });
  }
}
