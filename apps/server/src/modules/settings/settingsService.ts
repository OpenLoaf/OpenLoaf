import prisma from "@teatime-ai/db";
import type { SettingDef, SettingScope } from "@teatime-ai/api/types/setting";
import { ServerSettingDefs } from "@/settings/settingDefs";

type SettingItem = {
  key: string;
  value: unknown;
  scope: SettingScope;
  secret: boolean;
  category?: string;
  isReadonly: boolean;
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
      scope: "PUBLIC",
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
      scope: def.scope,
      secret: Boolean(def.secret),
      category: def.category,
      isReadonly: row?.isReadonly ?? false,
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
      scope: row.type as SettingScope,
      secret: row.secret,
      category: row.category,
      isReadonly: row.isReadonly,
    } satisfies SettingItem;
  });
}

/** Return WEB + PUBLIC settings with secret masking for UI. */
export async function getSettingsForWeb() {
  const defs = Object.values(ServerSettingDefs).filter(
    (def) => def.scope === "WEB" || def.scope === "PUBLIC",
  );
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
    type: def.scope as any,
    category: resolvedCategory,
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

/** Upsert setting value from web, reject server-only scope. */
export async function setSettingValueFromWeb(
  key: string,
  value: unknown,
  category?: string,
) {
  const def = getSettingDef(key, category);
  if (category && def.category && category !== def.category) {
    throw new Error("Setting category mismatch");
  }
  if (def.scope === "SERVER") {
    throw new Error("Setting is server-only");
  }
  await setSettingValue(key, value, category);
}

/** Delete setting value from web, rejects server-only scope. */
export async function deleteSettingValueFromWeb(key: string, category?: string) {
  const def = getSettingDef(key, category);
  if (category && def.category && category !== def.category) {
    throw new Error("Setting category mismatch");
  }
  if (def.scope === "SERVER") {
    throw new Error("Setting is server-only");
  }
  const resolvedCategory = resolveSettingCategory(def, category);
  const existing = await findSettingRow(key, resolvedCategory);
  if (!existing) return;
  await prisma.setting.delete({ where: { id: existing.id } }).catch(() => null);
}
