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

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { EmailForwardEditor } from "./EmailForwardEditor";
import { EMAIL_GLASS_PANEL_CLASS } from "./email-style-system";
import { useEmailPageState } from "./use-email-page-state";

type EmailComposeStackPanelProps = {
  panelKey: string;
  tabId: string;
  workspaceId?: string;
};

export default function EmailComposeStackPanel({
  workspaceId,
}: EmailComposeStackPanelProps) {
  const { t } = useTranslation('common');
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const resolvedWorkspaceId = workspaceId ?? workspaceCompatQuery.data?.id;
  const { detail } = useEmailPageState({ workspaceId: resolvedWorkspaceId });

  useEffect(() => {
    if (detail.composeDraft || detail.forwardDraft) return;
    detail.onStartCompose();
  }, [detail.composeDraft, detail.forwardDraft, detail.onStartCompose]);

  if (!detail.composeDraft && !detail.forwardDraft) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 items-center justify-center text-xs text-[#5f6368] dark:text-slate-400",
          EMAIL_GLASS_PANEL_CLASS,
        )}
      >
        {t('email.preparingCompose')}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", EMAIL_GLASS_PANEL_CLASS)}>
      <EmailForwardEditor detail={detail} />
    </div>
  );
}
