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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

type SettingItem = {
  id?: string;
  key: string;
  value: unknown;
  secret?: boolean;
  category?: string;
  isReadonly?: boolean;
  syncToCloud?: boolean;
};

const providersQueryOptions = () => trpc.settings.getProviders.queryOptions();
const s3ProvidersQueryOptions = () => trpc.settings.getS3Providers.queryOptions();

function resolveQueryKeyForCategory(category: string | undefined) {
  const resolved = category ?? "general";
  if (resolved === "provider") return providersQueryOptions().queryKey;
  if (resolved === "s3Provider") return s3ProvidersQueryOptions().queryKey;
  return null;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: providersQueryOptions().queryKey });
  qc.invalidateQueries({ queryKey: s3ProvidersQueryOptions().queryKey });
}

/** Trigger settings prefetch (can be called outside React). */
export function ensureSettingsLoaded() {
  void queryClient.prefetchQuery(providersQueryOptions());
  void queryClient.prefetchQuery(s3ProvidersQueryOptions());
}

/** React hook for all settings with setter. */
export function useSettingsValues() {
  const qc = useQueryClient();

  const providersQuery = useQuery(providersQueryOptions());
  const s3ProvidersQuery = useQuery(s3ProvidersQueryOptions());

  const setMutation = useMutation({
    mutationFn: (vars: { key: string; value: unknown; category?: string }) =>
      trpcClient.settings.set.mutate(vars),
    onMutate: async (vars) => {
      const queryKey = resolveQueryKeyForCategory(vars.category);
      if (!queryKey) return { queryKey: null, previous: undefined };

      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<SettingItem[]>(queryKey);

      if (previous) {
        const resolvedCategory = vars.category ?? "general";
        const filtered = previous.filter(
          (item) =>
            item.key !== vars.key ||
            (item.category ?? "general") !== resolvedCategory,
        );
        const existing = previous.find(
          (item) =>
            item.key === vars.key &&
            (item.category ?? "general") === resolvedCategory,
        );
        const nextItem: SettingItem = {
          ...(existing ?? {}),
          key: vars.key,
          value: vars.value,
          category: vars.category,
        };
        qc.setQueryData<SettingItem[]>(queryKey, [...filtered, nextItem]);
      }

      return { queryKey, previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.queryKey && context.previous) {
        qc.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: () => invalidateAll(qc),
  });

  const removeMutation = useMutation({
    mutationFn: (vars: { key: string; category?: string }) =>
      trpcClient.settings.remove.mutate(vars),
    onMutate: async (vars) => {
      const queryKey = resolveQueryKeyForCategory(vars.category);
      if (!queryKey) return { queryKey: null, previous: undefined };

      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<SettingItem[]>(queryKey);

      if (previous) {
        const resolvedCategory = vars.category ?? "general";
        qc.setQueryData<SettingItem[]>(
          queryKey,
          previous.filter(
            (item) =>
              item.key !== vars.key ||
              (item.category ?? "general") !== resolvedCategory,
          ),
        );
      }

      return { queryKey, previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.queryKey && context.previous) {
        qc.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: () => invalidateAll(qc),
  });

  const setValue = async (key: string, value: unknown, category?: string) => {
    await setMutation.mutateAsync({ key, value, category });
  };

  const removeValue = async (key: string, category?: string) => {
    await removeMutation.mutateAsync({ key, category });
  };

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: providersQueryOptions().queryKey }),
      qc.invalidateQueries({ queryKey: s3ProvidersQueryOptions().queryKey }),
    ]);
  };

  return {
    providerItems: (providersQuery.data ?? []) as SettingItem[],
    s3ProviderItems: (s3ProvidersQuery.data ?? []) as SettingItem[],
    setValue,
    removeValue,
    refresh,
    loaded: providersQuery.isFetched && s3ProvidersQuery.isFetched,
  };
}
