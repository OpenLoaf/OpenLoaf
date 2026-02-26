/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\ndeclare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const LOADING_WINDOW_WEBPACK_ENTRY: string;
declare const LOADING_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

/**
 * 这些常量由 Electron Forge 的 webpack 插件在构建时注入。
 * 这里统一封装成对象，避免其它模块直接依赖全局常量。
 */
export const WEBPACK_ENTRIES = {
  mainWindow: MAIN_WINDOW_WEBPACK_ENTRY,
  mainPreload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
  loadingWindow: LOADING_WINDOW_WEBPACK_ENTRY,
  loadingPreload: LOADING_WINDOW_PRELOAD_WEBPACK_ENTRY,
} as const;
