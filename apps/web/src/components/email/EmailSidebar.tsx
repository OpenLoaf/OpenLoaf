import { DndProvider } from "react-dnd";
import { ChevronDown, ChevronRight, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
import { dndManager } from "@/lib/dnd-manager";
import { EmailMailboxTree } from "./EmailMailboxTree";
import type { SidebarState } from "./use-email-page-state";

type EmailSidebarProps = {
  sidebar: SidebarState;
};

export function EmailSidebar({ sidebar }: EmailSidebarProps) {
  return (
    <aside className="flex w-full min-w-0 flex-col gap-4 border-b border-border bg-card p-3 text-sm lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">邮箱</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={sidebar.onSyncMailbox}
            disabled={!sidebar.canSyncMailbox || sidebar.isSyncingMailbox}
            aria-label="同步邮箱"
            title="同步邮箱"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${sidebar.isSyncingMailbox ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={sidebar.onOpenAddAccount}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加邮箱
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          {sidebar.unifiedItems.map((item) => {
            const Icon = item.icon;
            const isActive = sidebar.activeView.scope === item.scope;
            return (
              <button
                key={item.scope}
                type="button"
                onClick={() => sidebar.onSelectUnifiedView(item.scope, item.label)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition ${
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </span>
                {item.count > 0 ? <span className="text-[11px]">{item.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-muted-foreground">账户</div>
        {sidebar.accountsLoading ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            正在加载邮箱账号...
          </div>
        ) : sidebar.accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            还没有绑定邮箱，点击“添加邮箱”开始配置。
          </div>
        ) : (
          <DndProvider manager={dndManager}>
            <div className="space-y-2">
              {sidebar.accountGroups.map((group) => {
                const expanded = sidebar.expandedAccounts[group.key] ?? true;
                return (
                  <div key={group.account.emailAddress} className="group/account rounded-md py-2">
                    <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => sidebar.onToggleAccount(group.account.emailAddress)}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate font-semibold text-foreground">
                          {group.account.label ?? group.account.emailAddress}
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-1">
                        {group.account.status?.lastError ? (
                          <Unplug className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : null}
                        <button
                          type="button"
                          className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover/account:flex"
                          title="删除邮箱账户"
                          onClick={(e) => {
                            e.stopPropagation();
                            const label = group.account.label ?? group.account.emailAddress;
                            if (window.confirm(`确定要删除邮箱账户「${label}」吗？该账户的所有邮件数据将被清除。`)) {
                              sidebar.onRemoveAccount(group.account.emailAddress);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                    {expanded ? (
                      <div className="mt-2 space-y-1">
                        {group.isLoading ? (
                          <div className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-2 text-[11px] text-muted-foreground">
                            正在加载文件夹...
                          </div>
                        ) : group.mailboxTree.length ? (
                          <div className="space-y-1">
                            <EmailMailboxTree
                              accountEmail={group.account.emailAddress}
                              nodes={group.mailboxTree}
                              activeView={sidebar.activeView}
                              mailboxUnreadMap={sidebar.mailboxUnreadMap}
                              dragInsertTarget={sidebar.dragInsertTarget}
                              draggingMailboxId={sidebar.draggingMailboxId}
                              onSelectMailbox={sidebar.onSelectMailbox}
                              onHoverMailbox={sidebar.onHoverMailbox}
                              onClearHover={sidebar.onClearHover}
                              onDropMailboxOrder={sidebar.onDropMailboxOrder}
                              onDragStartMailbox={sidebar.onDragStartMailbox}
                              onDragEndMailbox={sidebar.onDragEndMailbox}
                              resolveOrderedMailboxNodes={sidebar.resolveOrderedMailboxNodes}
                            />
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-2 text-[11px] text-muted-foreground">
                            暂无文件夹，点击同步获取。
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </DndProvider>
        )}
      </div>
    </aside>
  );
}
