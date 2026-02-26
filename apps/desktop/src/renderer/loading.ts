/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n// loading 页面对应的最小 renderer 入口（主要用于打包占位与调试）。
import { logger } from "./logger";
import logoUrl from "./head.png";

logger.info("Loading screen active");

// Initialize the loading logo once the DOM is ready.
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.getElementById("loading-logo") as HTMLImageElement | null;
  if (!logo) {
    logger.warn("Loading logo element missing");
    return;
  }

  // 使用打包后的资源路径，避免开发态出现 404。
  logo.src = logoUrl;
});
