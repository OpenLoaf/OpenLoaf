/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import "dotenv/config";
import { startServer } from "@/bootstrap/startServer";
import { installHttpProxy } from "@/modules/proxy/httpProxy";
import { syncSystemProxySettings } from "@/modules/proxy/systemProxySync";
import { getWorkspaces } from "@openloaf/api/services/workspaceConfig";
import { migrateLegacyServerData } from "@openloaf/config";
import { ensureActiveWorkspaceDefaultAgent } from "@/ai/shared/workspaceAgentInit";

installHttpProxy();
void syncSystemProxySettings();

// 启动时确保配置文件存在，避免运行中首次访问 workspace 时才触发创建。
migrateLegacyServerData();
getWorkspaces();

// 启动时确保活跃 workspace 有默认 agent 文件。
ensureActiveWorkspaceDefaultAgent();

const { app } = startServer();
// 暂停启动时自动总结调度，避免无 workspace/project 上下文触发总结流程。
// void initSummaryScheduler();

// 针对 ELECTRON_RUN_AS_NODE 启动的场景，父进程挂了自动退出 (防止成为僵尸进程)
if (process.env.ELECTRON_RUN_AS_NODE) {
  process.on("disconnect", () => process.exit(0));
  process.stdin.on("end", () => process.exit(0));
}

export default app;
