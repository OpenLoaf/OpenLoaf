/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import dns from "node:dns";
import "dotenv/config";
import { fixServerPath } from "@/common/fixServerPath";

// 强制 DNS 解析优先返回 IPv4 地址。
// Electron 子进程中 IPv6 连接经常超时（Happy Eyeballs 耗尽 connect timeout），
// 导致 SaaS 请求（Cloudflare 双栈域名）因 ConnectTimeoutError 失败。
dns.setDefaultResultOrder("ipv4first");
import { startServer } from "@/bootstrap/startServer";
import { installHttpProxy } from "@/modules/proxy/httpProxy";
import { syncSystemProxySettings } from "@/modules/proxy/systemProxySync";
import { getWorkspaces } from "@openloaf/api/services/workspaceConfig";
import { migrateLegacyServerData } from "@openloaf/config";
import { ensureActiveWorkspaceDefaultAgent } from "@/ai/shared/workspaceAgentInit";

// 修复 PATH：当 server 作为 Electron 子进程运行时，继承的 PATH 可能不完整。
// 从用户 shell（macOS/Linux）或注册表（Windows）读取完整 PATH。
fixServerPath();

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
