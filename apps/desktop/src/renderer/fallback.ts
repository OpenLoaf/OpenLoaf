/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n// 给 Electron Forge 的 webpack 插件用的最小 renderer 入口（仅用于打包/兜底页面）。
import { logger } from "./logger";

logger.info("Fallback renderer entry loaded");
