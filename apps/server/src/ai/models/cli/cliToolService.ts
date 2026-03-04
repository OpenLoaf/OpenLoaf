/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execa } from "execa";
import {
  downloadPythonInstaller,
  installPythonOnLinux,
  openPythonInstaller,
  resolveLatestPythonRelease,
  resolvePythonInstallInfo,
} from "@/ai/models/cli/pythonTool";
import { logger } from "@/common/logger";

/** Supported CLI tool ids. */
type CliToolId = "codex" | "claudeCode" | "python";

type CliToolStatus = {
  /** Tool id. */
  id: CliToolId;
  /** Installation flag. */
  installed: boolean;
  /** Installed version. */
  version?: string;
  /** Latest version from npm. */
  latestVersion?: string;
  /** Whether update is available. */
  hasUpdate?: boolean;
  /** Installed binary path. */
  path?: string;
};

/** NPM-managed CLI tool id. */
type NpmCliToolId = Exclude<CliToolId, "python">;

type CliToolDefinition = {
  /** Tool id. */
  id: NpmCliToolId;
  /** Display name. */
  label: string;
  /** CLI command name. */
  command: string;
  /** NPM package for installation. */
  npmPackage: string;
  /** Arguments for version query. */
  versionArgs: string[];
  /** Arguments for update command. */
  updateArgs?: string[];
};

/** Static CLI tool definitions. */
const CLI_TOOL_DEFINITIONS: Record<NpmCliToolId, CliToolDefinition> = {
  codex: {
    id: "codex",
    label: "Codex CLI",
    command: "codex",
    npmPackage: "@openai/codex",
    versionArgs: ["--version"],
  },
  claudeCode: {
    id: "claudeCode",
    label: "Claude Code",
    command: "claude",
    npmPackage: "@anthropic-ai/claude-code",
    versionArgs: ["--version"],
    updateArgs: ["update"],
  },
};

/** Resolve CLI tool definition by id. */
function getCliToolDefinition(id: NpmCliToolId): CliToolDefinition {
  return CLI_TOOL_DEFINITIONS[id];
}

/** Resolve npm command for the current OS. */
function resolveNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/** Check whether error indicates a missing command. */
function isCommandNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; exitCode?: number; stderr?: string };
  // Unix: ENOENT / ERR_NOT_FOUND when binary not in PATH
  if (err.code === "ENOENT" || err.code === "ERR_NOT_FOUND") return true;
  // Windows: exit code 9009 is the canonical "command not found" from cmd.exe
  if (err.exitCode === 9009) return true;
  // Windows: exit code 1 with "is not recognized" (English) or garbled GBK (Chinese locale)
  if (
    err.exitCode === 1 &&
    typeof err.stderr === "string" &&
    (err.stderr.includes("is not recognized") || err.stderr.includes("not found"))
  ) {
    return true;
  }
  return false;
}

/** Extract a version-like value from CLI output. */
function extractVersion(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match?.[0] ?? trimmed;
}

/** Compare two semver-like strings. */
function compareVersions(a: string, b: string): number | null {
  const parse = (raw: string): number[] | null => {
    const core = raw.split("-")[0]?.trim() ?? "";
    if (!core) return null;
    const parts = core.split(".").map((item) => Number(item));
    if (parts.some((item) => Number.isNaN(item))) return null;
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** Run a command and capture stdout. */
async function runCommand(command: string, args: string[]) {
  try {
    const result = await execa(command, args, {
      env: process.env,
      all: true,
    });
    logger.info(
      { command, args, stdout: result.stdout?.slice(0, 200), stderr: result.stderr?.slice(0, 200) },
      "[cli] runCommand ok",
    );
    return {
      ok: true as const,
      stdout: result.stdout,
      stderr: result.stderr,
      all: result.all ?? "",
    };
  } catch (error) {
    const code = (error as any)?.code;
    const msg = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    logger.warn(
      { command, args, code, msg },
      "[cli] runCommand failed",
    );
    return { ok: false as const, error };
  }
}

/** Resolve installed status and version of the CLI tool. */
async function resolveCliToolInstallInfo(definition: CliToolDefinition): Promise<{
  installed: boolean;
  version?: string;
}> {
  const result = await runCommand(definition.command, definition.versionArgs);
  if (!result.ok) {
    if (isCommandNotFound(result.error)) {
      return { installed: false };
    }
    // Command exists but returned an error — try to extract a version from
    // combined output. If no version-like string is found the command is most
    // likely not installed (e.g. Windows "not recognized" in non-English locale).
    const combined = ((result.error as any)?.all ?? (result.error as any)?.stderr ?? "") as string;
    const fallbackVersion = extractVersion(combined);
    if (fallbackVersion) {
      logger.warn(
        { err: result.error, tool: definition.id },
        "[cli] failed to resolve version but found version in output",
      );
      return { installed: true, version: fallbackVersion };
    }
    logger.info(
      { tool: definition.id },
      "[cli] command not found (no version in error output)",
    );
    return { installed: false };
  }
  const output = result.stdout.trim() ? result.stdout : result.stderr ?? "";
  const version = extractVersion(output);
  return version ? { installed: true, version } : { installed: true };
}

/** Resolve latest version from npm. */
async function resolveLatestVersion(definition: CliToolDefinition): Promise<string | null> {
  const npmCmd = resolveNpmCommand();
  const result = await runCommand(npmCmd, ["view", definition.npmPackage, "version"]);
  if (!result.ok) {
    logger.warn(
      { err: result.error, tool: definition.id },
      "[cli] failed to resolve npm version",
    );
    return null;
  }
  const output = result.stdout.trim() ? result.stdout : result.stderr ?? "";
  return extractVersion(output);
}

/** Resolve python tool status. */
async function getPythonToolStatus(): Promise<CliToolStatus> {
  const info = await resolvePythonInstallInfo();
  return { id: "python", ...info };
}

/** Resolve CLI tool status. */
export async function getCliToolStatus(id: CliToolId): Promise<CliToolStatus> {
  if (id === "python") return await getPythonToolStatus();
  const definition = getCliToolDefinition(id);
  const info = await resolveCliToolInstallInfo(definition);
  if (!info.installed) return { id, installed: false };
  return { id, installed: true, version: info.version };
}

/** Resolve CLI tools status list. */
export async function getCliToolsStatus(): Promise<CliToolStatus[]> {
  logger.info(
    { PATH: process.env.PATH?.split(process.platform === "win32" ? ";" : ":") },
    "[cli] getCliToolsStatus — current PATH",
  );
  const ids: CliToolId[] = [
    "python",
    ...(Object.keys(CLI_TOOL_DEFINITIONS) as NpmCliToolId[]),
  ];
  const statuses = await Promise.all(ids.map((id) => getCliToolStatus(id)));
  logger.info({ statuses }, "[cli] getCliToolsStatus — results");
  return statuses;
}

/** Check update for a CLI tool. */
export async function checkCliToolUpdate(id: CliToolId): Promise<CliToolStatus> {
  if (id === "python") {
    const status = await getPythonToolStatus();
    if (!status.installed || !status.version) return status;
    const latest = await resolveLatestPythonRelease();
    const comparison = compareVersions(status.version, latest.version);
    return {
      ...status,
      latestVersion: latest.version,
      hasUpdate: comparison !== null ? comparison < 0 : undefined,
    };
  }
  const definition = getCliToolDefinition(id);
  const status = await getCliToolStatus(id);
  if (!status.installed || !status.version) return status;
  const latestVersion = await resolveLatestVersion(definition);
  if (!latestVersion) return status;
  const comparison = compareVersions(status.version, latestVersion);
  return {
    ...status,
    latestVersion,
    hasUpdate: comparison !== null ? comparison < 0 : undefined,
  };
}

/** Install CLI tool using npm. */
export async function installCliTool(id: CliToolId): Promise<CliToolStatus> {
  if (id === "python") {
    if (process.platform === "linux") {
      await installPythonOnLinux();
    } else {
      const installerPath = await downloadPythonInstaller();
      await openPythonInstaller(installerPath);
    }
    return await getPythonToolStatus();
  }
  const definition = getCliToolDefinition(id);
  const status = await getCliToolStatus(id);
  if (status.installed && definition.updateArgs?.length) {
    // 已安装时优先走 CLI 自带更新命令。
    await execa(definition.command, definition.updateArgs, {
      env: process.env,
    });
    return await getCliToolStatus(id);
  }
  const npmCmd = resolveNpmCommand();
  // 仅允许固定工具安装，避免执行任意命令。
  await execa(npmCmd, ["install", "-g", definition.npmPackage], {
    env: process.env,
  });
  return await getCliToolStatus(id);
}
