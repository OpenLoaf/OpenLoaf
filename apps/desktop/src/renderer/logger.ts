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

// renderer 环境可能没有 process，避免直接引用导致报错。
const nodeEnv =
  typeof process === "undefined" ? undefined : (process.env as any)?.NODE_ENV;
const defaultLevel: LogLevel = nodeEnv === "production" ? "info" : "debug";
const level: LogLevel = normalizeLogLevel(
  typeof process === "undefined" ? undefined : (process.env as any)?.LOG_LEVEL,
) ?? defaultLevel;

// renderer 侧仅用于最小入口日志；输出到浏览器控制台（pino browser 模式）。
export const logger = pino({
  level,
  base: { service: "openloaf-electron", process: "renderer" },
  browser: { asObject: true },
});
