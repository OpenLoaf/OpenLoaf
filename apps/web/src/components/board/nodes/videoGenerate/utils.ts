import type { ModelParameterDefinition } from "@openloaf/api/common";

/** Normalize the stored value to a plain text string. */
export function normalizeTextValue(value?: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Check whether a parameter value is empty. */
export function isEmptyParamValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** Resolve parameter defaults based on model definition. */
export function resolveParameterDefaults(
  fields: ModelParameterDefinition[],
  input: Record<string, string | number | boolean> | undefined
) {
  const raw = input ?? {};
  const resolved: Record<string, string | number | boolean> = { ...raw };
  let changed = false;
  for (const field of fields) {
    const value = raw[field.key];
    if (!isEmptyParamValue(value)) continue;
    if (field.default !== undefined) {
      resolved[field.key] = field.default;
      changed = true;
    }
  }
  return { resolved, changed };
}
