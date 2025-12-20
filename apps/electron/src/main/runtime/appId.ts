import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cachedAppId: string | null = null;

/**
 * 获取或创建 Electron runtime 的稳定设备标识：
 * - 持久化在 userData 下，确保重启后不变
 * - 用于 server 侧“精确调度到哪台桌面端”
 */
export function getAppId(): string {
  if (cachedAppId) return cachedAppId;

  const userDataPath = app.getPath("userData");
  // 中文注释：为了不破坏已安装用户的稳定标识，这里兼容旧文件名 electron-client-id。
  const filePath = path.join(userDataPath, "app-id");
  const legacyFilePath = path.join(userDataPath, "electron-client-id");

  try {
    const existing = fs.readFileSync(filePath, "utf-8").trim();
    if (existing) {
      cachedAppId = existing;
      return existing;
    }
  } catch {
    // ignore
  }

  try {
    const legacy = fs.readFileSync(legacyFilePath, "utf-8").trim();
    if (legacy) {
      cachedAppId = legacy;
      return legacy;
    }
  } catch {
    // ignore
  }

  const created = crypto.randomUUID();
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(filePath, `${created}\n`, { encoding: "utf-8", flag: "w" });
  } catch {
    // ignore
  }

  cachedAppId = created;
  return created;
}
