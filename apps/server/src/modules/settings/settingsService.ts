import prisma from "@teatime-ai/db";
import type { SettingDef } from "@teatime-ai/api/types/setting";
import { ServerSettingDefs } from "@/settings/settingDefs";
import type { ModelCapabilityId, ModelDefinition } from "@teatime-ai/api/common";

type SettingItem = {
  key: string;
  value: unknown;
  secret: boolean;
  category?: string;
  isReadonly: boolean;
  syncToCloud: boolean;
};

function getRowSyncToCloud(row: unknown, fallback: boolean) {
  if (row && typeof row === "object" && "syncToCloud" in row) {
    const value = (row as { syncToCloud?: boolean }).syncToCloud;
    return typeof value === "boolean" ? value : fallback;
  }
  return fallback;
}

export type ProviderSettingEntry = {
  key: string;
  provider: string;
  apiUrl: string;
  apiKey: string;
  modelIds: string[];
  modelDefinitions: ModelDefinition[];
  updatedAt: Date;
};

const settingDefByKey = new Map<string, SettingDef<unknown>>(
  Object.values(ServerSettingDefs).map((def) => [def.key, def]),
);

/** Resolve setting definition by key. */
function getSettingDef(key: string, category?: string) {
  const def = resolveSettingDef(key, category);
  if (!def) throw new Error(`Unknown setting key: ${key}`);
  return def;
}

/** Resolve setting definition by key, allowing provider entries. */
function resolveSettingDef(key: string, category?: string) {
  const def = settingDefByKey.get(key);
  if (def) return def;
  if (category === "provider") {
    return {
      key,
      defaultValue: null,
      secret: true,
      category: "provider",
    } satisfies SettingDef<unknown>;
  }
  return null;
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
      key: def.key,
      value,
      secret: Boolean(def.secret),
      category: def.category,
      isReadonly: row?.isReadonly ?? false,
      syncToCloud: getRowSyncToCloud(row, Boolean(def.syncToCloud)),
    } satisfies SettingItem;
  });
}

/** Load provider settings stored as individual entries. */
async function getProviderSettingsForWeb({ maskSecret }: { maskSecret: boolean }) {
  const rows = await prisma.setting.findMany({
    where: { category: "provider" },
  });
  return rows.map((row) => {
    const parsedValue = parseSettingValue(row.value);
    const shouldMask = maskSecret && row.secret && row.category !== "provider";
    const value = shouldMask ? maskSecretValue(parsedValue) : parsedValue;
    return {
      key: row.key,
      value,
      secret: row.secret,
      category: row.category,
      isReadonly: row.isReadonly,
      syncToCloud: getRowSyncToCloud(row, false),
    } satisfies SettingItem;
  });
}

/** Normalize provider setting row for server usage. */
function normalizeProviderSettingRow(row: {
  key: string;
  value: string;
  updatedAt: Date;
}): ProviderSettingEntry | null {
  const parsed = parseSettingValue(row.value);
  if (!parsed || typeof parsed !== "object") return null;

  const entry = parsed as Partial<ProviderSettingEntry>;
  const provider = typeof entry.provider === "string" ? entry.provider.trim() : "";
  const apiUrl = typeof entry.apiUrl === "string" ? entry.apiUrl.trim() : "";
  const apiKey = typeof entry.apiKey === "string" ? entry.apiKey.trim() : "";
  const modelDefinitions = normalizeModelDefinitions(entry.modelDefinitions);
  const modelDefinitionIds = new Set(modelDefinitions.map((model) => model.id));
  const modelIds = Array.isArray(entry.modelIds)
    ? entry.modelIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => modelDefinitionIds.has(id))
    : modelDefinitions.map((model) => model.id);

  const syncedModelDefinitions = modelDefinitions.filter((model) =>
    modelIds.includes(model.id),
  );

  // 中文注释：provider/apiUrl/apiKey/modelIds/modelDefinitions 任意缺失都视为无效配置。
  if (
    !provider ||
    !apiUrl ||
    !apiKey ||
    modelIds.length === 0 ||
    syncedModelDefinitions.length === 0
  ) {
    return null;
  }

  return {
    key: row.key,
    provider,
    apiUrl,
    apiKey,
    modelIds,
    modelDefinitions: syncedModelDefinitions,
    updatedAt: row.updatedAt,
  };
}

const CAPABILITY_ALIASES: Record<string, ModelCapabilityId[]> = {
  text: ["text_input", "text_output"],
  vision_input: ["image_input"],
  vision_output: ["image_output"],
};

const SUPPORTED_CAPABILITIES = new Set<ModelCapabilityId>([
  "text_input",
  "text_output",
  "image_input",
  "image_output",
  "video_input",
  "video_output",
  "audio_input",
  "audio_output",
  "reasoning",
  "tools",
  "rerank",
  "embedding",
  "structured_output",
]);

function normalizeCapabilities(raw: unknown): ModelCapabilityId[] {
  if (!Array.isArray(raw)) return [];
  const normalized: ModelCapabilityId[] = [];
  const seen = new Set<ModelCapabilityId>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const mapped = CAPABILITY_ALIASES[trimmed] ?? [trimmed as ModelCapabilityId];
    // 中文注释：统一转换旧能力字段，并过滤掉未支持的标记。
    for (const capability of mapped) {
      if (!SUPPORTED_CAPABILITIES.has(capability)) continue;
      if (seen.has(capability)) continue;
      seen.add(capability);
      normalized.push(capability);
    }
  }
  return normalized;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalize model definitions from provider settings.
 */
function normalizeModelDefinitions(value: unknown): ModelDefinition[] {
  if (!Array.isArray(value)) return [];
  const models: ModelDefinition[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const model = item as ModelDefinition;
    if (typeof model.id !== "string" || !model.id.trim()) continue;
    const capability = normalizeCapabilities(model.capability);
    if (capability.length === 0) continue;
    if (typeof model.maxContextK !== "number" || !Number.isFinite(model.maxContextK)) continue;
    const priceTextInput =
      readFiniteNumber((model as ModelDefinition).priceTextInputPerMillion) ??
      readFiniteNumber((model as { priceInPerMillion?: number }).priceInPerMillion);
    const priceTextOutput =
      readFiniteNumber((model as ModelDefinition).priceTextOutputPerMillion) ??
      readFiniteNumber((model as { priceOutPerMillion?: number }).priceOutPerMillion);
    if (typeof priceTextInput !== "number" || typeof priceTextOutput !== "number") continue;
    if (typeof model.currencySymbol !== "string") continue;
    models.push({
      id: model.id.trim(),
      capability,
      maxContextK: model.maxContextK,
      priceTextInputPerMillion: priceTextInput,
      priceTextOutputPerMillion: priceTextOutput,
      priceImageInputPerMillion: readFiniteNumber(model.priceImageInputPerMillion),
      priceImageOutputPerMillion: readFiniteNumber(model.priceImageOutputPerMillion),
      priceVideoInputPerMillion: readFiniteNumber(model.priceVideoInputPerMillion),
      priceVideoOutputPerMillion: readFiniteNumber(model.priceVideoOutputPerMillion),
      priceAudioInputPerMillion: readFiniteNumber(model.priceAudioInputPerMillion),
      priceAudioOutputPerMillion: readFiniteNumber(model.priceAudioOutputPerMillion),
      cachedTextInputPerMillion:
        readFiniteNumber(model.cachedTextInputPerMillion) ??
        readFiniteNumber((model as { cachedInputPerMillion?: number }).cachedInputPerMillion),
      cachedImageInputPerMillion: readFiniteNumber(model.cachedImageInputPerMillion),
      cachedVideoInputPerMillion: readFiniteNumber(model.cachedVideoInputPerMillion),
      cachedAudioInputPerMillion: readFiniteNumber(model.cachedAudioInputPerMillion),
      currencySymbol: model.currencySymbol,
    });
  }
  return models;
}

/** Load provider settings for server usage (sorted by latest update). */
export async function getProviderSettings(): Promise<ProviderSettingEntry[]> {
  const rows = await prisma.setting.findMany({
    where: { category: "provider" },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map((row) => normalizeProviderSettingRow(row))
    .filter((row): row is ProviderSettingEntry => Boolean(row));
}

/** Return WEB + PUBLIC settings with secret masking for UI. */
export async function getSettingsForWeb() {
  const defs = Object.values(ServerSettingDefs);
  const [knownSettings, providerSettings] = await Promise.all([
    getSettingsByDefs(defs, { maskSecret: true }),
    getProviderSettingsForWeb({ maskSecret: true }),
  ]);
  return [...knownSettings, ...providerSettings];
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
export async function setSettingValue(
  key: string,
  value: unknown,
  category?: string,
) {
  const def = getSettingDef(key, category);
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

/** Upsert setting value from web. */
export async function setSettingValueFromWeb(
  key: string,
  value: unknown,
  category?: string,
) {
  const def = getSettingDef(key, category);
  if (category && def.category && category !== def.category) {
    throw new Error("Setting category mismatch");
  }
  await setSettingValue(key, value, category);
}

/** Delete setting value from web. */
export async function deleteSettingValueFromWeb(key: string, category?: string) {
  const def = getSettingDef(key, category);
  if (category && def.category && category !== def.category) {
    throw new Error("Setting category mismatch");
  }
  const resolvedCategory = resolveSettingCategory(def, category);
  const existing = await findSettingRow(key, resolvedCategory);
  if (!existing) return;
  await prisma.setting.delete({ where: { id: existing.id } }).catch(() => null);
}
