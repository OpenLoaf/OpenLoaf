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
import { initFfmpegPaths } from "@/common/ffmpegPaths";

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
import { initDatabase } from "@openloaf/db";
import { runPendingMigrations } from "@openloaf/db/migrationRunner";
import { embeddedMigrations } from "@openloaf/db/migrations.generated";

// 修复 PATH：当 server 作为 Electron 子进程运行时，继承的 PATH 可能不完整。
// 从用户 shell（macOS/Linux）或注册表（Windows）读取完整 PATH。
fixServerPath();

// 初始化 ffmpeg/ffprobe 路径：优先使用打包的静态二进制，回退到系统 PATH。
// 必须在 fixServerPath() 之后调用，确保系统 PATH 已修复。
initFfmpegPaths();

installHttpProxy();
void syncSystemProxySettings();

// 启动时确保配置文件存在，避免运行中首次访问 workspace 时才触发创建。
migrateLegacyServerData();
getWorkspaces();

// 启动时确保活跃 workspace 有默认 agent 文件。
ensureActiveWorkspaceDefaultAgent();

// 数据库迁移：检查并应用所有待执行的 schema 迁移。
// 必须在 initDatabase() 之前完成，确保表结构就绪。
const { applied } = await runPendingMigrations(
  (await import("@openloaf/db")).default,
  embeddedMigrations,
);
if (applied.length > 0) {
  console.log(`[db] Applied ${applied.length} migration(s): ${applied.join(", ")}`);
}

// 初始化 SQLite WAL 模式和 busy_timeout，必须在 startServer 之前完成，
// 避免并发请求时触发 SQLITE_BUSY。
await initDatabase();

const { app } = startServer();
// 暂停启动时自动总结调度，避免无 workspace/project 上下文触发总结流程。
// void initSummaryScheduler();

// 响应 SIGINT/SIGTERM，确保 turbo/pnpm/Electron 发送终止信号时 server 能正确退出
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// 通过 IPC channel 检测父进程退出（Electron desktop 场景）：
// 当父进程崩溃或退出时 disconnect 会触发，防止成为僵尸进程。
// 需要 spawn 时 stdio 包含 'ipc'（如 ['ignore', 'pipe', 'pipe', 'ipc']）。
if (typeof process.send === "function") {
  process.on("disconnect", () => process.exit(0));
}

export default app;
