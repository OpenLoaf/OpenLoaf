/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport pino from "pino";
import { app } from "electron";

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

const defaultLevel: LogLevel = app.isPackaged ? "info" : "debug";
const level: LogLevel = normalizeLogLevel(process.env.LOG_LEVEL) ?? defaultLevel;

// Electron main 进程统一日志入口；默认开发态 debug、生产态 info，可通过 LOG_LEVEL 覆盖。
export const logger = pino({
  level,
  base: { service: "openloaf-electron", process: "main" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

