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
import { mkdirSync } from "node:fs";
import { EventSource as EventSourcePolyfill } from "eventsource";
import "dotenv/config";

// Node.js 没有原生 EventSource，SDK v0.1.29 的 v3TaskEvents 需要它。
if (typeof globalThis.EventSource === "undefined") {
  (globalThis as any).EventSource = EventSourcePolyfill;
}
import { fixServerPath } from "@/common/fixServerPath";
import { initFfmpegPaths } from "@/common/ffmpegPaths";

// 强制 DNS 解析优先返回 IPv4 地址。
// Electron 子进程中 IPv6 连接经常超时（Happy Eyeballs 耗尽 connect timeout），
// 导致 SaaS 请求（Cloudflare 双栈域名）因 ConnectTimeoutError 失败。
dns.setDefaultResultOrder("ipv4first");
import { startServer } from "@/bootstrap/startServer";
import { flushBoardDocuments } from "@/modules/board/boardCollabWebSocket";
import { installHttpProxy } from "@/modules/proxy/httpProxy";
import { syncSystemProxySettings } from "@/modules/proxy/systemProxySync";
import { getAppConfig, getDefaultTempStoragePath, setResolvedTempStorageDir } from "@openloaf/api/services/appConfigService";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { migrateLegacyServerData } from "@openloaf/config";
import { ensureDefaultAgentCleanup } from "@/ai/shared/agentCleanup";
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

// 启动时确保配置文件存在，避免运行中首次访问配置时才触发创建。
migrateLegacyServerData();
getAppConfig();

// 读取用户配置的临时存储路径并同步到 packages/api 层。
const _bootConf = readBasicConf();
setResolvedTempStorageDir(_bootConf.appTempStorageDir || null);

// 确保临时存储目录存在（按平台创建默认路径）。
mkdirSync(getDefaultTempStoragePath(), { recursive: true });

// 启动时清理旧版 agent 文件夹。
ensureDefaultAgentCleanup();

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

// Cloud 动态 skill：启动后非阻塞地拉一次 capabilitiesOverview，把可用 category
// 注入到 cloud-media / cloud-text skill 内容里，然后每 30 min 后台刷新。
// 失败静默 — skill 会保留上一轮快照或初始的 "probing" 占位内容。
void (async () => {
  try {
    const mod = await import("@/ai/builtin-skills/cloud-skills");
    mod.startCloudSkillRefreshLoop();
  } catch (err) {
    console.warn(
      "[cloud-skills] bootstrap skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }
})();

// Cloud tools 动态注册：启动后非阻塞地拉一次 toolsCapabilities，把 tools category
// 的扁平 features 注册为本地 deferred tool（webSearch / webSearchImage 等），
// 并生成一段 XML block 注入到 master system prompt。每 30 min 刷新一次。
void (async () => {
  try {
    const mod = await import("@/ai/tools/cloud/cloudToolsDynamic");
    mod.startCloudToolsPreloadLoop();
  } catch (err) {
    console.warn(
      "[cloud-tools] bootstrap skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }
})();

// 响应 SIGINT/SIGTERM，退出前先刷盘画布文档，防止热重载丢失未持久化的 Yjs 数据。
async function gracefulShutdown() {
  // Shutdown MCP connections (kills stdio child processes)
  const { mcpClientManager } = await import("@/ai/services/mcpClientManager");
  await mcpClientManager.shutdownAll();
  await flushBoardDocuments();
  process.exit(0);
}
process.on("SIGINT", () => void gracefulShutdown());
process.on("SIGTERM", () => void gracefulShutdown());

// 通过 IPC channel 检测父进程退出（Electron desktop 场景）：
// 当父进程崩溃或退出时 disconnect 会触发，防止成为僵尸进程。
// 需要 spawn 时 stdio 包含 'ipc'（如 ['ignore', 'pipe', 'pipe', 'ipc']）。
if (typeof process.send === "function") {
  process.on("disconnect", () => void gracefulShutdown());
}

export default app;
