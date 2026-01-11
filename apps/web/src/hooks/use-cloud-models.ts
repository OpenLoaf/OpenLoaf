"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { ModelDefinition } from "@tenas-ai/api/common";
import { resolveServerUrl } from "@/utils/server-url";

type CloudModelState = {
  /** Cloud model list. */
  models: ModelDefinition[];
  /** Whether the list has been loaded at least once. */
  loaded: boolean;
  /** Loading flag to avoid duplicate requests. */
  loading: boolean;
  /** Load cloud models if not loaded. */
  load: () => Promise<void>;
  /** Force refresh cloud models. */
  refresh: () => Promise<void>;
};

type CloudModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Cloud model list payload. */
  data: ModelDefinition[];
};

/** Fetch cloud model list from server. */
async function fetchCloudModels(baseUrl: string): Promise<ModelDefinition[]> {
  const requestUrl = baseUrl ? new URL("/llm/models", baseUrl).toString() : "/llm/models";
  const response = await fetch(requestUrl);
  if (!response.ok) {
    // 中文注释：未登录或请求失败时返回空列表。
    return [];
  }
  const payload = (await response.json().catch(() => null)) as CloudModelResponse | null;
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    return [];
  }
  return payload.data;
}

const useCloudModelStore = create<CloudModelState>((set, get) => ({
  models: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    await get().refresh();
  },
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    const baseUrl = resolveServerUrl();
    try {
      const models = await fetchCloudModels(baseUrl);
      set({ models, loaded: true, loading: false });
    } catch {
      set({ models: [], loaded: true, loading: false });
    }
  },
}));

/** React hook for cloud model list. */
export function useCloudModels() {
  const models = useCloudModelStore((state) => state.models);
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
    loaded,
    loading,
    refresh,
  };
}
