/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execa } from "execa";
import { getWorkspaceRootPath } from "@openloaf/api/services/vfsService";
import { logger } from "@/common/logger";

const PYTHON_RELEASES_URL =
  "https://www.python.org/api/v2/downloads/release/?is_published=1&release_type=full";

/** Python release summary. */
type PythonRelease = {
  /** Release name. */
  name: string;
  /** Release date. */
  release_date: string;
  /** Whether release is pre-release. */
  pre_release: boolean;
  /** Release resource uri. */
  resource_uri: string;
};

/** Python release file entry. */
type PythonReleaseFile = {
  /** File display name. */
  name: string;
  /** File download url. */
  url: string;
  /** SHA256 checksum. */
  sha256_sum: string;
};

/** Resolve Python cache root directory. */
function resolvePythonCacheRoot(): string {
  const workspaceRoot = getWorkspaceRootPath();
  return path.join(workspaceRoot, ".openloaf-cache", "python");
}

/** Resolve release id from resource uri. */
function resolveReleaseId(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

/** Parse version string from release name. */
function parsePythonVersion(name: string): string | null {
  const match = name.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

/** Fetch JSON payload from python.org API. */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Python API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Resolve latest stable Python release. */
export async function resolveLatestPythonRelease(): Promise<{ version: string; id: string }> {
  const releases = await fetchJson<PythonRelease[]>(PYTHON_RELEASES_URL);
  // 逻辑：过滤预发布版本，取最高的 3.x 版本。
  const stable = releases.filter((item) => !item.pre_release);
  const withVersion = stable
    .map((item) => ({
      version: parsePythonVersion(item.name),
      id: resolveReleaseId(item.resource_uri),
    }))
    .filter((item): item is { version: string; id: string } => Boolean(item.version));
  withVersion.sort((a, b) => {
    const left = a.version.split(".").map(Number);
    const right = b.version.split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      const diff = (left[i] ?? 0) - (right[i] ?? 0);
      if (diff !== 0) return diff > 0 ? -1 : 1;
    }
    return 0;
  });
  const latest = withVersion[0];
  if (!latest) throw new Error("Python release not found");
  return latest;
}

/** Resolve release files for a Python release id. */
async function resolveReleaseFiles(releaseId: string): Promise<PythonReleaseFile[]> {
  return await fetchJson<PythonReleaseFile[]>(
    `https://www.python.org/api/v2/downloads/release_file/?release=${releaseId}`,
  );
}

/** Resolve installer file for current platform. */
export async function resolvePythonInstallerFile(): Promise<{
  version: string;
  url: string;
  sha256: string;
}> {
  const latest = await resolveLatestPythonRelease();
  const files = await resolveReleaseFiles(latest.id);
  // 逻辑：按平台/架构匹配官方安装包。
  if (process.platform === "darwin") {
    const match = files.find((file) => {
      const name = file.name.toLowerCase();
      return name.includes("macos") && name.includes("installer");
    });
    if (!match) throw new Error("macOS installer not found");
    return { version: latest.version, url: match.url, sha256: match.sha256_sum };
  }
  if (process.platform === "win32") {
    const arch = process.arch;
    const match = files.find((file) => {
      const name = file.name.toLowerCase();
      if (!name.includes("windows") || !name.includes("installer")) return false;
      if (arch === "arm64") return name.includes("arm64");
      if (arch === "ia32") return name.includes("32-bit");
      return name.includes("64-bit");
    });
    if (!match) throw new Error("Windows installer not found");
    return { version: latest.version, url: match.url, sha256: match.sha256_sum };
  }
  throw new Error("Installer download only supported on macOS/Windows");
}

/** Download installer to cache and verify checksum. */
export async function downloadPythonInstaller(): Promise<string> {
  const { version, url, sha256 } = await resolvePythonInstallerFile();
  const cacheRoot = resolvePythonCacheRoot();
  const filename = path.basename(new URL(url).pathname);
  const targetDir = path.join(cacheRoot, version);
  const targetPath = path.join(targetDir, filename);
  await mkdir(targetDir, { recursive: true });
  if (!existsSync(targetPath)) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status}`);
    }
    const stream = Readable.fromWeb(response.body);
    await pipeline(stream, createWriteStream(targetPath));
  }
  const buffer = await readFile(targetPath);
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (sha256 && digest !== sha256) {
    throw new Error("Installer checksum mismatch");
  }
  return targetPath;
}

/** Open the installer file in system installer. */
export async function openPythonInstaller(filePath: string): Promise<void> {
  // 逻辑：macOS/Windows 使用系统安装器打开。
  if (process.platform === "darwin") {
    await execa("open", [filePath]);
    return;
  }
  if (process.platform === "win32") {
    if (!existsSync(filePath)) throw new Error("Installer file not found");
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".exe" && ext !== ".msi") {
      throw new Error(`Unsupported installer extension: ${ext}`);
    }
    // Use rundll32 to open via ShellExecute, avoiding cmd.exe shell entirely
    await execa("rundll32.exe", ["url.dll,FileProtocolHandler", filePath], {
      windowsHide: true,
    });
    return;
  }
  throw new Error("Installer open only supported on macOS/Windows");
}

/** Resolve installed Python info. */
export async function resolvePythonInstallInfo(): Promise<{
  installed: boolean;
  version?: string;
  path?: string;
}> {
  const candidates = ["python3", "python"];
  logger.info(
    { candidates, platform: process.platform, PATH: process.env.PATH?.slice(0, 500) },
    "[cli] resolvePythonInstallInfo — start",
  );
  for (const command of candidates) {
    try {
      let resolvedPath: string | undefined;

      if (process.platform === "darwin") {
        // macOS: 用 which -a 找所有匹配路径，优先选非 /usr/bin 的（避免 Apple stub）。
        const whichResult = await execa("which", ["-a", command], { all: true, reject: false });
        const allPaths = (whichResult.stdout || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        logger.info({ command, allPaths, exitCode: whichResult.exitCode }, "[cli] python which -a result");

        if (allPaths.length === 0) {
          logger.info({ command }, "[cli] python not found in PATH");
          continue;
        }

        // 优先选非 /usr/bin 的路径（避免可能的 Apple stub）。
        const preferred = allPaths.find((p) => !p.startsWith("/usr/bin/"));
        if (preferred) {
          resolvedPath = preferred;
        } else {
          // 只有 /usr/bin/python3，验证它是否是真 Python（非 stub）。
          // Apple stub 不支持 --version，真 Python 会正常输出。
          const testResult = await execa(allPaths[0]!, ["--version"], {
            all: true,
            reject: false,
            timeout: 3000,
          });
          if (testResult.exitCode !== 0) {
            logger.info({ command, path: allPaths[0] }, "[cli] skipping macOS python stub");
            continue;
          }
          resolvedPath = allPaths[0];
        }
      }

      // 获取版本号。
      const versionTarget = resolvedPath ?? command;
      const result = await execa(versionTarget, ["--version"], { all: true });
      const output = (result.stdout || result.stderr || result.all || "").trim();
      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch?.[1];

      // 解析实际路径。
      if (!resolvedPath) {
        const pathResult =
          process.platform === "win32"
            ? await execa("where", [command], { all: true })
            : await execa("which", [command], { all: true });
        resolvedPath = (pathResult.stdout || pathResult.stderr || "")
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean);
      }

      logger.info({ command, version, path: resolvedPath }, "[cli] python found");
      return {
        installed: true,
        version: version ?? undefined,
        path: resolvedPath ?? undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
      const code = (error as any)?.code;
      logger.info({ command, code, msg }, "[cli] python command not found");
    }
  }
  logger.info("[cli] python not found on any candidate");
  return { installed: false };
}

/** Install Python on Linux via package manager. */
export async function installPythonOnLinux(): Promise<void> {
  if (process.platform !== "linux") return;
  // 逻辑：按顺序尝试 apt/dnf/yum/pacman/zypper。
  const candidates = [
    { tool: "apt-get", args: ["install", "-y", "python3"] },
    { tool: "dnf", args: ["install", "-y", "python3"] },
    { tool: "yum", args: ["install", "-y", "python3"] },
    { tool: "pacman", args: ["-Sy", "--noconfirm", "python"] },
    { tool: "zypper", args: ["--non-interactive", "install", "python3"] },
  ];
  for (const candidate of candidates) {
    try {
      const hasSudo = await execa("which", ["sudo"], { reject: false });
      const useSudo = hasSudo.exitCode === 0;
      const cmd = useSudo ? "sudo" : candidate.tool;
      const args = useSudo ? ["-n", candidate.tool, ...candidate.args] : candidate.args;
      await execa(cmd, args, { stdio: "inherit" });
      return;
    } catch (error) {
      logger.warn({ err: error, tool: candidate.tool }, "[cli] linux install failed");
    }
  }
  throw new Error("未找到可用的 Linux 包管理器或安装失败");
}
