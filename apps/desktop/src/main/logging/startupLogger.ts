/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type Logger = (message: string) => void;

/**
 * 创建启动期日志记录器：将日志追加写入 userData/startup.log。
 * 用于捕获应用最早期的异常/启动信息（此时 console 可能还不可用或不方便查看）。
 */
export function createStartupLogger(): { log: Logger; logPath: string } {
  const logPath = path.join(app.getPath('userData'), 'startup.log');

  try {
    fs.writeFileSync(logPath, '--- Startup ---\n');
  } catch {
    // ignore
  }

  /**
   * 日志写入函数：带 ISO 时间戳、追加写入；任何写入失败都吞掉，避免影响启动流程。
   */
  const log: Logger = (message) => {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch {
      // ignore
    }
  };

  return { log, logPath };
}

/**
 * 注册 Node 进程级别错误监听，并把未捕获异常/未处理 Promise 拒绝写入启动日志。
 */
export function registerProcessErrorLogging(log: Logger) {
  process.on('uncaughtException', (error) => {
    log(`UNCAUGHT EXCEPTION: ${error.stack || error.message}`);
  });

  process.on('unhandledRejection', (reason) => {
    log(`UNHANDLED REJECTION: ${String(reason)}`);
  });
}
