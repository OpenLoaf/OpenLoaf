import { randomUUID } from "node:crypto";
import prisma from "@teatime-ai/db";
import type { ModelDefinition } from "@teatime-ai/api/common";
import type { SettingDef } from "@teatime-ai/api/types/setting";
import { ServerSettingDefs } from "@/settings/settingDefs";
import {
  readModelProviders,
  readS3Providers,
  writeModelProviders,
  writeS3Providers,
  type ModelProviderConf,
  type ModelProviderValue,
  type S3ProviderConf,
  type S3ProviderValue,
} from "@/modules/settings/teatimeConfStore";

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
  /** Last update time. */
  updatedAt: Date;
};

/** Settings category for model providers. */
const MODEL_PROVIDER_CATEGORY = "provider";
/** Settings category for S3 providers. */
const S3_PROVIDER_CATEGORY = "s3Provider";

const settingDefByKey = new Map<string, SettingDef<unknown>>(
  Object.values(ServerSettingDefs).map((def) => [def.key, def]),
);

/** Resolve setting definition by key. */
function getSettingDef(key: string) {
  const def = settingDefByKey.get(key);
  if (!def) throw new Error(`Unknown setting key: ${key}`);
  return def;
}

/** Resolve the storage category for a setting. */
function resolveSettingCategory(def: SettingDef<unknown>, category?: string) {
  return def.category ?? category ?? "general";
}

/** Find a setting row by key and category. */
async function findSettingRow(key: string, category: string) {
  return prisma.setting.findFirst({
    where: {
      key,
      category,
    },
  });
}

/** Parse stored setting value from JSON, fallback to raw string. */
function parseSettingValue(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Serialize setting value to JSON string. */
function serializeSettingValue(value: unknown) {
  return JSON.stringify(value ?? null);
}

/** Mask secret string for UI display. */
function maskSecretString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "********";
  return `****${trimmed.slice(-4)}`;
}

/** Mask secret values recursively for UI output. */
function maskSecretValue(value: unknown): unknown {
  if (typeof value === "string") {
    return maskSecretString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSecretValue(item));
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // 关键字段使用掩码，避免密钥暴露。
      if (key.toLowerCase().includes("key") && typeof val === "string") {
        next[key] = maskSecretString(val);
      } else {
        next[key] = val;
      }
    }
    return next;
  }

  return value;
}

/** Load settings for provided defs with optional secret masking. */
async function getSettingsByDefs(
  defs: Array<SettingDef<unknown>>,
  { maskSecret }: { maskSecret: boolean },
) {
  if (defs.length === 0) return [];
  const rows = await prisma.setting.findMany({
    where: {
      OR: defs.map((def) => ({
        key: def.key,
        category: def.category ?? "general",
      })),
    },
  });
  const rowByKey = new Map(rows.map((row) => [`${row.category}::${row.key}`, row]));

  return defs.map((def) => {
    const row = rowByKey.get(`${def.category ?? "general"}::${def.key}`);
    const rawValue = row?.value ?? serializeSettingValue(def.defaultValue);
    const parsedValue = parseSettingValue(rawValue);
    const value = def.secret && maskSecret ? maskSecretValue(parsedValue) : parsedValue;
    return {
      id: row?.id,
      key: def.key,
      value,
      secret: Boolean(def.secret),
      category: def.category,
      isReadonly: row?.isReadonly ?? false,
      syncToCloud: Boolean(row?.syncToCloud ?? def.syncToCloud),
    } satisfies SettingItem;
  });
}

/** Check if a value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
  if (!providerId || !apiUrl || !authConfig || !models) return null;
  return {
    providerId,
    apiUrl,
    authConfig,
    models,
  };
}

/** Normalize S3 provider payload. */
function normalizeS3ProviderValue(value: unknown): S3ProviderValue | null {
  if (!isRecord(value)) return null;
  const providerId = typeof value.providerId === "string" ? value.providerId.trim() : "";
  const providerLabel =
    typeof value.providerLabel === "string" ? value.providerLabel.trim() : undefined;
  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
  const region = typeof value.region === "string" ? value.region.trim() : undefined;
  const bucket = typeof value.bucket === "string" ? value.bucket.trim() : "";
  const accessKeyId = typeof value.accessKeyId === "string" ? value.accessKeyId.trim() : "";
  const secretAccessKey =
    typeof value.secretAccessKey === "string" ? value.secretAccessKey.trim() : "";
  if (!providerId || !endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    providerId,
    providerLabel,
    endpoint,
    region,
    bucket,
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
  const defs = Object.values(ServerSettingDefs);
  const knownSettings = await getSettingsByDefs(defs, { maskSecret: true });
  const providerSettings = readModelProviders()
    .map((entry) => normalizeProviderSettingItem(entry))
    .filter((entry): entry is SettingItem => Boolean(entry));
  const s3ProviderSettings = readS3Providers()
    .map((entry) => normalizeS3SettingItem(entry))
    .filter((entry): entry is SettingItem => Boolean(entry));
  return [...knownSettings, ...providerSettings, ...s3ProviderSettings];
}

/** Get setting value for server-side usage. */
export async function getSettingValue<T>(key: string): Promise<T> {
  const def = getSettingDef(key);
  const resolvedCategory = resolveSettingCategory(def);
  const row = await findSettingRow(key, resolvedCategory);
  if (!row) return def.defaultValue as T;
  return parseSettingValue(row.value) as T;
}

/** Upsert setting value without scope restriction (server internal). */
export async function setSettingValue(key: string, value: unknown, category?: string) {
  const def = getSettingDef(key);
  const resolvedCategory = resolveSettingCategory(def, category);
  const payload = {
    value: serializeSettingValue(value),
    secret: Boolean(def.secret),
    category: resolvedCategory,
    syncToCloud: Boolean(def.syncToCloud),
  };
  const existing = await findSettingRow(key, resolvedCategory);
  if (existing) {
    // 使用已存在的记录 ID 更新，避免依赖复合唯一键生成。
    await prisma.setting.update({
      where: { id: existing.id },
      data: payload,
    });
    return;
  }
  await prisma.setting.create({
    data: {
      key,
      ...payload,
    },
  });
}

/** Upsert model provider config into teatime.conf. */
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

/** Remove model provider config from teatime.conf. */
function removeModelProvider(key: string) {
  const providers = readModelProviders();
  writeModelProviders(providers.filter((entry) => entry.title !== key));
}

/** Upsert S3 provider config into teatime.conf. */
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
}

/** Remove S3 provider config from teatime.conf. */
function removeS3Provider(key: string) {
  const providers = readS3Providers();
  writeS3Providers(providers.filter((entry) => entry.title !== key));
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
  await setSettingValue(key, value, category);
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
  const def = getSettingDef(key);
  const resolvedCategory = resolveSettingCategory(def, category);
  const existing = await findSettingRow(key, resolvedCategory);
  if (!existing) return;
  await prisma.setting.delete({ where: { id: existing.id } }).catch(() => null);
}
