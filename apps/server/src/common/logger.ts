import pino from "pino";
import { getRequestContext } from "../ai/shared/context/requestContext";

type LogLevel = pino.LevelWithSilent;

/**
 * Normalize and validate log level string for pino.
 */
function normalizeLogLevel(raw: unknown): LogLevel | undefined {
  if (typeof raw !== "string") return;
  const level = raw.trim().toLowerCase();
  const allowed: LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
  return (allowed as string[]).includes(level) ? (level as LogLevel) : undefined;
}

const defaultLevel: LogLevel = process.env.NODE_ENV === "production" ? "info" : "debug";
const level: LogLevel = normalizeLogLevel(process.env.LOG_LEVEL) ?? defaultLevel;
const isDevelopment = process.env.NODE_ENV !== "production";

const baseOptions = {
  level,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const ctx = getRequestContext();
    return {
      sessionId: ctx?.sessionId,
    };
  },
};

// 统一 server 侧日志入口；同时把请求上下文（session/app/tab/agent）自动注入到每条日志里，方便排查。
export const logger = pino(
  isDevelopment
    ? {
        ...baseOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:mm:ss",
            ignore: "pid,hostname",
            singleLine: false,
          },
        },
      }
    : baseOptions,
);
