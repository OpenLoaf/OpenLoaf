/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 修复 GUI 应用启动时 PATH 环境变量不完整的问题。
 *
 * 问题背景：
 * - macOS/Linux GUI 应用从 Finder/Dock/桌面启动时，不会加载用户的 shell 配置文件
 *   （.zshrc、.bashrc、.bash_profile 等），导致 PATH 只包含系统默认路径
 * - Windows 通常不受影响，因为 GUI 应用能正确继承系统环境变量
 *
 * 该模块通过以下方式修复：
 * 1. macOS/Linux：启动一个 login shell 获取完整的 PATH
 * 2. Windows：追加常见的用户级目录（npm global、python 等）
 */

/** 分隔符：Windows 用分号，其他平台用冒号。 */
const PATH_DELIMITER = process.platform === 'win32' ? ';' : ':';

/** 获取当前 PATH 的目录集合。 */
function getCurrentPathSet(): Set<string> {
  const currentPath = process.env.PATH ?? '';
  return new Set(currentPath.split(PATH_DELIMITER).filter(Boolean));
}

/** 将新目录追加到 PATH（去重）。 */
function appendToPath(newPaths: string[]): void {
  const currentSet = getCurrentPathSet();
  const toAdd: string[] = [];
  for (const p of newPaths) {
    if (p && !currentSet.has(p) && existsSync(p)) {
      toAdd.push(p);
    }
  }
  if (toAdd.length === 0) return;
  const currentPath = process.env.PATH ?? '';
  process.env.PATH = currentPath ? `${currentPath}${PATH_DELIMITER}${toAdd.join(PATH_DELIMITER)}` : toAdd.join(PATH_DELIMITER);
}

/** 从 login shell 获取完整 PATH（macOS/Linux）。 */
function getShellPath(): string | null {
  const shell = process.env.SHELL ?? '/bin/bash';
  try {
    // 使用 login shell（-l）确保加载用户配置文件。
    // 使用 -i 确保加载交互式配置（某些配置只在交互模式下生效）。
    // 超时 5 秒，避免配置文件中有阻塞操作导致卡住。
    const result = execSync(`${shell} -ilc 'echo -n "$PATH"'`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        // 避免某些 shell 配置输出额外信息。
        __CF_USER_TEXT_ENCODING: process.env.__CF_USER_TEXT_ENCODING,
      },
    });
    return result.trim() || null;
  } catch {
    // 如果 login shell 执行失败，尝试非交互式 login shell。
    try {
      const result = execSync(`${shell} -lc 'echo -n "$PATH"'`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return result.trim() || null;
    } catch {
      return null;
    }
  }
}

/** 获取 macOS/Linux 常见的用户级 bin 目录。 */
function getUnixUserPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  // Homebrew 路径（macOS）。
  if (process.platform === 'darwin') {
    // Apple Silicon。
    paths.push('/opt/homebrew/bin');
    paths.push('/opt/homebrew/sbin');
    // Intel Mac。
    paths.push('/usr/local/bin');
    paths.push('/usr/local/sbin');
  }

  // Linux 常见路径。
  if (process.platform === 'linux') {
    paths.push('/usr/local/bin');
    paths.push('/usr/local/sbin');
    // Linuxbrew。
    paths.push('/home/linuxbrew/.linuxbrew/bin');
    paths.push(`${home}/.linuxbrew/bin`);
  }

  // 用户级目录（两个平台通用）。
  paths.push(`${home}/.local/bin`);

  // npm 全局安装目录。
  paths.push(`${home}/.npm-global/bin`);
  paths.push(`${home}/.npm/bin`);

  // nvm / fnm 管理的 Node.js。
  paths.push(`${home}/.nvm/current/bin`);
  paths.push(`${home}/.fnm/aliases/default/bin`);

  // pnpm 全局目录。
  paths.push(`${home}/.pnpm-global/bin`);
  paths.push(`${home}/Library/pnpm`);

  // yarn 全局目录。
  paths.push(`${home}/.yarn/bin`);
  paths.push(`${home}/.config/yarn/global/node_modules/.bin`);

  // cargo (Rust)。
  paths.push(`${home}/.cargo/bin`);

  // go。
  paths.push(`${home}/go/bin`);
  paths.push('/usr/local/go/bin');

  // pyenv。
  paths.push(`${home}/.pyenv/bin`);
  paths.push(`${home}/.pyenv/shims`);

  // pipx。
  paths.push(`${home}/.local/pipx/bin`);

  // rbenv (Ruby)。
  paths.push(`${home}/.rbenv/bin`);
  paths.push(`${home}/.rbenv/shims`);

  // sdkman (Java)。
  paths.push(`${home}/.sdkman/candidates/java/current/bin`);

  return paths;
}

/** 获取 Windows 常见的用户级 bin 目录。 */
function getWindowsUserPaths(): string[] {
  const home = os.homedir();
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  const paths: string[] = [];

  // npm 全局安装目录。
  paths.push(path.join(appData, 'npm'));

  // pnpm 全局目录。
  paths.push(path.join(localAppData, 'pnpm'));

  // yarn 全局目录。
  paths.push(path.join(localAppData, 'Yarn', 'bin'));

  // Python（用户安装）。
  paths.push(path.join(localAppData, 'Programs', 'Python', 'Python312', 'Scripts'));
  paths.push(path.join(localAppData, 'Programs', 'Python', 'Python311', 'Scripts'));
  paths.push(path.join(localAppData, 'Programs', 'Python', 'Python310', 'Scripts'));
  paths.push(path.join(localAppData, 'Programs', 'Python', 'Python312'));
  paths.push(path.join(localAppData, 'Programs', 'Python', 'Python311'));
  paths.push(path.join(localAppData, 'Programs', 'Python', 'Python310'));

  // scoop。
  paths.push(path.join(home, 'scoop', 'shims'));

  // cargo (Rust)。
  paths.push(path.join(home, '.cargo', 'bin'));

  // go。
  paths.push(path.join(home, 'go', 'bin'));

  return paths;
}

/** 尝试从 npmrc 读取 prefix 配置。 */
function getNpmGlobalPrefix(): string | null {
  const home = os.homedir();
  const npmrcPaths = [
    path.join(home, '.npmrc'),
    '/etc/npmrc',
  ];

  for (const npmrcPath of npmrcPaths) {
    try {
      if (!existsSync(npmrcPath)) continue;
      const content = readFileSync(npmrcPath, 'utf8');
      const match = content.match(/^\s*prefix\s*=\s*(.+?)\s*$/m);
      if (match?.[1]) {
        const prefix = match[1].replace(/^~/, home);
        const binPath = path.join(prefix, 'bin');
        if (existsSync(binPath)) return binPath;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 修复 PATH 环境变量。
 * 应在 Electron 主进程启动早期调用（app.whenReady 之前）。
 *
 * @returns 修复后的 PATH 值，如果没有变化则返回原值。
 */
export function fixPath(): string {
  const originalPath = process.env.PATH ?? '';

  // Windows：追加常见用户目录。
  if (process.platform === 'win32') {
    appendToPath(getWindowsUserPaths());
    return process.env.PATH ?? originalPath;
  }

  // macOS/Linux：先尝试从 login shell 获取完整 PATH。
  const shellPath = getShellPath();
  if (shellPath && shellPath !== originalPath) {
    // 将 shell PATH 中的目录追加到当前 PATH。
    const shellPaths = shellPath.split(PATH_DELIMITER).filter(Boolean);
    appendToPath(shellPaths);
  }

  // 无论 shell 方式是否成功，都追加常见用户目录作为后备。
  appendToPath(getUnixUserPaths());

  // 尝试从 npmrc 读取自定义的 npm prefix。
  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix) {
    appendToPath([npmPrefix]);
  }

  return process.env.PATH ?? originalPath;
}

/**
 * 获取修复后的 PATH 值（不修改 process.env）。
 * 用于诊断目的。
 */
export function getFixedPath(): string {
  const originalPath = process.env.PATH;
  const fixed = fixPath();
  process.env.PATH = originalPath;
  return fixed;
}
