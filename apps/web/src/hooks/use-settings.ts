"use client";

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import type { SettingDef } from "@teatime-ai/api/types/setting";
import { trpcClient } from "@/utils/trpc";

type SettingsState = {
  values: Record<string, unknown>;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  setValue: (key: string, value: unknown) => Promise<void>;
};

const useSettingsStore = create<SettingsState>((set, get) => ({
  values: {},
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true });
    try {
      const list = await trpcClient.settings.getAll.query();
      const nextValues: Record<string, unknown> = {};
      for (const item of list) {
        nextValues[item.key] = item.value;
      }
      set({ values: nextValues, loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  setValue: async (key, value) => {
    set((state) => ({ values: { ...state.values, [key]: value } }));
    await trpcClient.settings.set.mutate({ key, value });
  },
}));

/** Trigger settings loading at least once. */
export function ensureSettingsLoaded() {
  void useSettingsStore.getState().load();
}

/** Read setting value from store with default fallback. */
export function getSettingValue<T>(def: SettingDef<T>): T {
  const state = useSettingsStore.getState();
  const value = state.values[def.key];
  return (value ?? def.defaultValue) as T;
}

/** React hook for a single setting with setter. */
export function useSetting<T>(def: SettingDef<T>) {
  const value = useSettingsStore((state) => state.values[def.key]) ?? def.defaultValue;
  const loaded = useSettingsStore((state) => state.loaded);
  const load = useSettingsStore((state) => state.load);

  useEffect(() => {
    if (loaded) return;
    void load();
  }, [loaded, load]);

  const setValue = useCallback(
    async (next: T) => {
      await useSettingsStore.getState().setValue(def.key, next);
    },
    [def.key],
  );

  return {
    value: value as T,
    setValue,
    loaded,
  };
}
