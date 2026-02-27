/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Environment variable key for overriding server env path. */
const SERVER_ENV_PATH_KEY = "OPENLOAF_SERVER_ENV_PATH";

/** Resolve repository root path from current file location. */
function resolveRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../../..");
}

/** Resolve default server .env path. */
function resolveDefaultEnvPath(): string {
  const repoRoot = resolveRepoRoot();
  return path.join(repoRoot, "apps/server/.env");
}

/** Escape text for use in RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read env content for parsing. */
function readEnvContent(envPath: string): string {
  if (!existsSync(envPath)) return "";
  return readFileSync(envPath, "utf-8");
}

/** Update or append env entry in content. */
function upsertEnvContent(content: string, envKey: string, value: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.length ? normalized.split("\n") : [];
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(envKey)}=`);
  let found = false;
  const updated = lines.map((line) => {
    if (keyPattern.test(line)) {
      found = true;
      return `${envKey}=${value}`;
    }
    return line;
  });
  if (!found) updated.push(`${envKey}=${value}`);
  const next = updated.join("\n");
  return next.endsWith("\n") ? next : `${next}\n`;
}

/** Resolve server .env path for email credentials. */
export function getEmailEnvPath(): string {
  const configured = process.env[SERVER_ENV_PATH_KEY]?.trim();
  if (configured) return configured;
  return resolveDefaultEnvPath();
}

/** Read entire .env file content. */
export function readEmailEnvFile(): string {
  const envPath = getEmailEnvPath();
  return readEnvContent(envPath);
}

/** Get env value for a specific key. */
export function getEmailEnvValue(envKey: string): string | undefined {
  const content = readEmailEnvFile();
  if (!content) return undefined;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(envKey)}=(.*)$`);
  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(keyPattern);
    if (match) return match[1] ?? "";
  }
  return undefined;
}

/** Remove env key from .env file. */
export function removeEmailEnvValue(envKey: string): void {
  const envPath = getEmailEnvPath();
  const content = readEnvContent(envPath);
  if (!content) return;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(envKey)}=.*$`);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const filtered = lines.filter((line) => !keyPattern.test(line));
  const next = filtered.join("\n");
  writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`, "utf-8");
  delete process.env[envKey];
}

/** Set env value for a specific key, ensuring file exists. */
export function setEmailEnvValue(envKey: string, value: string): void {
  const envPath = getEmailEnvPath();
  const dirPath = path.dirname(envPath);
  // 逻辑：确保目录存在，避免写入失败。
  mkdirSync(dirPath, { recursive: true });
  const current = readEnvContent(envPath);
  const next = upsertEnvContent(current, envKey, value);
  // 逻辑：直接写入 .env，用于持久化邮箱密码。
  writeFileSync(envPath, next, "utf-8");
  process.env[envKey] = value;
}
