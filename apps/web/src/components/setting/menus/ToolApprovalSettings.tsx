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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { ToolApprovalRulesList } from "@/components/setting/shared/ToolApprovalRulesList";
import type { ToolApprovalRules } from "@openloaf/api/types/toolApproval";

export function ToolApprovalSettings() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  const rulesOptions = trpc.settings.getToolApprovalRules.queryOptions();
  const rulesQuery = useQuery(rulesOptions);

  const removeRuleMutation = useMutation({
    ...trpc.settings.removeToolApprovalRule.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesOptions.queryKey });
    },
  });

  const handleRemove = useCallback(
    async (rule: string, behavior: "allow" | "deny") => {
      try {
        await removeRuleMutation.mutateAsync({ rule, behavior });
      } catch {
        toast.error(t("toolApproval.removeFailed"));
      }
    },
    [removeRuleMutation, t],
  );

  if (rulesQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t("toolApproval.loading")}</div>;
  }

  const rules: ToolApprovalRules = rulesQuery.data ?? {};

  return <ToolApprovalRulesList rules={rules} onRemove={handleRemove} scope="temp" />;
}
