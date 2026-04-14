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

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient, skipToken } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { ToolApprovalRulesList } from "@/components/setting/shared/ToolApprovalRulesList";
import type { ToolApprovalRules } from "@openloaf/api/types/toolApproval";

type ProjectToolApprovalSettingsProps = {
  projectId?: string;
};

export function ProjectToolApprovalSettings({ projectId }: ProjectToolApprovalSettingsProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  const aiSettingsOptions = trpc.project.getAiSettings.queryOptions(
    projectId ? { projectId } : skipToken,
  );
  const aiSettingsQuery = useQuery(aiSettingsOptions);

  const removeRuleMutation = useMutation({
    ...trpc.project.removeToolApprovalRule.mutationOptions(),
    onSuccess: () => {
      if (!projectId) return;
      queryClient.invalidateQueries({ queryKey: aiSettingsOptions.queryKey });
    },
  });

  const handleRemove = useCallback(
    async (rule: string, behavior: "allow" | "deny") => {
      if (!projectId) return;
      try {
        await removeRuleMutation.mutateAsync({ projectId, rule, behavior });
      } catch {
        toast.error(t("toolApproval.removeFailed"));
      }
    },
    [projectId, removeRuleMutation, t],
  );

  if (!projectId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t("toolApproval.projectRequired")}
      </div>
    );
  }

  if (aiSettingsQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t("toolApproval.loading")}</div>;
  }

  const rules: ToolApprovalRules = aiSettingsQuery.data?.aiSettings?.toolApprovalRules ?? {};

  return <ToolApprovalRulesList rules={rules} onRemove={handleRemove} scope="project" />;
}
