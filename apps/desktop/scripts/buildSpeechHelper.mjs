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
 * Build the macOS speech helper via swiftc.
 */
function buildMacHelper() {
  const sourcePath = join(rootDir, "resources", "speech", "macos", "SpeechRecognizer.swift");
  const outputPath = join(rootDir, "resources", "speech", "macos", "openloaf-speech");

  assertFileExists(sourcePath, "SpeechRecognizer.swift");
  runCommand("xcrun", [
    "swiftc",
    "-framework",
    "Foundation",
    "-framework",
    "Speech",
    "-framework",
    "AVFoundation",
    sourcePath,
    "-o",
    outputPath,
  ]);

  chmodSync(outputPath, 0o755);
  console.log(`Built speech helper: ${outputPath}`);
}

/**
 * Build the Windows speech helper via dotnet publish.
 */
function buildWindowsHelper() {
  const projectPath = join(rootDir, "resources", "speech", "windows", "OpenLoafSpeech.csproj");
  const outputDir = join(rootDir, "resources", "speech", "windows", "publish");
  const outputBinary = join(rootDir, "resources", "speech", "windows", "openloaf-speech.exe");
  const runtime = process.arch === "arm64" ? "win-arm64" : "win-x64";

  assertFileExists(projectPath, "OpenLoafSpeech.csproj");
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

  const builtBinary = join(outputDir, "openloaf-speech.exe");
  assertFileExists(builtBinary, "Speech helper binary");
  // 从 publish 输出物中提取单文件可执行程序。
  copyFileSync(builtBinary, outputBinary);
  removeDirSafe(outputDir);
  console.log(`Built speech helper: ${outputBinary}`);
}

/**
 * Entry point for building the speech helper.
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

  console.log("Skip speech helper build: macOS/Windows only.");
}

main();
\n\n/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n