"use client";

import { useCallback, useEffect } from "react";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
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
  const { workspace } = useWorkspace();
  const pushStackItem = useTabRuntime((state) => state.pushStackItem);
  const removeStackItem = useTabRuntime((state) => state.removeStackItem);
  const { sidebar, messageList, addDialog } = useEmailPageState({
    workspaceId: workspace?.id,
  });

  useEffect(() => {
    if (!tabId) return;
    const runtime = useTabRuntime.getState().getRuntimeByTabId(tabId);
    const legacyDetailIds = (runtime?.stack ?? [])
      .filter(
        (item) =>
          item.component === "email-message-stack" && item.id.startsWith("email-message:"),
      )
      .map((item) => item.id);
    legacyDetailIds.forEach((itemId) => {
      // 逻辑：清理历史版本留下的多实例详情 stack，避免关闭后回到旧详情页。
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
      title: "写邮件",
      params: {
        workspaceId: workspace?.id,
        __opaque: true,
      },
    });
  }, [pushStackItem, removeStackItem, tabId, workspace?.id]);

  /** Open message detail in stack panel (Gmail-style list -> stack detail). */
  const handleOpenMessageStack = useCallback(
    (message: EmailMessageSummary) => {
      if (!tabId) return;
      const runtime = useTabRuntime.getState().getRuntimeByTabId(tabId);
      const legacyDetailIds = (runtime?.stack ?? [])
        .filter(
          (item) =>
            item.component === "email-message-stack" && item.id !== "email-message-stack",
        )
        .map((item) => item.id);
      legacyDetailIds.forEach((itemId) => removeStackItem(tabId, itemId));
      pushStackItem(tabId, {
        id: "email-message-stack",
        sourceKey: "email-message-stack",
        component: "email-message-stack",
        title: message.subject?.trim() || "邮件正文",
        params: {
          messageId: message.id,
          workspaceId: workspace?.id,
          fallbackSubject: message.subject,
          fallbackFrom: message.from,
          fallbackTime: message.time ?? "",
          fallbackPreview: message.preview,
          __opaque: true,
        },
      });
    },
    [pushStackItem, removeStackItem, tabId, workspace?.id],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f6f8fc] text-foreground dark:bg-slate-950">
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
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
