/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import type { AiModel } from "@openloaf-saas/sdk";

const EMPTY_MODELS: AiModel[] = [];

/**
 * @deprecated v1 media models API 已废弃，待迁移到 v3 capabilities。
 * 当前返回空数据，不发起网络请求。
 */
export function useMediaModels() {
  return {
    imageModels: EMPTY_MODELS,
    videoModels: EMPTY_MODELS,
    imageUpdatedAt: "",
    videoUpdatedAt: "",
    loaded: true,
    loading: false,
    refresh: async (_options?: { force?: boolean; kinds?: string[] }) => {},
  };
}
