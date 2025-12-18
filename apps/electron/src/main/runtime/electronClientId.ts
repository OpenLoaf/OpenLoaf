import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cachedElectronClientId: string | null = null;

/**
 * 获取或创建 Electron runtime 的稳定设备标识：
 * - 持久化在 userData 下，确保重启后不变
 * - 用于 server 侧“精确调度到哪台桌面端”
 */
export function getElectronClientId(): string {
  if (cachedElectronClientId) return cachedElectronClientId;

  const userDataPath = app.getPath("userData");
  const filePath = path.join(userDataPath, "electron-client-id");

  try {
    const existing = fs.readFileSync(filePath, "utf-8").trim();
    if (existing) {
      cachedElectronClientId = existing;
      return existing;
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

  cachedElectronClientId = created;
  return created;
}

