"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import type { BasicConfig, BasicConfigUpdate } from "@tenas-ai/api/types/basic";

const DEFAULT_BASIC_CONFIG: BasicConfig = {
  chatSource: "local",
  activeS3Id: undefined,
  s3AutoUpload: true,
  s3AutoDeleteHours: 2,
  modelResponseLanguage: "zh-CN",
  modelQuality: "medium",
  modelSoundEnabled: true,
  autoSummaryEnabled: true,
  autoSummaryHours: [0, 8, 12, 17],
  uiLanguage: "zh-CN",
  uiFontSize: "medium",
  // UI animation intensity.
  uiAnimationLevel: "high",
  uiTheme: "system",
  uiThemeManual: "light",
  boardDebugEnabled: false,
  // Toggle chat preface viewer button.
  chatPrefaceEnabled: false,
  appLocalStorageDir: "",
  appAutoBackupDir: "",
  appCustomRules: "",
  appNotificationSoundEnabled: true,
  modelDefaultChatModelId: "",
  appProjectRule: "按项目划分",
  toolAllowOutsideScope: false,
  stepUpInitialized: false,
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: "",
  proxyUsername: "",
  proxyPassword: "",
  cliTools: {
    codex: {
      apiUrl: "",
      apiKey: "",
      forceCustomApiKey: false,
    },
    claudeCode: {
      apiUrl: "",
      apiKey: "",
      forceCustomApiKey: false,
    },
    python: {
      apiUrl: "",
      apiKey: "",
      forceCustomApiKey: false,
    },
  },
};

export function useBasicConfig() {
  const query = useQuery({
    ...trpc.settings.getBasic.queryOptions(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const mutation = useMutation(
    trpc.settings.setBasic.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getBasic.queryOptions().queryKey,
        });
      },
    }),
  );

  const basic: BasicConfig = {
    ...DEFAULT_BASIC_CONFIG,
    ...(query.data ?? {}),
  };

  const basicRef = useRef<BasicConfig>(basic);
  const pendingRef = useRef<
    Record<keyof BasicConfig, BasicConfig[keyof BasicConfig] | undefined>
  >({} as Record<keyof BasicConfig, BasicConfig[keyof BasicConfig] | undefined>);

  useEffect(() => {
    basicRef.current = basic;
    const pending = pendingRef.current;
    for (const key of Object.keys(pending) as Array<keyof BasicConfig>) {
      if (basic[key] === pending[key]) {
        delete pending[key];
      }
    }
  }, [basic]);

  const setBasic = useCallback(
    async (update: BasicConfigUpdate) => {
      if (!update) return;
      const entries = Object.entries(update) as Array<
        [keyof BasicConfig, BasicConfig[keyof BasicConfig] | undefined]
      >;
      if (entries.length === 0) return;
      const current = basicRef.current;
      let shouldSend = false;
      for (const [key, value] of entries) {
        if (typeof value === "undefined") continue;
        if (pendingRef.current[key] === value) continue;
        if (current[key] !== value) {
          shouldSend = true;
          break;
        }
      }
      if (!shouldSend) return;
      for (const [key, value] of entries) {
        if (typeof value === "undefined") continue;
        pendingRef.current[key] = value;
      }
      await mutation.mutateAsync(update);
    },
    [mutation],
  );

  return {
    basic,
    setBasic,
    isLoading: query.isLoading,
  };
}
