import { randomUUID } from "node:crypto";
import type { ModelDefinition } from "@tenas-ai/api/common";
import type { BasicConfig, BasicConfigUpdate } from "@tenas-ai/api/types/basic";
import {
  readModelProviders,
  readS3Providers,
  readBasicConf,
  writeBasicConf,
  writeModelProviders,
  writeS3Providers,
} from "@/modules/settings/tenasConfStore";
import type {
  ModelProviderConf,
  ModelProviderValue,
  S3ProviderConf,
  S3ProviderValue,
} from "@/modules/settings/settingConfigTypes";

type SettingItem = {
  /** Setting row id. */
  id?: string;
  /** Setting key. */
  key: string;
  /** Setting value. */
  value: unknown;
  /** Whether value is secret. */
  secret: boolean;
  /** Setting category. */
  category?: string;
  /** Readonly flag for UI. */
  isReadonly: boolean;
  /** Whether setting should sync to cloud. */
  syncToCloud: boolean;
};

export type ProviderSettingEntry = {
  /** Provider entry id. */
  id: string;
  /** Display name. */
  key: string;
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled model definitions keyed by model id. */
  models: Record<string, ModelDefinition>;
  /** Provider options. */
  options?: {
    /** Whether to enable OpenAI Responses API. */
    enableResponsesApi?: boolean;
  };
  /** Last update time. */
  updatedAt: Date;
};

/** Settings category for model providers. */
const MODEL_PROVIDER_CATEGORY = "provider";
/** Settings category for S3 providers. */
const S3_PROVIDER_CATEGORY = "s3Provider";
/** Setting key for chat model source. */
const CHAT_SOURCE_KEY = "model.chatSource";
/** Setting key for model response language. */
const MODEL_RESPONSE_LANGUAGE_KEY = "model.responseLanguage";
/** Supported response languages. */
const MODEL_RESPONSE_LANGUAGES = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
] as const;
/** Setting key for model chat quality. */
const MODEL_CHAT_QUALITY_KEY = "model.chatQuality";

/** Read basic config from config. */
function readBasicConfig(): BasicConfig {
  return readBasicConf();
}
/** Check if a value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** CLI tool config type alias. */
type CliToolConfig = BasicConfig["cliTools"]["codex"];
/** CLI tools config type alias. */
type CliToolsConfig = BasicConfig["cliTools"];

/** Normalize CLI tool config for basic settings. */
function normalizeCliToolConfig(raw: unknown, fallback: CliToolConfig): CliToolConfig {
  if (!isRecord(raw)) return fallback;
  const apiUrl = typeof raw.apiUrl === "string" ? raw.apiUrl : fallback.apiUrl;
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : fallback.apiKey;
  const forceCustomApiKey =
    typeof raw.forceCustomApiKey === "boolean"
      ? raw.forceCustomApiKey
      : fallback.forceCustomApiKey;
  return { apiUrl, apiKey, forceCustomApiKey };
}

/** Normalize CLI tools config for basic settings. */
function normalizeCliToolsConfig(raw: unknown, fallback: CliToolsConfig): CliToolsConfig {
  const source = isRecord(raw) ? raw : {};
  // CLI 配置缺失时回退当前配置，避免被更新请求清空。
  const codex = normalizeCliToolConfig(source.codex, fallback.codex);
  const claudeCode = normalizeCliToolConfig(source.claudeCode, fallback.claudeCode);
  return { codex, claudeCode };
}

/** Normalize model map input. */
function normalizeModelMap(value: unknown): Record<string, ModelDefinition> | null {
  if (!isRecord(value)) return null;
  const models: Record<string, ModelDefinition> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object") continue;
    const rawId = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : "";
    const modelId = (rawId || key).trim();
    // 中文注释：优先使用 map key，确保配置里的 id 与存储一致。
    if (!modelId) continue;
    models[modelId] = { ...(raw as ModelDefinition), id: modelId };
  }
  return Object.keys(models).length > 0 ? models : null;
}

/** Normalize model provider payload. */
function normalizeModelProviderValue(value: unknown): ModelProviderValue | null {
  if (!isRecord(value)) return null;
  const providerId = typeof value.providerId === "string" ? value.providerId.trim() : "";
  const apiUrl = typeof value.apiUrl === "string" ? value.apiUrl.trim() : "";
  const authConfig = isRecord(value.authConfig) ? value.authConfig : null;
  const models = normalizeModelMap(value.models);
  const optionsRaw = isRecord(value.options) ? value.options : null;
  const enableResponsesApi =
    typeof optionsRaw?.enableResponsesApi === "boolean"
      ? optionsRaw.enableResponsesApi
      : undefined;
  if (!providerId || !apiUrl || !authConfig || !models) return null;
  return {
    providerId,
    apiUrl,
    authConfig,
    models,
    options: enableResponsesApi === undefined ? undefined : { enableResponsesApi },
  };
}

/** Normalize S3 provider payload. */
function normalizeS3ProviderValue(value: unknown): S3ProviderValue | null {
  if (!isRecord(value)) return null;
  const providerId = typeof value.providerId === "string" ? value.providerId.trim() : "";
  const providerLabel =
    typeof value.providerLabel === "string" ? value.providerLabel.trim() : undefined;
  const endpoint =
    typeof value.endpoint === "string" && value.endpoint.trim()
      ? value.endpoint.trim()
      : undefined;
  const region = typeof value.region === "string" ? value.region.trim() : undefined;
  const bucket = typeof value.bucket === "string" ? value.bucket.trim() : "";
  const forcePathStyle =
    typeof value.forcePathStyle === "boolean" ? value.forcePathStyle : undefined;
  const publicBaseUrl =
    typeof value.publicBaseUrl === "string" && value.publicBaseUrl.trim()
      ? value.publicBaseUrl.trim()
      : undefined;
  const accessKeyId = typeof value.accessKeyId === "string" ? value.accessKeyId.trim() : "";
  const secretAccessKey =
    typeof value.secretAccessKey === "string" ? value.secretAccessKey.trim() : "";
  if (!providerId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    providerId,
    providerLabel,
    endpoint,
    region,
    bucket,
    forcePathStyle,
    publicBaseUrl,
    accessKeyId,
    secretAccessKey,
  };
}

/** Normalize provider config for server usage. */
function normalizeProviderConfig(entry: ModelProviderConf): ProviderSettingEntry | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const key = typeof entry.title === "string" ? entry.title.trim() : "";
  if (!id || !key) return null;
  const normalized = normalizeModelProviderValue(entry);
  if (!normalized) return null;
  const updatedAt = new Date(entry.updatedAt);
  const safeUpdatedAt = Number.isNaN(updatedAt.getTime()) ? new Date(0) : updatedAt;
  return {
    id,
    key,
    providerId: normalized.providerId,
    apiUrl: normalized.apiUrl,
    authConfig: normalized.authConfig,
    models: normalized.models,
    options: normalized.options,
    updatedAt: safeUpdatedAt,
  };
}

/** Normalize provider config for web output. */
function normalizeProviderSettingItem(entry: ModelProviderConf): SettingItem | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const key = typeof entry.title === "string" ? entry.title.trim() : "";
  const normalized = normalizeModelProviderValue(entry);
  if (!id || !key || !normalized) return null;
  return {
    id,
    key,
    value: {
      providerId: normalized.providerId,
      apiUrl: normalized.apiUrl,
      authConfig: normalized.authConfig,
      models: normalized.models,
      options: normalized.options,
    },
    secret: true,
    category: MODEL_PROVIDER_CATEGORY,
    isReadonly: false,
    syncToCloud: false,
  };
}

/** Normalize S3 provider config for web output. */
function normalizeS3SettingItem(entry: S3ProviderConf): SettingItem | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const key = typeof entry.title === "string" ? entry.title.trim() : "";
  const normalized = normalizeS3ProviderValue(entry);
  if (!id || !key || !normalized) return null;
  return {
    id,
    key,
    value: {
      providerId: normalized.providerId,
      providerLabel: normalized.providerLabel,
      endpoint: normalized.endpoint,
      region: normalized.region,
      bucket: normalized.bucket,
      forcePathStyle: normalized.forcePathStyle,
      publicBaseUrl: normalized.publicBaseUrl,
      accessKeyId: normalized.accessKeyId,
      secretAccessKey: normalized.secretAccessKey,
    },
    secret: true,
    category: S3_PROVIDER_CATEGORY,
    isReadonly: false,
    syncToCloud: false,
  };
}

/** Read provider settings for server usage. */
export async function getProviderSettings(): Promise<ProviderSettingEntry[]> {
  const providers = readModelProviders()
    .map((entry) => normalizeProviderConfig(entry))
    .filter((entry): entry is ProviderSettingEntry => Boolean(entry));
  // 逻辑：保持最新更新的配置优先。
  return providers.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** Return WEB + PUBLIC settings with secret masking for UI. */
export async function getSettingsForWeb() {
  return [];
}

/** Return model provider settings for web output. */
export async function getProviderSettingsForWeb() {
  return readModelProviders()
    .map((entry) => normalizeProviderSettingItem(entry))
    .filter((entry): entry is SettingItem => Boolean(entry));
}

/** Return S3 provider settings for web output. */
export async function getS3ProviderSettingsForWeb() {
  return readS3Providers()
    .map((entry) => normalizeS3SettingItem(entry))
    .filter((entry): entry is SettingItem => Boolean(entry));
}

/** Return basic config for web output. */
export async function getBasicConfigForWeb(): Promise<BasicConfig> {
  return readBasicConfig();
}

/** Update basic config from web payload. */
export async function setBasicConfigFromWeb(update: BasicConfigUpdate): Promise<BasicConfig> {
  const current = readBasicConfig();
  const next: BasicConfig = {
    ...current,
    ...update,
  };
  const responseLanguage =
    ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES"].includes(
      next.modelResponseLanguage,
    )
      ? next.modelResponseLanguage
      : current.modelResponseLanguage;
  const modelQuality =
    next.modelQuality === "high" || next.modelQuality === "medium" || next.modelQuality === "low"
      ? next.modelQuality
      : current.modelQuality;
  const modelSoundEnabled =
    typeof next.modelSoundEnabled === "boolean"
      ? next.modelSoundEnabled
      : current.modelSoundEnabled;
  const uiLanguage =
    typeof next.uiLanguage === "string" &&
    ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES"].includes(
      next.uiLanguage,
    )
      ? next.uiLanguage
      : current.uiLanguage;
  const uiFontSize =
    next.uiFontSize === "small" ||
    next.uiFontSize === "medium" ||
    next.uiFontSize === "large" ||
    next.uiFontSize === "xlarge"
      ? next.uiFontSize
      : current.uiFontSize;
  const uiAnimationLevel =
    next.uiAnimationLevel === "low" ||
    next.uiAnimationLevel === "medium" ||
    next.uiAnimationLevel === "high"
      ? next.uiAnimationLevel
      : current.uiAnimationLevel;
  const uiTheme =
    next.uiTheme === "system" || next.uiTheme === "light" || next.uiTheme === "dark"
      ? next.uiTheme
      : current.uiTheme;
  const uiThemeManual =
    next.uiThemeManual === "light" || next.uiThemeManual === "dark"
      ? next.uiThemeManual
      : current.uiThemeManual;
  const boardDebugEnabled =
    typeof next.boardDebugEnabled === "boolean"
      ? next.boardDebugEnabled
      : current.boardDebugEnabled;
  const appLocalStorageDir =
    typeof next.appLocalStorageDir === "string" ? next.appLocalStorageDir : current.appLocalStorageDir;
  const appAutoBackupDir =
    typeof next.appAutoBackupDir === "string" ? next.appAutoBackupDir : current.appAutoBackupDir;
  const appCustomRules =
    typeof next.appCustomRules === "string" ? next.appCustomRules : current.appCustomRules;
  const appNotificationSoundEnabled =
    typeof next.appNotificationSoundEnabled === "boolean"
      ? next.appNotificationSoundEnabled
      : current.appNotificationSoundEnabled;
  const modelDefaultChatModelId =
    typeof next.modelDefaultChatModelId === "string"
      ? next.modelDefaultChatModelId
      : current.modelDefaultChatModelId;
  const appProjectRule =
    typeof next.appProjectRule === "string" ? next.appProjectRule : current.appProjectRule;
  const stepUpInitialized =
    typeof next.stepUpInitialized === "boolean"
      ? next.stepUpInitialized
      : current.stepUpInitialized;
  const proxyEnabled =
    typeof next.proxyEnabled === "boolean" ? next.proxyEnabled : current.proxyEnabled;
  const proxyHost =
    typeof next.proxyHost === "string" ? next.proxyHost : current.proxyHost;
  const proxyPort =
    typeof next.proxyPort === "string" ? next.proxyPort : current.proxyPort;
  const proxyUsername =
    typeof next.proxyUsername === "string" ? next.proxyUsername : current.proxyUsername;
  const proxyPassword =
    typeof next.proxyPassword === "string" ? next.proxyPassword : current.proxyPassword;
  const cliTools = normalizeCliToolsConfig(next.cliTools, current.cliTools);
  const normalized: BasicConfig = {
    chatSource: next.chatSource === "cloud" ? "cloud" : "local",
    activeS3Id: typeof next.activeS3Id === "string" && next.activeS3Id.trim()
      ? next.activeS3Id.trim()
      : undefined,
    s3AutoUpload: Boolean(next.s3AutoUpload),
    s3AutoDeleteHours: Math.min(168, Math.max(1, Math.floor(next.s3AutoDeleteHours))),
    modelResponseLanguage: responseLanguage,
    modelQuality,
    modelSoundEnabled,
    uiLanguage,
    uiFontSize,
    uiAnimationLevel,
    uiTheme,
    uiThemeManual,
    boardDebugEnabled,
    appLocalStorageDir,
    appAutoBackupDir,
    appCustomRules,
    appNotificationSoundEnabled,
    modelDefaultChatModelId,
    appProjectRule,
    stepUpInitialized,
    proxyEnabled,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
    cliTools,
  };
  writeBasicConf(normalized);
  return normalized;
}

/** Upsert model provider config into providers.json. */
function upsertModelProvider(key: string, value: unknown) {
  const normalized = normalizeModelProviderValue(value);
  if (!normalized) throw new Error("Invalid model provider payload");
  const providers = readModelProviders();
  const existing = providers.find((entry) => entry.title === key);
  const next: ModelProviderConf = {
    id: existing?.id ?? randomUUID(),
    title: key,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  // 将最新配置置顶，便于默认模型优先选取。
  const nextProviders = [
    next,
    ...providers.filter((entry) => entry.title !== key),
  ];
  writeModelProviders(nextProviders);
}

/** Remove model provider config from providers.json. */
function removeModelProvider(key: string) {
  const providers = readModelProviders();
  writeModelProviders(providers.filter((entry) => entry.title !== key));
}

/** Upsert S3 provider config into providers.json. */
function upsertS3Provider(key: string, value: unknown) {
  const normalized = normalizeS3ProviderValue(value);
  if (!normalized) throw new Error("Invalid S3 provider payload");
  const providers = readS3Providers();
  const existing = providers.find((entry) => entry.title === key);
  const next: S3ProviderConf = {
    id: existing?.id ?? randomUUID(),
    title: key,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  // 将最新配置置顶，便于 UI 优先展示。
  const nextProviders = [
    next,
    ...providers.filter((entry) => entry.title !== key),
  ];
  writeS3Providers(nextProviders);
  const basic = readBasicConfig();
  if (basic.activeS3Id) return;
  // 中文注释：首次添加 S3 服务商时默认激活。
  writeBasicConf({ ...basic, activeS3Id: next.id });
}

/** Remove S3 provider config from providers.json. */
function removeS3Provider(key: string) {
  const providers = readS3Providers();
  const removed = providers.find((entry) => entry.title === key);
  const nextProviders = providers.filter((entry) => entry.title !== key);
  writeS3Providers(nextProviders);
  if (!removed?.id) return;
  const basic = readBasicConfig();
  if (basic.activeS3Id !== removed.id) return;
  // 中文注释：当前激活项被删除时回退到第一条或清空。
  writeBasicConf({ ...basic, activeS3Id: nextProviders[0]?.id });
}

/** Upsert setting value from web. */
export async function setSettingValueFromWeb(
  key: string,
  value: unknown,
  category?: string,
) {
  if (category === MODEL_PROVIDER_CATEGORY) {
    upsertModelProvider(key, value);
    return;
  }
  if (category === S3_PROVIDER_CATEGORY) {
    upsertS3Provider(key, value);
    return;
  }
  if (key === CHAT_SOURCE_KEY) {
    writeBasicConf({ ...readBasicConfig(), chatSource: value === "cloud" ? "cloud" : "local" });
    return;
  }
  if (key === MODEL_RESPONSE_LANGUAGE_KEY) {
    const basic = readBasicConfig();
    const next =
      typeof value === "string" &&
      (MODEL_RESPONSE_LANGUAGES as readonly string[]).includes(value)
        ? (value as (typeof MODEL_RESPONSE_LANGUAGES)[number])
        : basic.modelResponseLanguage;
    writeBasicConf({ ...basic, modelResponseLanguage: next });
    return;
  }
  if (key === MODEL_CHAT_QUALITY_KEY) {
    const basic = readBasicConfig();
    const next =
      value === "high" || value === "medium" || value === "low"
        ? value
        : basic.modelQuality;
    writeBasicConf({ ...basic, modelQuality: next });
    return;
  }
}

/** Delete setting value from web. */
export async function deleteSettingValueFromWeb(key: string, category?: string) {
  if (category === MODEL_PROVIDER_CATEGORY) {
    removeModelProvider(key);
    return;
  }
  if (category === S3_PROVIDER_CATEGORY) {
    removeS3Provider(key);
    return;
  }
  if (key === CHAT_SOURCE_KEY) {
    writeBasicConf({ ...readBasicConfig(), chatSource: "local" });
    return;
  }
  if (key === MODEL_RESPONSE_LANGUAGE_KEY) {
    writeBasicConf({ ...readBasicConfig(), modelResponseLanguage: "zh-CN" });
    return;
  }
  if (key === MODEL_CHAT_QUALITY_KEY) {
    writeBasicConf({ ...readBasicConfig(), modelQuality: "medium" });
    return;
  }
}
