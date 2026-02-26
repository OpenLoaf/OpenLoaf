/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/** Create a fallback id when randomUUID is unavailable. */
const fallbackId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Resolve a unique base id string. */
const getBaseId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return fallbackId();
};

/** Generate an id with an optional type prefix. */
export const generateId = (type?: string | number) => {
  const baseId = getBaseId();
  return type ? `${type}-${baseId}` : baseId;
};
