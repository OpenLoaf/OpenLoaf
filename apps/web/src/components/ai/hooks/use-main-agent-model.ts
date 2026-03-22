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

import { useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useTabActive } from "@/components/layout/TabActiveContext";

const EMPTY_IDS: string[] = [];

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
  codeModelIds: string[];
  toolIds: string[];
  skills: string[];
  allowSubAgents: boolean;
  maxDepth: number;
  systemPrompt: string;
  path: string;
  folderName: string;
  scope: "project" | "global";
};

/**
 * Resolve and update the master agent model (global/project scoped).
 * @param projectId Optional project id for resolving project-scoped master agent.
 */
export function useMainAgentModel(projectId?: string) {
  const { basic } = useBasicConfig();
  const isTabActive = useTabActive();
  const agentsQueryInput = projectId ? { projectId } : undefined;
  const agentsQuery = useQuery({
    ...trpc.settings.getAgents.queryOptions(agentsQueryInput),
    staleTime: 5 * 60 * 1000,
    enabled: isTabActive,
  });
  const masterAgent = useMemo(() => {
    const list = (agentsQuery.data ?? []) as Array<{
      folderName: string;
      scope: "project" | "global";
      path: string;
      isEnabled: boolean;
      isInherited: boolean;
    }>;
    if (projectId) {
      // 中文注释：优先使用当前项目的 master（非继承且启用）。
      const projectMaster = list.find(
        (agent) =>
          agent.folderName === "master" &&
          agent.scope === "project" &&
          !agent.isInherited &&
          agent.isEnabled,
      );
      if (projectMaster) return projectMaster;
    }
    // 中文注释：项目未命中时回退全局 master。
    return list.find(
      (agent) =>
        agent.folderName === "master" &&
        agent.scope === "global" &&
        agent.isEnabled,
    );
  }, [agentsQuery.data, projectId]);

  const detailQuery = useQuery({
    ...trpc.settings.getAgentDetail.queryOptions(
      masterAgent
        ? { agentPath: masterAgent.path, scope: masterAgent.scope }
        : { agentPath: "", scope: "global" },
    ),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(masterAgent?.path),
  });

  const saveMutation = useMutation(
    trpc.settings.saveAgent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions(agentsQueryInput).queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        });
        if (masterAgent?.path) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgentDetail.queryOptions({
              agentPath: masterAgent.path,
              scope: masterAgent.scope,
            }).queryKey,
          });
        }
      },
    }),
  );

  const chatSource = basic.chatSource === "cloud" ? "cloud" : "local";

  const normalizeIds = useCallback((value?: string[] | null) => {
    if (!Array.isArray(value)) return [];
    const next = value
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return Array.from(new Set(next));
  }, []);

  const detailQueryKeyRef = useRef<unknown[] | undefined>(undefined);
  if (masterAgent?.path) {
    detailQueryKeyRef.current = trpc.settings.getAgentDetail.queryOptions({
      agentPath: masterAgent.path,
      scope: masterAgent.scope,
    }).queryKey;
  }

  /** Save master agent config with partial updates. Auto-creates master agent if missing. */
  const updateMasterAgent = useCallback(
    (patch: Partial<AgentDetail>) => {
      const detail = detailQuery.data as AgentDetail | undefined;
      if (!detail) {
        // Master agent 不存在 — 自动创建一个。
        const scope = projectId ? "project" : "global";
        saveMutation.mutate({
          scope,
          projectId: scope === "project" ? projectId : undefined,
          name: "master",
          description: "",
          icon: "sparkles",
          modelLocalIds: normalizeIds(patch.modelLocalIds),
          modelCloudIds: normalizeIds(patch.modelCloudIds),
          auxiliaryModelSource: patch.auxiliaryModelSource ?? "",
          auxiliaryModelLocalIds: normalizeIds(patch.auxiliaryModelLocalIds),
          auxiliaryModelCloudIds: normalizeIds(patch.auxiliaryModelCloudIds),
          imageModelIds: normalizeIds(patch.imageModelIds),
          videoModelIds: normalizeIds(patch.videoModelIds),
          codeModelIds: normalizeIds(patch.codeModelIds),
          toolIds: [],
          skills: [],
          allowSubAgents: true,
          maxDepth: 3,
        });
        return;
      }
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
      const nextCodeModelIds = Array.isArray(patch.codeModelIds)
        ? patch.codeModelIds
        : detail.codeModelIds;
      const nextToolIds = Array.isArray(patch.toolIds)
        ? patch.toolIds
        : detail.toolIds;
      const nextSystemPrompt =
        typeof patch.systemPrompt === "string"
          ? patch.systemPrompt
          : detail.systemPrompt;

      const normalizedLocalIds = normalizeIds(nextModelLocalIds);
      const normalizedCloudIds = normalizeIds(nextModelCloudIds);
      const normalizedAuxLocalIds = normalizeIds(nextAuxiliaryModelLocalIds);
      const normalizedAuxCloudIds = normalizeIds(nextAuxiliaryModelCloudIds);
      const normalizedImageIds = normalizeIds(nextImageModelIds);
      const normalizedVideoIds = normalizeIds(nextVideoModelIds);
      const normalizedCodeIds = normalizeIds(nextCodeModelIds);
      const normalizedToolIds = normalizeIds(nextToolIds);

      // 乐观更新 detailQuery 缓存，防止 useEffect 用旧数据覆盖本地状态。
      const detailQKey = detailQueryKeyRef.current;
      if (detailQKey) {
        queryClient.setQueryData(detailQKey, {
          ...detail,
          ...patch,
          modelLocalIds: normalizedLocalIds,
          modelCloudIds: normalizedCloudIds,
          auxiliaryModelSource: nextAuxiliaryModelSource,
          auxiliaryModelLocalIds: normalizedAuxLocalIds,
          auxiliaryModelCloudIds: normalizedAuxCloudIds,
          imageModelIds: normalizedImageIds,
          videoModelIds: normalizedVideoIds,
          codeModelIds: normalizedCodeIds,
          toolIds: normalizedToolIds,
          skills: patch.skills ?? detail.skills,
          allowSubAgents: patch.allowSubAgents ?? detail.allowSubAgents,
          maxDepth: patch.maxDepth ?? detail.maxDepth,
          systemPrompt: nextSystemPrompt || detail.systemPrompt,
        });
      }

      saveMutation.mutate({
        scope: detail.scope,
        projectId: detail.scope === "project" ? projectId : undefined,
        agentPath: detail.path,
        name: patch.name ?? detail.name,
        description: patch.description ?? detail.description,
        icon: patch.icon ?? detail.icon,
        modelLocalIds: normalizedLocalIds,
        modelCloudIds: normalizedCloudIds,
        auxiliaryModelSource: nextAuxiliaryModelSource,
        auxiliaryModelLocalIds: normalizedAuxLocalIds,
        auxiliaryModelCloudIds: normalizedAuxCloudIds,
        imageModelIds: normalizedImageIds,
        videoModelIds: normalizedVideoIds,
        codeModelIds: normalizedCodeIds,
        toolIds: normalizedToolIds,
        skills: patch.skills ?? detail.skills,
        allowSubAgents: patch.allowSubAgents ?? detail.allowSubAgents,
        maxDepth: patch.maxDepth ?? detail.maxDepth,
        systemPrompt: nextSystemPrompt || undefined,
      });
    },
    [detailQuery.data, normalizeIds, projectId, saveMutation],
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

  /** Update master code model ids (empty = Auto). */
  const setCodeModelIds = useCallback(
    (nextIds: string[]) => {
      updateMasterAgent({ codeModelIds: normalizeIds(nextIds) });
    },
    [normalizeIds, updateMasterAgent],
  );

  const detail = detailQuery.data as AgentDetail | undefined;

  const modelIds = useMemo(() => {
    if (!detail) return EMPTY_IDS;
    return chatSource === "cloud" ? detail.modelCloudIds : detail.modelLocalIds;
  }, [chatSource, detail]);

  const auxiliaryModelIds = useMemo(() => {
    if (!detail) return EMPTY_IDS;
    const source =
      detail.auxiliaryModelSource === "cloud" ? "cloud" : "local";
    return source === "cloud"
      ? detail.auxiliaryModelCloudIds
      : detail.auxiliaryModelLocalIds;
  }, [detail]);

  return {
    masterAgent,
    modelIds,
    setModelIds,
    auxiliaryModelIds,
    setAuxiliaryModelIds,
    setImageModelIds,
    setVideoModelIds,
    setCodeModelIds,
    detail,
    isLoading:
      agentsQuery.isLoading ||
      detailQuery.isLoading ||
      saveMutation.isPending,
    error: agentsQuery.error ?? detailQuery.error,
  };
}
