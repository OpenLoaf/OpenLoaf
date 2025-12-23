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
function getSettingDef(key: string) {
  const def = settingDefByKey.get(key);
  if (!def) throw new Error(`Unknown setting key: ${key}`);
  return def;
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
  const keys = defs.map((def) => def.key);
  const rows = await prisma.setting.findMany({
    where: { key: { in: keys } },
  });
  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  return defs.map((def) => {
    const row = rowByKey.get(def.key);
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

/** Return WEB + PUBLIC settings with secret masking for UI. */
export async function getSettingsForWeb() {
  const defs = Object.values(ServerSettingDefs).filter(
    (def) => def.scope === "WEB" || def.scope === "PUBLIC",
  );
  return getSettingsByDefs(defs, { maskSecret: true });
}

/** Get setting value for server-side usage. */
export async function getSettingValue<T>(key: string): Promise<T> {
  const def = getSettingDef(key);
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return def.defaultValue as T;
  return parseSettingValue(row.value) as T;
}

/** Upsert setting value without scope restriction (server internal). */
export async function setSettingValue(key: string, value: unknown) {
  const def = getSettingDef(key);
  await prisma.setting.upsert({
    where: { key },
    update: {
      value: serializeSettingValue(value),
      secret: Boolean(def.secret),
      type: def.scope as any,
      category: def.category ?? "general",
    },
    create: {
      key,
      value: serializeSettingValue(value),
      secret: Boolean(def.secret),
      type: def.scope as any,
      category: def.category ?? "general",
    },
  });
}

/** Upsert setting value from web, reject server-only scope. */
export async function setSettingValueFromWeb(key: string, value: unknown) {
  const def = getSettingDef(key);
  if (def.scope === "SERVER") {
    throw new Error("Setting is server-only");
  }
  await setSettingValue(key, value);
}
