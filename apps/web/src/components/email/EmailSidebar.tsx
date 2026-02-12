import { DndProvider } from "react-dnd";
import { ChevronDown, ChevronRight, PenSquare, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
import { cn } from "@/lib/utils";
import { dndManager } from "@/lib/dnd-manager";
import {
  EMAIL_DIVIDER_CLASS,
  EMAIL_GLASS_PANEL_CLASS,
  EMAIL_META_CHIP_CLASS,
  EMAIL_TINT_NAV_CLASS,
  EMAIL_TONE_ACTIVE_CLASS,
  EMAIL_TONE_HOVER_CLASS,
} from "./email-style-system";
import { EmailMailboxTree } from "./EmailMailboxTree";
import type { SidebarState } from "./use-email-page-state";

type EmailSidebarProps = {
  sidebar: SidebarState;
  onStartCompose?: () => void;
};

export function EmailSidebar({ sidebar, onStartCompose }: EmailSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden p-3 text-sm",
        EMAIL_GLASS_PANEL_CLASS,
        EMAIL_TINT_NAV_CLASS,
      )}
    >
      {onStartCompose ? (
        <Button
          type="button"
          variant="default"
          size="default"
          className="h-12 w-full justify-start gap-2 rounded-2xl bg-[#c2e7ff] px-4 text-sm font-semibold text-[#001d35] shadow-none transition-colors duration-150 hover:bg-[#b3dcfb] dark:bg-sky-700 dark:text-sky-100 dark:hover:bg-sky-600"
          onClick={onStartCompose}
        >
          <PenSquare className="h-4 w-4" />
          写邮件
        </Button>
      ) : null}
      <div className={cn("flex items-center justify-between px-1 pb-1 border-b", EMAIL_DIVIDER_CLASS)}>
        <div className="text-xs font-semibold tracking-wide text-[#5f6368] dark:text-slate-400">邮箱</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
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
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium text-[#444746] transition-colors duration-150",
              "hover:bg-[#e8eaed] dark:text-slate-300 dark:hover:bg-slate-700",
            )}
            onClick={sidebar.onOpenAddAccount}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加邮箱
          </Button>
        </div>
      </div>

      <div className="space-y-1 p-1">
        <div className="px-2 text-[11px] font-semibold text-[#5f6368] dark:text-slate-400">收件箱视图</div>
        <div className="space-y-1">
          {sidebar.unifiedItems.map((item) => {
            const Icon = item.icon;
            const isActive = sidebar.activeView.scope === item.scope;
            return (
              <button
                key={item.scope}
                type="button"
                onClick={() => sidebar.onSelectUnifiedView(item.scope, item.label)}
                className={cn(
                  "flex w-full items-center justify-between rounded-full px-3 py-2 text-[13px] transition-colors duration-150",
                  isActive
                    ? EMAIL_TONE_ACTIVE_CLASS
                    : cn("text-[#444746] dark:text-slate-300", EMAIL_TONE_HOVER_CLASS),
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </span>
                {item.count > 0 ? <span className="text-[11px] font-medium">{item.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col space-y-2 border-t pt-2", EMAIL_DIVIDER_CLASS)}>
        <div className="flex items-center justify-between px-2">
          <div className="text-[11px] font-semibold text-[#5f6368] dark:text-slate-400">账户</div>
          {sidebar.accounts.length > 0 ? (
            <span className={cn(EMAIL_META_CHIP_CLASS, "text-[10px]")}>
              {sidebar.accounts.length}
            </span>
          ) : null}
        </div>
        {sidebar.accountsLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-[#eef2f7] px-3 py-3 text-xs text-[#5f6368] dark:bg-slate-800/65 dark:text-slate-300">
            正在加载邮箱账号...
          </div>
        ) : sidebar.accounts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-[#eef2f7] px-3 py-3 text-xs text-[#5f6368] dark:bg-slate-800/65 dark:text-slate-300">
            还没有绑定邮箱，点击“添加邮箱”开始配置。
          </div>
        ) : (
          <DndProvider manager={dndManager}>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 show-scrollbar">
              <div className="space-y-2">
                {sidebar.accountGroups.map((group) => {
                  const expanded = sidebar.expandedAccounts[group.key] ?? true;
                  return (
                    <div
                      key={group.account.emailAddress}
                      className="group/account rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-[#eef2f7] dark:hover:bg-slate-800/65"
                    >
                      <div className="flex w-full items-center justify-between text-xs text-[#5f6368] dark:text-slate-400">
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
                        <div className="mt-1 space-y-1">
                          {group.isLoading ? (
                            <div className="rounded-md bg-[#eef2f7] px-2 py-2 text-[11px] text-[#5f6368] dark:bg-slate-800/65 dark:text-slate-300">
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
                            <div className="rounded-md bg-[#eef2f7] px-2 py-2 text-[11px] text-[#5f6368] dark:bg-slate-800/65 dark:text-slate-300">
                              暂无文件夹，点击同步获取。
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </DndProvider>
        )}
      </div>
    </aside>
  );
}
