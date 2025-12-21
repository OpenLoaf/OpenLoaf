import pino from "pino";

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
const level: LogLevel = normalizeLogLevel((process.env as any)?.LOG_LEVEL) ?? defaultLevel;

// 中文注释：renderer 侧仅用于最小入口日志；输出到浏览器控制台（pino browser 模式）。
export const logger = pino({
  level,
  base: { service: "teatime-electron", process: "renderer" },
  browser: { asObject: true },
});

