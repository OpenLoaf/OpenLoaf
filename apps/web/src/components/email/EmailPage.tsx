"use client";

import { useWorkspace } from "@/components/workspace/workspaceContext";
import { EmailAddAccountDialog } from "./EmailAddAccountDialog";
import { EmailForwardEditor } from "./EmailForwardEditor";
import { EmailMessageDetail } from "./EmailMessageDetail";
import { EmailMessageList } from "./EmailMessageList";
import { EmailSidebar } from "./EmailSidebar";
import { useEmailPageState } from "./use-email-page-state";

export default function EmailPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const { workspace } = useWorkspace();
  const { sidebar, messageList, detail, addDialog } = useEmailPageState({
    workspaceId: workspace?.id,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <EmailSidebar sidebar={sidebar} />
        <EmailMessageList messageList={messageList} />
        <section className="flex min-w-0 flex-1 flex-col bg-card min-h-0">
          {detail.activeMessage ? (
            detail.isForwarding && detail.forwardDraft ? (
              <EmailForwardEditor detail={detail} />
            ) : (
              <EmailMessageDetail detail={detail} />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              选择一封邮件以查看详情
            </div>
          )}
        </section>
      </div>

      <EmailAddAccountDialog addDialog={addDialog} />
    </div>
  );
}
