import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getEnvString } from "@teatime-ai/config";
import type { ModelDefinition } from "@teatime-ai/api/common";

export type ModelProviderValue = {
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled models keyed by model id. */
  models: Record<string, ModelDefinition>;
};

export type ModelProviderConf = ModelProviderValue & {
  /** Stable provider entry id. */
  id: string;
  /** Display name stored as title. */
  title: string;
  /** Last update timestamp. */
  updatedAt: string;
};

export type S3ProviderValue = {
  /** Provider id. */
  providerId: string;
  /** Display label for UI. */
  providerLabel?: string;
  /** Endpoint URL. */
  endpoint: string;
  /** Region name. */
  region?: string;
  /** Bucket name. */
  bucket: string;
  /** Access key id. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
};

export type S3ProviderConf = S3ProviderValue & {
  /** Stable provider entry id. */
  id: string;
  /** Display name stored as title. */
  title: string;
  /** Last update timestamp. */
  updatedAt: string;
};

export type WorkspaceConf = {
  /** Workspace id. */
  id: string;
  /** Workspace display name. */
  name: string;
  /** Workspace type. */
  type: "local" | "cloud";
  /** Active workspace marker. */
  isActive: boolean;
  /** Workspace root URI. */
  rootUri: string;
  /** Project map of { projectId: rootUri }. */
  projects?: Record<string, string>;
};

type TeatimeConf = {
  /** Workspace list. */
  workspaces?: WorkspaceConf[];
  /** Model provider configs. */
  modelProviders?: ModelProviderConf[];
  /** S3 provider configs. */
  S3Providers?: S3ProviderConf[];
  /** Auth info for SaaS login. */
  auth?: {
    /** Stored Auth0 refresh token. */
    refreshToken?: string;
    /** Last update timestamp. */
    updatedAt?: string;
  };
  /** Legacy workspace root URI (deprecated). */
  workspaceRootUri?: string;
};

/** Resolve the config file path from environment. */
function getTeatimeConfPath(): string {
  const confPath = getEnvString(process.env, "TEATIME_CONF_PATH", { required: true });
  return confPath!;
}

/** Load Teatime config from disk. */
function loadTeatimeConf(): TeatimeConf {
  const confPath = getTeatimeConfPath();
  if (!existsSync(confPath)) {
    throw new Error("Teatime config not found. Please create teatime.conf first.");
  }
  return JSON.parse(readFileSync(confPath, "utf-8")) as TeatimeConf;
}

/** Write Teatime config to disk. */
function writeTeatimeConf(conf: TeatimeConf): void {
  const confPath = getTeatimeConfPath();
  // 逻辑：保持 JSON 可读，便于手工审阅。
  writeFileSync(confPath, JSON.stringify(conf, null, 2));
}

/** Read model providers from config. */
export function readModelProviders(): ModelProviderConf[] {
  const conf = loadTeatimeConf();
  // 逻辑：字段缺失时回退为空数组。
  return Array.isArray(conf.modelProviders) ? conf.modelProviders : [];
}

/** Persist model providers into config. */
export function writeModelProviders(entries: ModelProviderConf[]): void {
  const conf = loadTeatimeConf();
  writeTeatimeConf({ ...conf, modelProviders: entries });
}

/** Read S3 providers from config. */
export function readS3Providers(): S3ProviderConf[] {
  const conf = loadTeatimeConf();
  // 逻辑：字段缺失时回退为空数组。
  return Array.isArray(conf.S3Providers) ? conf.S3Providers : [];
}

/** Persist S3 providers into config. */
export function writeS3Providers(entries: S3ProviderConf[]): void {
  const conf = loadTeatimeConf();
  writeTeatimeConf({ ...conf, S3Providers: entries });
}

/** Read Auth0 refresh token from config. */
export function readAuthRefreshToken(): string | undefined {
  const conf = loadTeatimeConf();
  return conf.auth?.refreshToken;
}

/** Persist Auth0 refresh token into config. */
export function writeAuthRefreshToken(token: string): void {
  const conf = loadTeatimeConf();
  // 逻辑：刷新 token 时同步更新时间，便于排查。
  writeTeatimeConf({
    ...conf,
    auth: {
      ...(conf.auth ?? {}),
      refreshToken: token,
      updatedAt: new Date().toISOString(),
    },
  });
}

/** Clear Auth0 refresh token from config. */
export function clearAuthRefreshToken(): void {
  const conf = loadTeatimeConf();
  writeTeatimeConf({
    ...conf,
    auth: {
      ...(conf.auth ?? {}),
      refreshToken: undefined,
      updatedAt: new Date().toISOString(),
    },
  });
}
