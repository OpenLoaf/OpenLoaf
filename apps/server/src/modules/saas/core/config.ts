/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getEnvString } from "@openloaf/config";

/** Resolve SaaS base URL from environment. */
export function getSaasBaseUrl(): string {
  const value = getEnvString(process.env, "OPENLOAF_SAAS_URL");
  if (!value || !value.trim()) {
    // 逻辑：缺失时抛错，便于上层统一处理。
    throw new Error("saas_url_missing");
  }
  // 逻辑：去掉末尾 /，避免拼接重复。
  return value.trim().replace(/\/$/, "");
}

/** Resolve SaaS auth base URL from environment. */
function getSaasAuthBaseUrl(): string {
  const value = getEnvString(process.env, "OPENLOAF_SAAS_AUTH_URL");
  if (!value || !value.trim()) {
    // 逻辑：缺失时抛错，便于上层统一处理。
    throw new Error("saas_auth_url_missing");
  }
  // 逻辑：去掉末尾 /，避免拼接重复。
  return value.trim().replace(/\/$/, "");
}
