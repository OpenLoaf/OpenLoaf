"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";

type AgentDetail = {
  name: string;
  description: string;
  icon: string;
  modelLocalIds: string[];
  modelCloudIds: string[];
  auxiliaryModelSource: string;
  auxiliaryModelLocalIds: string[];
  auxiliaryModelCloudIds: string[];
  imageModelIds: string[];
  videoModelIds: string[];
  toolIds: string[];
  skills: string[];
  allowSubAgents: boolean;
  maxDepth: number;
  systemPrompt: string;
  path: string;
  folderName: string;
  scope: "workspace" | "project" | "global";
};

/** Resolve and update the master agent model (workspace-scoped). */
export function useMainAgentModel() {
  const { basic } = useBasicConfig();
  const agentsQuery = useQuery(trpc.settings.getAgents.queryOptions());
  const masterAgent = useMemo(() => {
    const list = (agentsQuery.data ?? []) as Array<{
      folderName: string;
      isSystem: boolean;
      scope: "workspace" | "project" | "global";
      path: string;
    }>;
    return list.find(
      (agent) =>
        agent.isSystem && agent.folderName === "master" && agent.scope === "workspace",
    );
  }, [agentsQuery.data]);

  const detailQuery = useQuery({
    ...trpc.settings.getAgentDetail.queryOptions(
      masterAgent
        ? { agentPath: masterAgent.path, scope: "workspace" }
        : { agentPath: "", scope: "workspace" },
    ),
    enabled: Boolean(masterAgent?.path),
  });

  const saveMutation = useMutation(
    trpc.settings.saveAgent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        });
        if (masterAgent?.path) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgentDetail.queryOptions({
              agentPath: masterAgent.path,
              scope: "workspace",
            }).queryKey,
          });
        }
      },
    }),
  );

  const chatSource = basic.chatSource === "cloud" ? "cloud" : "local";

  const normalizeIds = useCallback((value: string[]) => {
    const next = value
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return Array.from(new Set(next));
  }, []);

  /** Save master agent config with partial updates. */
  const updateMasterAgent = useCallback(
    (patch: Partial<AgentDetail>) => {
      const detail = detailQuery.data as AgentDetail | undefined;
      if (!detail) return;
      const nextModelLocalIds = Array.isArray(patch.modelLocalIds)
        ? patch.modelLocalIds
        : detail.modelLocalIds;
      const nextModelCloudIds = Array.isArray(patch.modelCloudIds)
        ? patch.modelCloudIds
        : detail.modelCloudIds;
      const nextAuxiliaryModelSource =
        typeof patch.auxiliaryModelSource === "string"
          ? patch.auxiliaryModelSource
          : detail.auxiliaryModelSource;
      const nextAuxiliaryModelLocalIds = Array.isArray(
        patch.auxiliaryModelLocalIds
      )
        ? patch.auxiliaryModelLocalIds
        : detail.auxiliaryModelLocalIds;
      const nextAuxiliaryModelCloudIds = Array.isArray(
        patch.auxiliaryModelCloudIds
      )
        ? patch.auxiliaryModelCloudIds
        : detail.auxiliaryModelCloudIds;
      const nextImageModelIds = Array.isArray(patch.imageModelIds)
        ? patch.imageModelIds
        : detail.imageModelIds;
      const nextVideoModelIds = Array.isArray(patch.videoModelIds)
        ? patch.videoModelIds
        : detail.videoModelIds;
      const nextToolIds = Array.isArray(patch.toolIds)
        ? patch.toolIds
        : detail.toolIds;
      const nextSystemPrompt =
        typeof patch.systemPrompt === "string"
          ? patch.systemPrompt
          : detail.systemPrompt;
      saveMutation.mutate({
        scope: "workspace",
        agentPath: detail.path,
        name: patch.name ?? detail.name,
        description: patch.description ?? detail.description,
        icon: patch.icon ?? detail.icon,
        modelLocalIds: normalizeIds(nextModelLocalIds),
        modelCloudIds: normalizeIds(nextModelCloudIds),
        auxiliaryModelSource: nextAuxiliaryModelSource,
        auxiliaryModelLocalIds: normalizeIds(nextAuxiliaryModelLocalIds),
        auxiliaryModelCloudIds: normalizeIds(nextAuxiliaryModelCloudIds),
        imageModelIds: normalizeIds(nextImageModelIds),
        videoModelIds: normalizeIds(nextVideoModelIds),
        toolIds: normalizeIds(nextToolIds),
        skills: patch.skills ?? detail.skills,
        allowSubAgents: patch.allowSubAgents ?? detail.allowSubAgents,
        maxDepth: patch.maxDepth ?? detail.maxDepth,
        systemPrompt: nextSystemPrompt || undefined,
      });
    },
    [detailQuery.data, normalizeIds, saveMutation],
  );

  /** Update master chat model ids (empty = Auto). */
  const setModelIds = useCallback(
    (nextIds: string[]) => {
      const normalized = normalizeIds(nextIds);
      if (chatSource === "cloud") {
        updateMasterAgent({ modelCloudIds: normalized });
        return;
      }
      updateMasterAgent({ modelLocalIds: normalized });
    },
    [chatSource, normalizeIds, updateMasterAgent],
  );

  /** Update master auxiliary model ids (empty = Auto). */
  const setAuxiliaryModelIds = useCallback(
    (nextIds: string[]) => {
      const normalized = normalizeIds(nextIds);
      const detail = detailQuery.data as AgentDetail | undefined;
      const source =
        detail?.auxiliaryModelSource === "cloud" ? "cloud" : "local";
      if (source === "cloud") {
        updateMasterAgent({ auxiliaryModelCloudIds: normalized });
        return;
      }
      updateMasterAgent({ auxiliaryModelLocalIds: normalized });
    },
    [detailQuery.data, normalizeIds, updateMasterAgent],
  );

  /** Update master image model ids (empty = Auto). */
  const setImageModelIds = useCallback(
    (nextIds: string[]) => {
      updateMasterAgent({ imageModelIds: normalizeIds(nextIds) });
    },
    [normalizeIds, updateMasterAgent],
  );

  /** Update master video model ids (empty = Auto). */
  const setVideoModelIds = useCallback(
    (nextIds: string[]) => {
      updateMasterAgent({ videoModelIds: normalizeIds(nextIds) });
    },
    [normalizeIds, updateMasterAgent],
  );

  return {
    masterAgent,
    modelIds:
      chatSource === "cloud"
        ? (detailQuery.data as AgentDetail | undefined)?.modelCloudIds ?? []
        : (detailQuery.data as AgentDetail | undefined)?.modelLocalIds ?? [],
    setModelIds,
    auxiliaryModelIds:
      (() => {
        const detail = detailQuery.data as AgentDetail | undefined;
        if (!detail) return [];
        const source =
          detail.auxiliaryModelSource === "cloud" ? "cloud" : "local";
        return source === "cloud"
          ? detail.auxiliaryModelCloudIds
          : detail.auxiliaryModelLocalIds;
      })(),
    setAuxiliaryModelIds,
    setImageModelIds,
    setVideoModelIds,
    detail: detailQuery.data as AgentDetail | undefined,
    isLoading:
      agentsQuery.isLoading ||
      detailQuery.isLoading ||
      saveMutation.isPending,
    error: agentsQuery.error ?? detailQuery.error,
  };
}
