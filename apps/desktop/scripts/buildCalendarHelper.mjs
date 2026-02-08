#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

/**
 * Run a command and throw when it fails.
 */
function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? "unknown"}`);
  }
}

/**
 * Ensure a file exists at the given path.
 */
function assertFileExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
}

/**
 * Best-effort removal for build output directories on Windows.
 */
function removeDirSafe(dirPath) {
  try {
    rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`Warning: failed to remove ${dirPath}. Delete it manually if needed.`);
    console.warn(String(error));
  }
}

/**
 * Build the macOS calendar helper via swiftc.
 */
function buildMacHelper() {
  const sourcePath = join(rootDir, "resources", "calendar", "macos", "CalendarHelper.swift");
  const outputPath = join(rootDir, "resources", "calendar", "macos", "tenas-calendar");

  assertFileExists(sourcePath, "CalendarHelper.swift");
  runCommand("xcrun", [
    "swiftc",
    "-parse-as-library",
    "-framework",
    "Foundation",
    "-framework",
    "EventKit",
    sourcePath,
    "-o",
    outputPath,
  ]);

  chmodSync(outputPath, 0o755);
  console.log(`Built calendar helper: ${outputPath}`);
}

/**
 * Build the Windows calendar helper via dotnet publish.
 */
function buildWindowsHelper() {
  const projectPath = join(rootDir, "resources", "calendar", "windows", "TenasCalendar.csproj");
  const outputDir = join(rootDir, "resources", "calendar", "windows", "publish");
  const outputBinary = join(rootDir, "resources", "calendar", "windows", "tenas-calendar.exe");
  const runtime = process.arch === "arm64" ? "win-arm64" : "win-x64";

  assertFileExists(projectPath, "TenasCalendar.csproj");
  mkdirSync(outputDir, { recursive: true });

  runCommand("dotnet", [
    "publish",
    projectPath,
    "-c",
    "Release",
    "-r",
    runtime,
    "--self-contained",
    "true",
    "/p:PublishSingleFile=true",
    "-o",
    outputDir,
  ]);

  const builtBinary = join(outputDir, "tenas-calendar.exe");
  assertFileExists(builtBinary, "Calendar helper binary");
  // 逻辑：从 publish 输出物中提取单文件可执行程序。
  copyFileSync(builtBinary, outputBinary);
  removeDirSafe(outputDir);
  console.log(`Built calendar helper: ${outputBinary}`);
}

/**
 * Entry point for building the calendar helper.
 */
function main() {
  if (process.platform === "darwin") {
    buildMacHelper();
    return;
  }

  if (process.platform === "win32") {
    buildWindowsHelper();
    return;
  }

  console.log("Skip calendar helper build: macOS/Windows only.");
}

main();
