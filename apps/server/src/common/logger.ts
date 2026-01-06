import pino from "pino";
import { getCurrentAgentFrame, getRequestContext } from "../ai/chat-stream/requestContext";

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

// 统一 server 侧日志入口；同时把请求上下文（session/app/tab/agent）自动注入到每条日志里，方便排查。
export const logger = pino({
  level,
  base: { service: "teatime-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const ctx = getRequestContext();
    const frame = getCurrentAgentFrame();
    return {
      sessionId: ctx?.sessionId,
      clientId: ctx?.clientId,
      tabId: ctx?.tabId,
      agent: frame
        ? { kind: frame.kind, name: frame.name, agentId: frame.agentId, path: frame.path }
        : undefined,
    };
  },
});
