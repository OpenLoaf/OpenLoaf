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
import { useTranslation } from "react-i18next";
import { useLayoutState } from "@/hooks/use-layout-state";
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
  const pushStackItem = useLayoutState((state) => state.pushStackItem);
  const removeStackItem = useLayoutState((state) => state.removeStackItem);
  const { sidebar, messageList, addDialog } = useEmailPageState();

  useEffect(() => {
    const layoutStack = useLayoutState.getState().stack ?? [];
    const legacyDetailIds = layoutStack
      .filter(
        (item) => item.component === "email-message-stack" && item.id === "email-message-stack",
      )
      .map((item) => item.id);
    legacyDetailIds.forEach((itemId) => {
      // 逻辑：清理旧版"单例详情 stack"残留，防止与多实例模式混用。
      removeStackItem(itemId);
    });
  }, [removeStackItem]);

  /** Open compose editor in stack panel. */
  const handleOpenComposeStack = useCallback(() => {
    const layoutStack = useLayoutState.getState().stack ?? [];
    const detailStackIds = layoutStack
      .filter((item) => item.component === "email-message-stack")
      .map((item) => item.id);
    detailStackIds.forEach((itemId) => removeStackItem(itemId));
    pushStackItem({
      id: "email-compose",
      sourceKey: "email-compose",
      component: "email-compose-stack",
      title: t('email.compose'),
      params: {
        __opaque: true,
      },
    });
  }, [pushStackItem, removeStackItem, t]);

  /** Open message detail in stack panel (Gmail-style list -> stack detail). */
  const handleOpenMessageStack = useCallback(
    (message: EmailMessageSummary) => {
      // 逻辑：多选模式下不打开详情面板。
      if (messageList.hasSelection) return;
      const detailStackId = `email-message:${message.id}`;
      const detailTitle = message.subject?.trim() || t('email.noSubject');
      pushStackItem({
        id: detailStackId,
        sourceKey: detailStackId,
        component: "email-message-stack",
        title: detailTitle,
        params: {
          messageId: message.id,
          fallbackFrom: message.from,
          fallbackTime: message.time ?? "",
          fallbackPreview: message.preview,
          __opaque: true,
        },
      });
    },
    [messageList.hasSelection, pushStackItem, t],
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
