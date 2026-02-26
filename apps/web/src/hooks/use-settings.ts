/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { trpcClient } from "@/utils/trpc";

type SettingsState = {
  providerItems: SettingItem[];
  s3ProviderItems: SettingItem[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  /** Reload settings from server. */
  refresh: () => Promise<void>;
  setValue: (key: string, value: unknown, category?: string) => Promise<void>;
  removeValue: (key: string, category?: string) => Promise<void>;
};

type SettingItem = {
  id?: string;
  key: string;
  value: unknown;
  secret?: boolean;
  category?: string;
  isReadonly?: boolean;
  syncToCloud?: boolean;
};

const useSettingsStore = create<SettingsState>((set, get) => ({
  providerItems: [],
  s3ProviderItems: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true });
    try {
      const [providers, s3Providers] = await Promise.all([
        trpcClient.settings.getProviders.query(),
        trpcClient.settings.getS3Providers.query(),
      ]);
      set({
        providerItems: providers,
        s3ProviderItems: s3Providers,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [providers, s3Providers] = await Promise.all([
        trpcClient.settings.getProviders.query(),
        trpcClient.settings.getS3Providers.query(),
      ]);
      set({
        providerItems: providers,
        s3ProviderItems: s3Providers,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
  setValue: async (key, value, category) => {
    set((state) => {
      const resolvedCategory = category ?? "general";
      const isProvider = resolvedCategory === "provider";
      const isS3Provider = resolvedCategory === "s3Provider";
      if (!isProvider && !isS3Provider) return state;
      const pickList = (list: SettingItem[]) =>
        list.filter(
          (item) =>
            item.key !== key || (item.category ?? "general") !== resolvedCategory,
        );
      const preserve = (list: SettingItem[]) =>
        list.find(
          (item) =>
            item.key === key && (item.category ?? "general") === resolvedCategory,
        );
      const nextItem: SettingItem = {
        ...(preserve(isProvider ? state.providerItems : state.s3ProviderItems) ?? {}),
        key,
        value,
        category,
      };
      return {
        providerItems: isProvider ? [...pickList(state.providerItems), nextItem] : state.providerItems,
        s3ProviderItems: isS3Provider
          ? [...pickList(state.s3ProviderItems), nextItem]
          : state.s3ProviderItems,
      };
    });
    await trpcClient.settings.set.mutate({ key, value, category });
  },
  removeValue: async (key, category) => {
    set((state) => {
      const resolvedCategory = category ?? "general";
      const isProvider = resolvedCategory === "provider";
      const isS3Provider = resolvedCategory === "s3Provider";
      if (!isProvider && !isS3Provider) return state;
      const filterList = (list: SettingItem[]) =>
        list.filter(
          (item) =>
            item.key !== key || (item.category ?? "general") !== resolvedCategory,
        );
      return {
        providerItems: isProvider ? filterList(state.providerItems) : state.providerItems,
        s3ProviderItems: isS3Provider ? filterList(state.s3ProviderItems) : state.s3ProviderItems,
      };
    });
    await trpcClient.settings.remove.mutate({ key, category });
  },
}));

/** Trigger settings loading at least once. */
export function ensureSettingsLoaded() {
  void useSettingsStore.getState().load();
}

/** React hook for all settings with setter. */
export function useSettingsValues() {
  const providerItems = useSettingsStore((state) => state.providerItems);
  const s3ProviderItems = useSettingsStore((state) => state.s3ProviderItems);
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
    providerItems,
    s3ProviderItems,
    setValue,
    removeValue,
    refresh,
    loaded,
  };
}
