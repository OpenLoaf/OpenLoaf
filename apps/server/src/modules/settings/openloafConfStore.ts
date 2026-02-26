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
import { getOpenLoafRootDir } from "@openloaf/config";
import type { ChatModelSource } from "@openloaf/api/common";
import type {
  AuthConf,
  BasicConf,
  ModelProviderConf,
  S3ProviderConf,
} from "@/modules/settings/settingConfigTypes";

type SettingsFile = {
  /** Global basic settings. */
  basic?: BasicConf;
};

type ProvidersFile = {
  /** Model provider configs. */
  modelProviders?: ModelProviderConf[];
  /** S3 provider configs. */
  s3Providers?: S3ProviderConf[];
};

type AuthFile = {
  /** Auth info for SaaS login. */
  auth?: AuthConf;
};

/** CLI tool config type alias. */
type CliToolConfig = BasicConf["cliTools"]["codex"];
/** CLI tools config type alias. */
type CliToolsConfig = BasicConf["cliTools"];

/** Default basic config values. */
const DEFAULT_BASIC_CONF: BasicConf = {
  chatSource: "local",
  chatThinkingMode: "fast",
  toolModelSource: "cloud",
  activeS3Id: undefined,
  s3AutoUpload: true,
  s3AutoDeleteHours: 2,
  modelResponseLanguage: "zh-CN",
  modelQuality: "medium",
  chatOnlineSearchMemoryScope: "tab",
  modelSoundEnabled: true,
  autoSummaryEnabled: true,
  autoSummaryHours: [0, 8, 12, 17],
  uiLanguage: "zh-CN",
  uiFontSize: "medium",
  // UI animation intensity.
  uiAnimationLevel: "high",
  uiTheme: "system",
  uiThemeManual: "light",
  boardDebugEnabled: false,
  // Show chat preface viewer button.
  chatPrefaceEnabled: false,
  appLocalStorageDir: "",
  appAutoBackupDir: "",
  appCustomRules: "",
  appNotificationSoundEnabled: true,
  modelDefaultChatModelId: "codex-cli:gpt-5.2-codex",
  modelDefaultToolModelId: "",
  appProjectRule: "按项目划分",
  toolAllowOutsideScope: false,
  stepUpInitialized: false,
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: "",
  proxyUsername: "",
  proxyPassword: "",
  cliTools: {
    codex: {
      apiUrl: "",
      apiKey: "",
      forceCustomApiKey: false,
    },
    claudeCode: {
      apiUrl: "",
      apiKey: "",
      forceCustomApiKey: false,
    },
    python: {
      apiUrl: "",
      apiKey: "",
      forceCustomApiKey: false,
    },
  },
};

/** Normalize CLI tool config. */
function normalizeCliToolConfig(raw: unknown, fallback: CliToolConfig): CliToolConfig {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const apiUrl = typeof source.apiUrl === "string" ? source.apiUrl : fallback.apiUrl;
  const apiKey = typeof source.apiKey === "string" ? source.apiKey : fallback.apiKey;
  const forceCustomApiKey =
    typeof source.forceCustomApiKey === "boolean"
      ? source.forceCustomApiKey
      : fallback.forceCustomApiKey;
  return { apiUrl, apiKey, forceCustomApiKey };
}

/** Normalize CLI tools config. */
function normalizeCliToolsConfig(raw: unknown, fallback: CliToolsConfig): CliToolsConfig {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  // CLI 工具配置缺失时回退到默认值，避免配置读取出错。
  const codex = normalizeCliToolConfig(source.codex, fallback.codex);
  const claudeCode = normalizeCliToolConfig(source.claudeCode, fallback.claudeCode);
  const python = normalizeCliToolConfig(source.python, fallback.python);
  return { codex, claudeCode, python };
}

/** Normalize auto summary hours for basic settings. */
function normalizeAutoSummaryHours(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return fallback;
  // 逻辑：过滤无效小时并去重排序。
  const hours = Array.from(
    new Set(
      raw
        .filter((value) => typeof value === "number" && Number.isInteger(value))
        .filter((value) => value >= 0 && value <= 24),
    ),
  ).sort((a, b) => a - b);
  return hours;
}

function normalizeBasicConf(raw?: Partial<BasicConf>, fallback?: Partial<BasicConf>): BasicConf {
  const source = raw ?? {};
  const fallbackSource = fallback ?? {};
  const chatSource: ChatModelSource =
    source.chatSource === "cloud" || source.chatSource === "local"
      ? source.chatSource
      : fallbackSource.chatSource === "cloud" || fallbackSource.chatSource === "local"
        ? fallbackSource.chatSource
        : DEFAULT_BASIC_CONF.chatSource;
  const chatThinkingMode =
    source.chatThinkingMode === "deep" || source.chatThinkingMode === "fast"
      ? source.chatThinkingMode
      : fallbackSource.chatThinkingMode === "deep" || fallbackSource.chatThinkingMode === "fast"
        ? fallbackSource.chatThinkingMode
        : DEFAULT_BASIC_CONF.chatThinkingMode;
  const toolModelSource: ChatModelSource =
    source.toolModelSource === "cloud" || source.toolModelSource === "local"
      ? source.toolModelSource
      : fallbackSource.toolModelSource === "cloud" || fallbackSource.toolModelSource === "local"
        ? fallbackSource.toolModelSource
        : DEFAULT_BASIC_CONF.toolModelSource;
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
  const chatOnlineSearchMemoryScope =
    source.chatOnlineSearchMemoryScope === "global" || source.chatOnlineSearchMemoryScope === "tab"
      ? source.chatOnlineSearchMemoryScope
      : fallbackSource.chatOnlineSearchMemoryScope === "global" ||
          fallbackSource.chatOnlineSearchMemoryScope === "tab"
        ? fallbackSource.chatOnlineSearchMemoryScope
        : DEFAULT_BASIC_CONF.chatOnlineSearchMemoryScope;
  const modelSoundEnabled =
    typeof source.modelSoundEnabled === "boolean"
      ? source.modelSoundEnabled
      : typeof fallbackSource.modelSoundEnabled === "boolean"
        ? fallbackSource.modelSoundEnabled
        : DEFAULT_BASIC_CONF.modelSoundEnabled;
  const autoSummaryEnabled =
    typeof source.autoSummaryEnabled === "boolean"
      ? source.autoSummaryEnabled
      : typeof fallbackSource.autoSummaryEnabled === "boolean"
        ? fallbackSource.autoSummaryEnabled
        : DEFAULT_BASIC_CONF.autoSummaryEnabled;
  const autoSummaryHours = normalizeAutoSummaryHours(
    source.autoSummaryHours,
    normalizeAutoSummaryHours(fallbackSource.autoSummaryHours, DEFAULT_BASIC_CONF.autoSummaryHours),
  );
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
  const uiAnimationLevel =
    source.uiAnimationLevel === "low" ||
    source.uiAnimationLevel === "medium" ||
    source.uiAnimationLevel === "high"
      ? source.uiAnimationLevel
      : fallbackSource.uiAnimationLevel === "low" ||
          fallbackSource.uiAnimationLevel === "medium" ||
          fallbackSource.uiAnimationLevel === "high"
        ? fallbackSource.uiAnimationLevel
        : DEFAULT_BASIC_CONF.uiAnimationLevel;
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
  const boardDebugEnabled =
    typeof source.boardDebugEnabled === "boolean"
      ? source.boardDebugEnabled
      : typeof fallbackSource.boardDebugEnabled === "boolean"
        ? fallbackSource.boardDebugEnabled
        : DEFAULT_BASIC_CONF.boardDebugEnabled;
  const chatPrefaceEnabled =
    typeof source.chatPrefaceEnabled === "boolean"
      ? source.chatPrefaceEnabled
      : typeof fallbackSource.chatPrefaceEnabled === "boolean"
        ? fallbackSource.chatPrefaceEnabled
        : DEFAULT_BASIC_CONF.chatPrefaceEnabled;
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
  const appNotificationSoundEnabled =
    typeof source.appNotificationSoundEnabled === "boolean"
      ? source.appNotificationSoundEnabled
      : typeof fallbackSource.appNotificationSoundEnabled === "boolean"
        ? fallbackSource.appNotificationSoundEnabled
        : DEFAULT_BASIC_CONF.appNotificationSoundEnabled;
  const modelDefaultChatModelId =
    typeof source.modelDefaultChatModelId === "string"
      ? source.modelDefaultChatModelId
      : typeof fallbackSource.modelDefaultChatModelId === "string"
        ? fallbackSource.modelDefaultChatModelId
        : DEFAULT_BASIC_CONF.modelDefaultChatModelId;
  const modelDefaultToolModelId =
    typeof source.modelDefaultToolModelId === "string"
      ? source.modelDefaultToolModelId
      : typeof fallbackSource.modelDefaultToolModelId === "string"
        ? fallbackSource.modelDefaultToolModelId
        : DEFAULT_BASIC_CONF.modelDefaultToolModelId;
  const appProjectRule =
    typeof source.appProjectRule === "string"
      ? source.appProjectRule
      : typeof fallbackSource.appProjectRule === "string"
        ? fallbackSource.appProjectRule
        : DEFAULT_BASIC_CONF.appProjectRule;
  const toolAllowOutsideScope =
    typeof source.toolAllowOutsideScope === "boolean"
      ? source.toolAllowOutsideScope
      : typeof fallbackSource.toolAllowOutsideScope === "boolean"
        ? fallbackSource.toolAllowOutsideScope
        : DEFAULT_BASIC_CONF.toolAllowOutsideScope;
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
  const fallbackCliTools = normalizeCliToolsConfig(
    fallbackSource.cliTools,
    DEFAULT_BASIC_CONF.cliTools,
  );
  const cliTools = normalizeCliToolsConfig(source.cliTools, fallbackCliTools);

  return {
    chatSource,
    chatThinkingMode,
    toolModelSource,
    activeS3Id,
    s3AutoUpload,
    s3AutoDeleteHours,
    modelResponseLanguage,
    modelQuality,
    chatOnlineSearchMemoryScope,
    modelSoundEnabled,
    autoSummaryEnabled,
    autoSummaryHours,
    uiLanguage,
    uiFontSize,
    uiAnimationLevel,
    uiTheme,
    uiThemeManual,
    boardDebugEnabled,
    chatPrefaceEnabled,
    appLocalStorageDir,
    appAutoBackupDir,
    appCustomRules,
    appNotificationSoundEnabled,
    modelDefaultChatModelId,
    modelDefaultToolModelId,
    appProjectRule,
    toolAllowOutsideScope,
    stepUpInitialized,
    proxyEnabled,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
    cliTools,
  };
}

/** Resolve config directory. */
function getConfigDir(): string {
  return getOpenLoafRootDir();
}

/** Resolve settings.json path. */
function getSettingsPath(): string {
  return path.join(getConfigDir(), "settings.json");
}

/** Resolve providers.json path. */
function getProvidersPath(): string {
  return path.join(getConfigDir(), "providers.json");
}

/** Resolve auth.json path. */
function getAuthPath(): string {
  return path.join(getConfigDir(), "auth.json");
}

/** Read JSON file safely with a fallback payload. */
function readJsonSafely<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    // 逻辑：解析失败时回退为默认值，避免阻断读取流程。
    return fallback;
  }
}

/** Write JSON file atomically. */
function writeJson(filePath: string, payload: unknown): void {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 逻辑：原子写入，避免读取时遇到半写入状态。
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

/** Read model providers from providers.json. */
export function readModelProviders(): ModelProviderConf[] {
  const conf = readJsonSafely<ProvidersFile>(getProvidersPath(), {});
  // 逻辑：字段缺失时回退为空数组。
  return Array.isArray(conf.modelProviders) ? conf.modelProviders : [];
}

/** Persist model providers into providers.json. */
export function writeModelProviders(entries: ModelProviderConf[]): void {
  const conf = readJsonSafely<ProvidersFile>(getProvidersPath(), {});
  writeJson(getProvidersPath(), { ...conf, modelProviders: entries });
}

/** Read S3 providers from providers.json. */
export function readS3Providers(): S3ProviderConf[] {
  const conf = readJsonSafely<ProvidersFile>(getProvidersPath(), {});
  // 逻辑：字段缺失时回退为空数组。
  return Array.isArray(conf.s3Providers) ? conf.s3Providers : [];
}

/** Persist S3 providers into providers.json. */
export function writeS3Providers(entries: S3ProviderConf[]): void {
  const conf = readJsonSafely<ProvidersFile>(getProvidersPath(), {});
  writeJson(getProvidersPath(), { ...conf, s3Providers: entries });
}

/** Read basic config from settings.json with defaults. */
export function readBasicConf(): BasicConf {
  const conf = readJsonSafely<SettingsFile>(getSettingsPath(), {});
  return normalizeBasicConf(conf.basic);
}

/** Persist basic config into settings.json. */
export function writeBasicConf(next: BasicConf): void {
  const conf = readJsonSafely<SettingsFile>(getSettingsPath(), {});
  writeJson(getSettingsPath(), { ...conf, basic: normalizeBasicConf(next) });
}

/** Read SaaS refresh token from auth.json. */
export function readAuthRefreshToken(): string | undefined {
  const conf = readJsonSafely<AuthFile>(getAuthPath(), {});
  return conf.auth?.refreshToken;
}

/** Persist SaaS refresh token into auth.json. */
export function writeAuthRefreshToken(token: string): void {
  const conf = readJsonSafely<AuthFile>(getAuthPath(), {});
  // 逻辑：刷新 token 时同步更新时间，便于排查。
  writeJson(getAuthPath(), {
    ...conf,
    auth: {
      ...(conf.auth ?? {}),
      refreshToken: token,
      updatedAt: new Date().toISOString(),
    },
  });
}

/** Clear SaaS refresh token from auth.json. */
export function clearAuthRefreshToken(): void {
  const conf = readJsonSafely<AuthFile>(getAuthPath(), {});
  writeJson(getAuthPath(), {
    ...conf,
    auth: {
      ...(conf.auth ?? {}),
      refreshToken: undefined,
      updatedAt: new Date().toISOString(),
    },
  });
}
