/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import { expandPathTemplateVars } from "@/ai/tools/toolScope";

/**
 * 解析当前请求上下文下的命令沙箱目录。
 *
 * 返回 CURRENT_CHAT_DIR / CURRENT_BOARD_DIR 对应的绝对路径（若存在）。
 * 这些目录是 AI 的会话私有沙箱——命令行对它们的读写不涉及跨会话数据，
 * 即便含有重定向/分号等 shell 操作符也可以免审批。
 *
 * 注意：CURRENT_PROJECT_ROOT 与 HOME 故意不纳入——前者是用户源码根目录，
 * 后者是整机；对它们的写操作必须继续走审批。
 */
export function resolveCommandSandboxDirs(): string[] {
  const candidates = ["${CURRENT_CHAT_DIR}", "${CURRENT_BOARD_DIR}"];
  const dirs: string[] = [];
  for (const token of candidates) {
    const expanded = expandPathTemplateVars(token);
    // 展开失败会原样返回 token 字符串，跳过。
    if (expanded !== token && expanded.startsWith("/")) {
      dirs.push(path.resolve(expanded));
    }
  }
  return dirs;
}
