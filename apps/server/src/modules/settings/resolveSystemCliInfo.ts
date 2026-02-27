/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 2000;

export type SystemCliInfo = {
  platform: "darwin" | "linux" | "win32" | "unknown"; // Host OS platform
  system: {
    name: string; // System name
    version?: string; // System version string
  };
  shell: {
    name: "bash" | "powershell" | "unknown"; // Shell name
    available: boolean; // Whether the shell is detected
    path?: string; // Shell binary path
    version?: string; // Shell version string
  };
};

/** Normalize Node.js platform to supported display values. */
function normalizePlatform(): SystemCliInfo["platform"] {
  const platform = os.platform();
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  return "unknown";
}

/** Execute a CLI command with timeout and capture stdout. */
async function runCommand(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 256,
  });
  return result.stdout.trim();
}

/** Read Linux distribution info from /etc/os-release. */
async function readLinuxOsRelease(): Promise<{ name: string; version?: string }> {
  try {
    const content = await fs.readFile("/etc/os-release", "utf-8");
    const entries: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      // 逻辑：解析 KEY=VALUE，并去掉包裹的引号。
      const key = trimmed.slice(0, index);
      const rawValue = trimmed.slice(index + 1);
      const value = rawValue.replace(/^"/, "").replace(/"$/, "");
      entries[key] = value;
    }
    const name = entries.PRETTY_NAME || entries.NAME || "Linux";
    const version = entries.VERSION_ID || entries.VERSION || undefined;
    return { name, version };
  } catch {
    return { name: "Linux" };
  }
}

/** Resolve system name/version for display. */
async function resolveSystemInfo(
  platform: SystemCliInfo["platform"],
): Promise<SystemCliInfo["system"]> {
  if (platform === "darwin") {
    try {
      const version = await runCommand("sw_vers", ["-productVersion"]);
      return { name: "macOS", version: version || undefined };
    } catch {
      return { name: "macOS" };
    }
  }
  if (platform === "win32") {
    try {
      const version = await runCommand("powershell", [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_OperatingSystem).Version",
      ]);
      return { name: "Windows", version: version || undefined };
    } catch {
      return { name: "Windows" };
    }
  }
  if (platform === "linux") {
    return await readLinuxOsRelease();
  }
  return { name: "未知系统" };
}

/** Resolve system CLI support details for display in settings. */
export async function resolveSystemCliInfo(): Promise<SystemCliInfo> {
  const platform = normalizePlatform();
  const system = await resolveSystemInfo(platform);

  // Windows 使用 PowerShell
  if (platform === "win32") {
    try {
      const path = await runCommand("where", ["powershell"]);
      const version = await runCommand("powershell", [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        "$PSVersionTable.PSVersion.ToString()",
      ]);
      return {
        platform,
        system,
        shell: {
          name: "powershell",
          available: Boolean(path),
          path: path ? path.split(/\r?\n/)[0] : undefined,
          version: version || undefined,
        },
      };
    } catch {
      return { platform, system, shell: { name: "powershell", available: false } };
    }
  }

  // macOS/Linux 使用 bash
  if (platform === "darwin" || platform === "linux") {
    try {
      const path = await runCommand("which", ["bash"]);
      const versionLine = await runCommand("bash", ["--version"]);
      const version = versionLine.split(/\r?\n/)[0];
      return {
        platform,
        system,
        shell: {
          name: "bash",
          available: Boolean(path),
          path: path || undefined,
          version: version || undefined,
        },
      };
    } catch {
      return { platform, system, shell: { name: "bash", available: false } };
    }
  }

  return {
    platform: "unknown",
    system,
    shell: { name: "unknown", available: false },
  };
}
