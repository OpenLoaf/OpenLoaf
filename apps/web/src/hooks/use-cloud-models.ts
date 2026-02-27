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

import { useEffect } from "react";
import { create } from "zustand";
import type { ModelDefinition } from "@openloaf/api/common";
import { resolveServerUrl } from "@/utils/server-url";
import { getAccessToken } from "@/lib/saas-auth";

type RefreshCloudModelOptions = {
  /** Force bypass server cache. */
  force?: boolean;
};

export type CloudModelsUpdatedAtData = {
  /** Chat model updated-at. */
  chatUpdatedAt: string;
  /** Image model updated-at. */
  imageUpdatedAt: string;
  /** Video model updated-at. */
  videoUpdatedAt: string;
  /** Latest model updated-at. */
  latestUpdatedAt: string;
};

type CloudModelState = {
  /** Cloud model list. */
  models: ModelDefinition[];
  /** Cloud model list updated-at. */
  updatedAt: string;
  /** Whether the list has been loaded at least once. */
  loaded: boolean;
  /** Loading flag to avoid duplicate requests. */
  loading: boolean;
  /** Load cloud models if not loaded. */
  load: () => Promise<void>;
  /** Force refresh cloud models. */
  refresh: (options?: RefreshCloudModelOptions) => Promise<void>;
};

type CloudModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Cloud model list payload. */
  data: ModelDefinition[];
  /** Cloud model list updated-at. */
  updatedAt?: string;
};

type CloudModelsUpdatedAtResponse = {
  /** Response success flag. */
  success: boolean;
  /** Updated-at aggregate payload. */
  data?: CloudModelsUpdatedAtData;
};

type CloudModelFetchResult = {
  /** Cloud model list. */
  models: ModelDefinition[];
  /** List updated-at value. */
  updatedAt: string;
};

/** Build cloud model request URL with optional query. */
function buildCloudModelRequestUrl(baseUrl: string, options?: RefreshCloudModelOptions): string {
  const path = "/llm/models";
  if (!baseUrl) {
    return options?.force ? `${path}?force=1` : path;
  }
  const url = new URL(path, baseUrl);
  if (options?.force) {
    url.searchParams.set("force", "1");
  }
  return url.toString();
}

/** Fetch cloud model list from server. */
async function fetchCloudModels(
  baseUrl: string,
  options?: RefreshCloudModelOptions,
): Promise<CloudModelFetchResult> {
  const requestUrl = buildCloudModelRequestUrl(baseUrl, options);
  const token = await getAccessToken();
  if (!token) return { models: [], updatedAt: "" };
  const response = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    // 中文注释：未登录或请求失败时返回空列表。
    return { models: [], updatedAt: "" };
  }
  const payload = (await response.json().catch(() => null)) as CloudModelResponse | null;
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    return { models: [], updatedAt: "" };
  }
  return {
    models: payload.data,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}

/** Fetch cloud model updated-at aggregate payload. */
export async function fetchCloudModelsUpdatedAt(): Promise<CloudModelsUpdatedAtData | null> {
  const baseUrl = resolveServerUrl();
  const requestUrl = baseUrl
    ? new URL("/llm/models/updated-at", baseUrl).toString()
    : "/llm/models/updated-at";
  const token = await getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(requestUrl, { headers });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as CloudModelsUpdatedAtResponse | null;
  if (!payload || payload.success !== true || !payload.data) return null;
  const data = payload.data;
  if (
    typeof data.chatUpdatedAt !== "string" ||
    typeof data.imageUpdatedAt !== "string" ||
    typeof data.videoUpdatedAt !== "string" ||
    typeof data.latestUpdatedAt !== "string"
  ) {
    return null;
  }
  return data;
}

const useCloudModelStore = create<CloudModelState>((set, get) => ({
  models: [],
  updatedAt: "",
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    await get().refresh();
  },
  refresh: async (options = {}) => {
    if (get().loading) return;
    set({ loading: true });
    const baseUrl = resolveServerUrl();
    try {
      const result = await fetchCloudModels(baseUrl, options);
      set({ models: result.models, updatedAt: result.updatedAt, loaded: true, loading: false });
    } catch {
      set((prev) => ({ models: prev.models, updatedAt: prev.updatedAt, loaded: true, loading: false }));
    }
  },
}));

/** Refresh cloud models from outside React (e.g. after login). */
export function refreshCloudModels(options?: RefreshCloudModelOptions) {
  return useCloudModelStore.getState().refresh(options);
}

/** React hook for cloud model list. */
export function useCloudModels() {
  const models = useCloudModelStore((state) => state.models);
  const updatedAt = useCloudModelStore((state) => state.updatedAt);
  const loaded = useCloudModelStore((state) => state.loaded);
  const loading = useCloudModelStore((state) => state.loading);
  const load = useCloudModelStore((state) => state.load);
  const refresh = useCloudModelStore((state) => state.refresh);

  useEffect(() => {
    if (loaded) return;
    void load();
  }, [loaded, load]);

  return {
    models,
    updatedAt,
    loaded,
    loading,
    refresh,
  };
}
