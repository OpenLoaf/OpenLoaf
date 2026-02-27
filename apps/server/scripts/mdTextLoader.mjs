/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Load markdown files as text modules for dev runtime.
 * @param {string} url - Module URL.
 * @param {object} context - Loader context.
 * @param {Function} defaultLoad - Default loader hook.
 */
export async function load(url, context, defaultLoad) {
  const parsedUrl = new URL(url);
  if (parsedUrl.pathname.endsWith(".md")) {
    // 逻辑：将 .md 当作纯文本导出，避免开发态未知扩展名报错。
    const fileUrl = new URL(parsedUrl);
    fileUrl.search = "";
    fileUrl.hash = "";
    const sourceText = await readFile(fileURLToPath(fileUrl), "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(sourceText)};`,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
