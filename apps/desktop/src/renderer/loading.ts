/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// loading 页面对应的最小 renderer 入口（主要用于打包占位与调试）。
import { logger } from "./logger";
import logoUrl from "./head.png";

/** 构建时注入的版本标识，默认 'community'。 */
const EDITION = process.env.OPENLOAF_EDITION || 'community';
const APP_NAME = EDITION === 'enterprise' ? 'OpenLoaf Enterprise' : 'OpenLoaf';

logger.info("Loading screen active");

// Initialize the loading logo and edition branding once the DOM is ready.
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.getElementById("loading-logo") as HTMLImageElement | null;
  if (!logo) {
    logger.warn("Loading logo element missing");
    return;
  }

  // 使用打包后的资源路径，避免开发态出现 404。
  logo.src = logoUrl;

  // 根据 edition 更新页面标题和加载文本。
  const titleEl = document.getElementById("loading-title");
  if (titleEl) titleEl.textContent = `${APP_NAME} - Loading...`;

  const textEl = document.getElementById("loading-text");
  if (textEl) textEl.textContent = `${APP_NAME}正在启动中`;
});
