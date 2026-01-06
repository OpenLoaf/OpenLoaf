import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getEnvString } from "@teatime-ai/config";
import type { ChatModelSource, ModelDefinition } from "@teatime-ai/api/common";
import type { BasicConfig } from "@teatime-ai/api/types/basic";

export type ModelProviderValue = {
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled models keyed by model id. */
  models: Record<string, ModelDefinition>;
  /** Optional provider options. */
  options?: {
    /** Whether to enable OpenAI Responses API. */
    enableResponsesApi?: boolean;
  };
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
  endpoint?: string;
  /** Region name. */
  region?: string;
  /** Bucket name. */
  bucket: string;
  /** Force path-style addressing. */
  forcePathStyle?: boolean;
  /** Public base URL for CDN or custom domain. */
  publicBaseUrl?: string;
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

export type BasicConf = BasicConfig;

type TeatimeConf = {
  /** Workspace list. */
  workspaces?: WorkspaceConf[];
  /** Global basic settings. */
  basic?: BasicConf;
  /** Model provider configs. */
  modelProviders?: ModelProviderConf[];
  /** S3 provider configs. */
  S3Providers?: S3ProviderConf[];
  /** Auth info for SaaS login. */
  auth?: {
    /** Stored SaaS refresh token. */
    refreshToken?: string;
    /** Last update timestamp. */
    updatedAt?: string;
  };
  /** Legacy workspace root URI (deprecated). */
  workspaceRootUri?: string;
};

const DEFAULT_BASIC_CONF: BasicConf = {
  chatSource: "local",
  activeS3Id: undefined,
  s3AutoUpload: true,
  s3AutoDeleteHours: 2,
  modelResponseLanguage: "zh-CN",
  modelQuality: "medium",
  uiLanguage: "zh-CN",
  uiFontSize: "medium",
  uiTheme: "system",
  uiThemeManual: "light",
  appLocalStorageDir: "",
  appAutoBackupDir: "",
  appCustomRules: "",
  modelDefaultChatModelId: "",
  appProjectRule: "按项目划分",
  stepUpInitialized: false,
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: "",
  proxyUsername: "",
  proxyPassword: "",
};

function normalizeBasicConf(raw?: Partial<BasicConf>, fallback?: Partial<BasicConf>): BasicConf {
  const source = raw ?? {};
  const fallbackSource = fallback ?? {};
  const chatSource: ChatModelSource =
    source.chatSource === "cloud" || source.chatSource === "local"
      ? source.chatSource
      : fallbackSource.chatSource === "cloud" || fallbackSource.chatSource === "local"
        ? fallbackSource.chatSource
        : DEFAULT_BASIC_CONF.chatSource;
  const activeS3Id =
    typeof source.activeS3Id === "string" && source.activeS3Id.trim()
      ? source.activeS3Id.trim()
      : typeof fallbackSource.activeS3Id === "string" && fallbackSource.activeS3Id.trim()
        ? fallbackSource.activeS3Id.trim()
        : undefined;
  const s3AutoUpload =
    typeof source.s3AutoUpload === "boolean"
      ? source.s3AutoUpload
      : typeof fallbackSource.s3AutoUpload === "boolean"
        ? fallbackSource.s3AutoUpload
        : DEFAULT_BASIC_CONF.s3AutoUpload;
  const rawDeleteHours =
    typeof source.s3AutoDeleteHours === "number"
      ? source.s3AutoDeleteHours
      : typeof fallbackSource.s3AutoDeleteHours === "number"
        ? fallbackSource.s3AutoDeleteHours
        : DEFAULT_BASIC_CONF.s3AutoDeleteHours;
  const s3AutoDeleteHours = Math.min(168, Math.max(1, Math.floor(rawDeleteHours)));
  const modelResponseLanguage =
    source.modelResponseLanguage &&
    ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES"].includes(
      source.modelResponseLanguage,
    )
      ? source.modelResponseLanguage
      : fallbackSource.modelResponseLanguage &&
          ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES"].includes(
            fallbackSource.modelResponseLanguage,
          )
        ? fallbackSource.modelResponseLanguage
        : DEFAULT_BASIC_CONF.modelResponseLanguage;
  const modelQuality =
    source.modelQuality === "high" || source.modelQuality === "medium" || source.modelQuality === "low"
      ? source.modelQuality
      : fallbackSource.modelQuality === "high" ||
          fallbackSource.modelQuality === "medium" ||
          fallbackSource.modelQuality === "low"
        ? fallbackSource.modelQuality
        : DEFAULT_BASIC_CONF.modelQuality;
  const uiLanguage =
    source.uiLanguage &&
    ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES"].includes(
      source.uiLanguage,
    )
      ? source.uiLanguage
      : fallbackSource.uiLanguage &&
          ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES"].includes(
            fallbackSource.uiLanguage,
          )
        ? fallbackSource.uiLanguage
        : DEFAULT_BASIC_CONF.uiLanguage;
  const uiFontSize =
    source.uiFontSize === "small" ||
    source.uiFontSize === "medium" ||
    source.uiFontSize === "large" ||
    source.uiFontSize === "xlarge"
      ? source.uiFontSize
      : fallbackSource.uiFontSize === "small" ||
          fallbackSource.uiFontSize === "medium" ||
          fallbackSource.uiFontSize === "large" ||
          fallbackSource.uiFontSize === "xlarge"
        ? fallbackSource.uiFontSize
        : DEFAULT_BASIC_CONF.uiFontSize;
  const uiTheme =
    source.uiTheme === "system" || source.uiTheme === "light" || source.uiTheme === "dark"
      ? source.uiTheme
      : fallbackSource.uiTheme === "system" ||
          fallbackSource.uiTheme === "light" ||
          fallbackSource.uiTheme === "dark"
        ? fallbackSource.uiTheme
        : DEFAULT_BASIC_CONF.uiTheme;
  const uiThemeManual =
    source.uiThemeManual === "light" || source.uiThemeManual === "dark"
      ? source.uiThemeManual
      : fallbackSource.uiThemeManual === "light" || fallbackSource.uiThemeManual === "dark"
        ? fallbackSource.uiThemeManual
        : DEFAULT_BASIC_CONF.uiThemeManual;
  const appLocalStorageDir =
    typeof source.appLocalStorageDir === "string"
      ? source.appLocalStorageDir
      : typeof fallbackSource.appLocalStorageDir === "string"
        ? fallbackSource.appLocalStorageDir
        : DEFAULT_BASIC_CONF.appLocalStorageDir;
  const appAutoBackupDir =
    typeof source.appAutoBackupDir === "string"
      ? source.appAutoBackupDir
      : typeof fallbackSource.appAutoBackupDir === "string"
        ? fallbackSource.appAutoBackupDir
        : DEFAULT_BASIC_CONF.appAutoBackupDir;
  const appCustomRules =
    typeof source.appCustomRules === "string"
      ? source.appCustomRules
      : typeof fallbackSource.appCustomRules === "string"
        ? fallbackSource.appCustomRules
        : DEFAULT_BASIC_CONF.appCustomRules;
  const modelDefaultChatModelId =
    typeof source.modelDefaultChatModelId === "string"
      ? source.modelDefaultChatModelId
      : typeof fallbackSource.modelDefaultChatModelId === "string"
        ? fallbackSource.modelDefaultChatModelId
        : DEFAULT_BASIC_CONF.modelDefaultChatModelId;
  const appProjectRule =
    typeof source.appProjectRule === "string"
      ? source.appProjectRule
      : typeof fallbackSource.appProjectRule === "string"
        ? fallbackSource.appProjectRule
        : DEFAULT_BASIC_CONF.appProjectRule;
  const stepUpInitialized =
    typeof source.stepUpInitialized === "boolean"
      ? source.stepUpInitialized
      : typeof fallbackSource.stepUpInitialized === "boolean"
        ? fallbackSource.stepUpInitialized
        : DEFAULT_BASIC_CONF.stepUpInitialized;
  const proxyEnabled =
    typeof source.proxyEnabled === "boolean"
      ? source.proxyEnabled
      : typeof fallbackSource.proxyEnabled === "boolean"
        ? fallbackSource.proxyEnabled
        : DEFAULT_BASIC_CONF.proxyEnabled;
  const proxyHost =
    typeof source.proxyHost === "string"
      ? source.proxyHost
      : typeof fallbackSource.proxyHost === "string"
        ? fallbackSource.proxyHost
        : DEFAULT_BASIC_CONF.proxyHost;
  const proxyPort =
    typeof source.proxyPort === "string"
      ? source.proxyPort
      : typeof fallbackSource.proxyPort === "string"
        ? fallbackSource.proxyPort
        : DEFAULT_BASIC_CONF.proxyPort;
  const proxyUsername =
    typeof source.proxyUsername === "string"
      ? source.proxyUsername
      : typeof fallbackSource.proxyUsername === "string"
        ? fallbackSource.proxyUsername
        : DEFAULT_BASIC_CONF.proxyUsername;
  const proxyPassword =
    typeof source.proxyPassword === "string"
      ? source.proxyPassword
      : typeof fallbackSource.proxyPassword === "string"
        ? fallbackSource.proxyPassword
        : DEFAULT_BASIC_CONF.proxyPassword;

  return {
    chatSource,
    activeS3Id,
    s3AutoUpload,
    s3AutoDeleteHours,
    modelResponseLanguage,
    modelQuality,
    uiLanguage,
    uiFontSize,
    uiTheme,
    uiThemeManual,
    appLocalStorageDir,
    appAutoBackupDir,
    appCustomRules,
    modelDefaultChatModelId,
    appProjectRule,
    stepUpInitialized,
    proxyEnabled,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
  };
}

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

/** Read basic config from config with defaults. */
export function readBasicConf(): BasicConf {
  const conf = loadTeatimeConf();
  const activeWorkspace =
    conf.workspaces?.find((workspace) => workspace.isActive) ?? conf.workspaces?.[0];
  const legacyWorkspace = activeWorkspace as Record<string, unknown> | undefined;
  const fallback: Partial<BasicConf> = {
    chatSource: legacyWorkspace?.chatSource as ChatModelSource | undefined,
    activeS3Id:
      typeof legacyWorkspace?.activeS3Id === "string"
        ? (legacyWorkspace?.activeS3Id as string)
        : undefined,
    s3AutoUpload:
      typeof legacyWorkspace?.s3AutoUpload === "boolean"
        ? (legacyWorkspace?.s3AutoUpload as boolean)
        : undefined,
    s3AutoDeleteHours:
      typeof legacyWorkspace?.s3AutoDeleteHours === "number"
        ? (legacyWorkspace?.s3AutoDeleteHours as number)
        : undefined,
  };
  return normalizeBasicConf(conf.basic, fallback);
}

/** Persist basic config into config. */
export function writeBasicConf(next: BasicConf): void {
  const conf = loadTeatimeConf();
  writeTeatimeConf({ ...conf, basic: normalizeBasicConf(next) });
}

/** Read SaaS refresh token from config. */
export function readAuthRefreshToken(): string | undefined {
  const conf = loadTeatimeConf();
  return conf.auth?.refreshToken;
}

/** Persist SaaS refresh token into config. */
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

/** Clear SaaS refresh token from config. */
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
