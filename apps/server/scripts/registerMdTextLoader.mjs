/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { register } from "node:module";

/**
 * Register the markdown text loader for dev runtime.
 */
export function registerMdTextLoader() {
  // 逻辑：注册自定义 ESM loader，使 .md 以文本模块加载。
  register(new URL("./mdTextLoader.mjs", import.meta.url));
}

registerMdTextLoader();
