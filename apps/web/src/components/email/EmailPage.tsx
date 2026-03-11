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

import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { trpc } from "@/utils/trpc";
import { EmailAddAccountDialog } from "./EmailAddAccountDialog";
import { EmailMessageList } from "./EmailMessageList";
import { EmailSidebar } from "./EmailSidebar";
import type { EmailMessageSummary } from "./email-types";
import { useEmailPageState } from "./use-email-page-state";

export default function EmailPage({
  panelKey: _panelKey,
  tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const { t } = useTranslation('common');
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const workspaceId = workspaceCompatQuery.data?.id;
  const pushStackItem = useTabRuntime((state) => state.pushStackItem);
  const removeStackItem = useTabRuntime((state) => state.removeStackItem);
  const { sidebar, messageList, addDialog } = useEmailPageState({
    workspaceId,
  });

  useEffect(() => {
    if (!tabId) return;
    const runtime = useTabRuntime.getState().getRuntimeByTabId(tabId);
    const legacyDetailIds = (runtime?.stack ?? [])
      .filter(
        (item) => item.component === "email-message-stack" && item.id === "email-message-stack",
      )
      .map((item) => item.id);
    legacyDetailIds.forEach((itemId) => {
      // 逻辑：清理旧版“单例详情 stack”残留，防止与多实例模式混用。
      removeStackItem(tabId, itemId);
    });
  }, [removeStackItem, tabId]);

  /** Open compose editor in stack panel. */
  const handleOpenComposeStack = useCallback(() => {
    if (!tabId) return;
    const runtime = useTabRuntime.getState().getRuntimeByTabId(tabId);
    const detailStackIds = (runtime?.stack ?? [])
      .filter((item) => item.component === "email-message-stack")
      .map((item) => item.id);
    detailStackIds.forEach((itemId) => removeStackItem(tabId, itemId));
    pushStackItem(tabId, {
      id: "email-compose",
      sourceKey: "email-compose",
      component: "email-compose-stack",
      title: t('email.compose'),
      params: {
        workspaceId,
        __opaque: true,
      },
    });
  }, [pushStackItem, removeStackItem, t, tabId, workspaceId]);

  /** Open message detail in stack panel (Gmail-style list -> stack detail). */
  const handleOpenMessageStack = useCallback(
    (message: EmailMessageSummary) => {
      // 逻辑：多选模式下不打开详情面板。
      if (messageList.hasSelection) return;
      if (!tabId) return;
      const detailStackId = `email-message:${message.id}`;
      const detailTitle = message.subject?.trim() || t('email.noSubject');
      pushStackItem(tabId, {
        id: detailStackId,
        sourceKey: detailStackId,
        component: "email-message-stack",
        title: detailTitle,
        params: {
          messageId: message.id,
          workspaceId,
          fallbackFrom: message.from,
          fallbackTime: message.time ?? "",
          fallbackPreview: message.preview,
          __opaque: true,
        },
      });
    },
    [messageList.hasSelection, pushStackItem, t, tabId, workspaceId],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent text-foreground">
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <div className="min-h-0 w-full lg:w-[252px] lg:shrink-0">
          <EmailSidebar sidebar={sidebar} onStartCompose={handleOpenComposeStack} />
        </div>
        <div className="min-h-0 flex-1">
          <EmailMessageList
            messageList={messageList}
            onMessageOpen={handleOpenMessageStack}
          />
        </div>
      </div>

      <EmailAddAccountDialog addDialog={addDialog} />
    </div>
  );
}
