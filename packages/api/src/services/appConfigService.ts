/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { getOpenLoafDataRootDir, getOpenLoafRootDir } from "@openloaf/config";
import type { AppConfig } from "../types/appConfig";
import { appConfigSchema } from "../types/appConfig";

/** Schema for config.json (global app config). */
const ConfigFileSchema = z.object({
  /** Global project map for backward compat. */
  projects: z.record(z.string(), z.string()).optional(),
  /** Skill folder names to ignore. */
  ignoreSkills: z.array(z.string()).optional(),
});

type ConfigFile = z.infer<typeof ConfigFileSchema>;

/** Cache the last valid config to avoid flapping. */
let cachedConfig: ConfigFile | null = null;

/** Resolve config directory. */
function getConfigDir(): string {
  return getOpenLoafRootDir();
}

/** Resolve config.json path. */
function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

/** Build default root uri. */
function resolveDefaultRootUri(): string {
  const rootPath = getDefaultProjectStoragePath();
  mkdirSync(rootPath, { recursive: true });
  return pathToFileURL(rootPath).href;
}

/** Ensure config.json exists with defaults. */
function ensureDefaultConfig(): ConfigFile {
  const payload: ConfigFile = { projects: {}, ignoreSkills: [] };
  writeConfigFile(payload);
  return payload;
}

/** Read config.json payload safely. */
function readConfigFile(): ConfigFile {
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    return ensureDefaultConfig();
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    const parsed = ConfigFileSchema.parse(raw);
    cachedConfig = parsed;
    return parsed;
  } catch {
    if (cachedConfig) return cachedConfig;
    return ensureDefaultConfig();
  }
}

/** Write config.json payload atomically. */
function writeConfigFile(payload: ConfigFile): void {
  const filePath = getConfigPath();
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
  cachedConfig = payload;
}

/** Return global app config. */
export function getAppConfig(): AppConfig {
  const config = readConfigFile();
  return appConfigSchema.parse(config);
}

/** Overwrite global app config. */
export function setAppConfig(config: AppConfig): void {
  writeConfigFile(config);
}

/** Get the global root path (always ~/.openloaf/). */
export function getGlobalRootPath(): string {
  const rootPath = getOpenLoafRootDir();
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

/** Get the default project storage root path (~/OpenLoafData/projects). */
export function getDefaultProjectStoragePath(): string {
  const rootPath = path.join(getOpenLoafDataRootDir(), "projects");
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

/** Get the default project storage root URI (file://...). */
export function getDefaultProjectStorageRootUri(): string {
  return resolveDefaultRootUri();
}

/**
 * Default temp storage path: ~/OpenLoafData on all platforms.
 *
 * Historically macOS used ~/Documents/OpenLoaf/Temp, but macOS 15+ enforces
 * App Management via `com.apple.provenance` xattrs — cross-process reads of
 * user files under ~/Documents get EPERM even with correct POSIX perms.
 * Placing data at ~/OpenLoafData sidesteps both TCC and App Management.
 */
export function getDefaultTempStoragePath(): string {
  return getOpenLoafDataRootDir();
}

/** Runtime override for the resolved temp storage directory. */
let tempStorageDirOverride: string | null = null;

/** Set the resolved temp storage dir (called by server on startup / settings update). */
export function setResolvedTempStorageDir(dir: string | null): void {
  tempStorageDirOverride = dir;
}

/** Get the effective temp storage directory (user setting → platform default). */
export function getResolvedTempStorageDir(): string {
  const v = tempStorageDirOverride?.trim();
  if (v) return v;
  return getDefaultTempStoragePath();
}
