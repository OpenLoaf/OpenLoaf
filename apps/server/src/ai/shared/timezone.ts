/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/** Resolve IANA timezone from caller-supplied value, falling back to server default. */
export function resolveTimezone(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return resolveServerTimezone();
}

/** Resolve server-side IANA timezone via Intl, then process.env.TZ, then UTC. */
export function resolveServerTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) return resolved;
  } catch {
    // ignore — fall through to env
  }
  return process.env.TZ ?? "UTC";
}
