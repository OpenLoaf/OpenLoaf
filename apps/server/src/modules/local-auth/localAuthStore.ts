/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getOpenLoafRootDir } from "@openloaf/config";

type LocalAuthFile = {
  /** Local auth configuration payload. */
  localAuth?: LocalAuthConfig;
};

type LocalAuthConfig = {
  /** Password hash (scrypt, base64). */
  passwordHash?: string;
  /** Password salt (base64). */
  salt?: string;
  /** Session cookie secret (base64). */
  sessionSecret?: string;
  /** Last update timestamp (ISO). */
  updatedAt?: string;
};

/** Salt byte length for scrypt. */
const SALT_LENGTH = 16;
/** Derived key length for scrypt. */
const KEY_LENGTH = 64;
/** Session secret byte length. */
const SESSION_SECRET_LENGTH = 32;

/** Resolve config directory. */
function getConfigDir(): string {
  return getOpenLoafRootDir();
}

/** Resolve local-auth.json path. */
function getLocalAuthPath(): string {
  return path.join(getConfigDir(), "local-auth.json");
}

/** Read JSON file safely with a fallback payload. */
function readJsonSafely<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    // 逻辑：解析失败时回退默认值，避免阻断读取流程。
    return fallback;
  }
}

/** Write JSON file atomically. */
function writeJson(filePath: string, payload: unknown): void {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 逻辑：原子写入避免半写入状态。
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

/** Normalize local auth config shape. */
function normalizeLocalAuthConfig(raw?: LocalAuthConfig | null): LocalAuthConfig {
  const source = raw ?? {};
  const passwordHash =
    typeof source.passwordHash === "string" && source.passwordHash.trim()
      ? source.passwordHash
      : undefined;
  const salt =
    typeof source.salt === "string" && source.salt.trim() ? source.salt : undefined;
  const sessionSecret =
    typeof source.sessionSecret === "string" && source.sessionSecret.trim()
      ? source.sessionSecret
      : undefined;
  const updatedAt =
    typeof source.updatedAt === "string" && source.updatedAt.trim()
      ? source.updatedAt
      : undefined;
  return { passwordHash, salt, sessionSecret, updatedAt };
}

/** Read local auth config. */
function readLocalAuthConfig(): LocalAuthConfig {
  const file = readJsonSafely<LocalAuthFile>(getLocalAuthPath(), {});
  return normalizeLocalAuthConfig(file.localAuth);
}

/** Persist local auth config. */
function writeLocalAuthConfig(next: LocalAuthConfig): void {
  const filePath = getLocalAuthPath();
  const prev = readJsonSafely<LocalAuthFile>(filePath, {});
  writeJson(filePath, { ...prev, localAuth: normalizeLocalAuthConfig(next) });
}

/** Get local auth snapshot for UI. */
export function getLocalAuthSnapshot(): { configured: boolean; updatedAt?: string } {
  const config = readLocalAuthConfig();
  const configured = Boolean(config.passwordHash && config.salt);
  return { configured, updatedAt: config.updatedAt };
}

/** Check if local auth password is configured. */
export function isLocalAuthConfigured(): boolean {
  const config = readLocalAuthConfig();
  return Boolean(config.passwordHash && config.salt);
}

/** Ensure a session secret exists and return it. */
export function ensureLocalAuthSecret(): string {
  const config = readLocalAuthConfig();
  if (config.sessionSecret) return config.sessionSecret;
  const nextSecret = randomBytes(SESSION_SECRET_LENGTH).toString("base64");
  // 逻辑：首次生成 session secret 时直接写回配置。
  writeLocalAuthConfig({
    ...config,
    sessionSecret: nextSecret,
    updatedAt: new Date().toISOString(),
  });
  return nextSecret;
}

/** Set or replace local auth password (rotates session secret). */
export function setLocalAuthPassword(password: string): void {
  const salt = randomBytes(SALT_LENGTH).toString("base64");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("base64");
  const sessionSecret = randomBytes(SESSION_SECRET_LENGTH).toString("base64");
  // 逻辑：更新密码时轮换 session secret，清空旧会话。
  writeLocalAuthConfig({
    passwordHash: hash,
    salt,
    sessionSecret,
    updatedAt: new Date().toISOString(),
  });
}

/** Verify local auth password against stored hash. */
export function verifyLocalAuthPassword(password: string): boolean {
  const config = readLocalAuthConfig();
  if (!config.passwordHash || !config.salt) return false;
  const computed = scryptSync(password, config.salt, KEY_LENGTH);
  const stored = Buffer.from(config.passwordHash, "base64");
  if (stored.length !== computed.length) {
    // 逻辑：长度不匹配时直接视为失败，避免 timingSafeEqual 抛错。
    return false;
  }
  return timingSafeEqual(stored, computed);
}
