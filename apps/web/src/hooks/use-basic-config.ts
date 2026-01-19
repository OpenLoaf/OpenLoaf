"use client";

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
  modelDefaultChatModelId: "codex-cli:gpt-5.2-codex",
  appProjectRule: "按项目划分",
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

  const setBasic = async (update: BasicConfigUpdate) => {
    await mutation.mutateAsync(update);
  };

  return {
    basic,
    setBasic,
    isLoading: query.isLoading,
  };
}
