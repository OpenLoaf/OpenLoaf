"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";

type AgentDetail = {
  name: string;
  description: string;
  icon: string;
  model: string;
  imageModelId: string;
  videoModelId: string;
  capabilities: string[];
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

  /** Save master agent config with partial updates. */
  const updateMasterAgent = useCallback(
    (patch: Partial<AgentDetail>) => {
      const detail = detailQuery.data as AgentDetail | undefined;
      if (!detail) return;
      const nextModel =
        typeof patch.model === "string" ? patch.model : detail.model;
      const nextImageModelId =
        typeof patch.imageModelId === "string"
          ? patch.imageModelId
          : detail.imageModelId;
      const nextVideoModelId =
        typeof patch.videoModelId === "string"
          ? patch.videoModelId
          : detail.videoModelId;
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
        model: nextModel?.trim() ? nextModel.trim() : undefined,
        imageModelId: nextImageModelId?.trim()
          ? nextImageModelId.trim()
          : undefined,
        videoModelId: nextVideoModelId?.trim()
          ? nextVideoModelId.trim()
          : undefined,
        capabilities: patch.capabilities ?? detail.capabilities,
        skills: patch.skills ?? detail.skills,
        allowSubAgents: patch.allowSubAgents ?? detail.allowSubAgents,
        maxDepth: patch.maxDepth ?? detail.maxDepth,
        systemPrompt: nextSystemPrompt || undefined,
      });
    },
    [detailQuery.data, saveMutation],
  );

  /** Update master chat model id (empty = Auto). */
  const setModelId = useCallback(
    (nextId: string) => {
      updateMasterAgent({ model: nextId.trim() });
    },
    [updateMasterAgent],
  );

  /** Update master image model id (empty = Auto). */
  const setImageModelId = useCallback(
    (nextId: string) => {
      updateMasterAgent({ imageModelId: nextId.trim() });
    },
    [updateMasterAgent],
  );

  /** Update master video model id (empty = Auto). */
  const setVideoModelId = useCallback(
    (nextId: string) => {
      updateMasterAgent({ videoModelId: nextId.trim() });
    },
    [updateMasterAgent],
  );

  return {
    masterAgent,
    modelId: (detailQuery.data as AgentDetail | undefined)?.model ?? "",
    setModelId,
    setImageModelId,
    setVideoModelId,
    detail: detailQuery.data as AgentDetail | undefined,
    isLoading:
      agentsQuery.isLoading ||
      detailQuery.isLoading ||
      saveMutation.isPending,
    error: agentsQuery.error ?? detailQuery.error,
  };
}
