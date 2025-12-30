"use client";

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import type { SettingDef } from "@teatime-ai/api/types/setting";
import { trpcClient } from "@/utils/trpc";

type SettingsState = {
  values: Record<string, unknown>;
  items: Array<{
    key: string;
    value: unknown;
    category?: string;
  }>;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  /** Reload settings from server. */
  refresh: () => Promise<void>;
  setValue: (key: string, value: unknown, category?: string) => Promise<void>;
  removeValue: (key: string, category?: string) => Promise<void>;
};

function buildSettingMapKey(key: string, category?: string) {
  return `${category ?? "general"}::${key}`;
}

const useSettingsStore = create<SettingsState>((set, get) => ({
  values: {},
  items: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true });
    try {
      const list = await trpcClient.settings.getAll.query();
      const nextValues: Record<string, unknown> = {};
      for (const item of list) {
        const mapKey = buildSettingMapKey(item.key, item.category);
        nextValues[mapKey] = item.value;
      }
      set({ values: nextValues, items: list, loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const list = await trpcClient.settings.getAll.query();
      const nextValues: Record<string, unknown> = {};
      for (const item of list) {
        const mapKey = buildSettingMapKey(item.key, item.category);
        nextValues[mapKey] = item.value;
      }
      set({ values: nextValues, items: list, loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  setValue: async (key, value, category) => {
    const mapKey = buildSettingMapKey(key, category);
    set((state) => {
      const nextItems = state.items.filter(
        (item) => item.key !== key || (item.category ?? "general") !== (category ?? "general"),
      );
      nextItems.push({ key, value, category });
      return { values: { ...state.values, [mapKey]: value }, items: nextItems };
    });
    await trpcClient.settings.set.mutate({ key, value, category });
  },
  removeValue: async (key, category) => {
    const mapKey = buildSettingMapKey(key, category);
    set((state) => {
      const next = { ...state.values };
      delete next[mapKey];
      const nextItems = state.items.filter(
        (item) => item.key !== key || (item.category ?? "general") !== (category ?? "general"),
      );
      return { values: next, items: nextItems };
    });
    await trpcClient.settings.remove.mutate({ key, category });
  },
}));

/** Trigger settings loading at least once. */
export function ensureSettingsLoaded() {
  void useSettingsStore.getState().load();
}

/** Read setting value from store with default fallback. */
export function getSettingValue<T>(def: SettingDef<T>): T {
  const state = useSettingsStore.getState();
  const value = state.values[buildSettingMapKey(def.key, def.category)];
  return (value ?? def.defaultValue) as T;
}

/** React hook for a single setting with setter. */
export function useSetting<T>(def: SettingDef<T>) {
  const value =
    useSettingsStore((state) => state.values[buildSettingMapKey(def.key, def.category)]) ??
    def.defaultValue;
  const loaded = useSettingsStore((state) => state.loaded);
  const load = useSettingsStore((state) => state.load);

  useEffect(() => {
    if (loaded) return;
    void load();
  }, [loaded, load]);

  const setValue = useCallback(
    async (next: T) => {
      await useSettingsStore.getState().setValue(def.key, next, def.category);
    },
    [def.key, def.category],
  );

  return {
    value: value as T,
    setValue,
    loaded,
  };
}

/** React hook for all settings with setter. */
export function useSettingsValues() {
  const values = useSettingsStore((state) => state.values);
  const items = useSettingsStore((state) => state.items);
  const loaded = useSettingsStore((state) => state.loaded);
  const load = useSettingsStore((state) => state.load);
  const refresh = useSettingsStore((state) => state.refresh);
  const setValue = useSettingsStore((state) => state.setValue);
  const removeValue = useSettingsStore((state) => state.removeValue);

  useEffect(() => {
    if (loaded) return;
    void load();
  }, [loaded, load]);

  return {
    values,
    items,
    setValue,
    removeValue,
    refresh,
    loaded,
  };
}

/** Update a setting without subscribing to store updates. */
export async function setSettingValue<T>(def: SettingDef<T>, value: T) {
  // 直接写入设置并同步到服务端，避免在非必要位置订阅 store。
  await useSettingsStore.getState().setValue(def.key, value, def.category);
}
