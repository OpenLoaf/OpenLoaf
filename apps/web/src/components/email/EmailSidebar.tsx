import { DndProvider } from "react-dnd";
import {
  ChevronDown,
  ChevronRight,
  MailPlus,
  PenSquare,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
import { cn } from "@/lib/utils";
import { dndManager } from "@/lib/dnd-manager";
import {
  EMAIL_DIVIDER_CLASS,
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
        "flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden p-0 text-sm !border-0",
        EMAIL_TINT_NAV_CLASS,
      )}
    >
      <div className="space-y-1 p-1">
        <div className="space-y-1">
          {sidebar.unifiedItems.map((item) => {
            const Icon = item.icon;
            const isActive = sidebar.activeView.scope === item.scope;
            const unifiedIconClassName = cn(
              "h-3.5 w-3.5",
              item.scope === "all-inboxes" &&
                "text-[#1a73e8] dark:text-sky-300",
              item.scope === "flagged" && "text-[#f9ab00] dark:text-amber-300",
              item.scope === "drafts" && "text-[#9334e6] dark:text-violet-300",
              item.scope === "sent" && "text-[#188038] dark:text-emerald-300",
              item.scope === "deleted" && "text-[#d93025] dark:text-red-300",
              item.scope === "mailbox" && "text-[#5f6368] dark:text-slate-300",
            );
            return (
              <button
                key={item.scope}
                type="button"
                onClick={() =>
                  sidebar.onSelectUnifiedView(item.scope, item.label)
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-full px-3 py-2 text-[13px] transition-colors duration-150",
                  isActive
                    ? EMAIL_TONE_ACTIVE_CLASS
                    : cn(
                        "text-[#444746] dark:text-slate-300",
                        EMAIL_TONE_HOVER_CLASS,
                      ),
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className={unifiedIconClassName} />
                  {item.label}
                </span>
                {item.count > 0 ? (
                  <span className="text-[11px] font-medium">{item.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col space-y-2 border-t pt-2",
          EMAIL_DIVIDER_CLASS,
        )}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5">
            <div className="text-xs font-semibold text-[#5f6368] dark:text-slate-400">
              邮箱列表
            </div>
            {sidebar.accounts.length > 0 ? (
              <span className="text-[9px] font-medium text-[#8a9098] dark:text-slate-500">
                {sidebar.accounts.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-full border border-transparent bg-[#e6f4ea] text-[#188038] transition-colors duration-150",
                "hover:bg-[#ceead6] dark:bg-[hsl(142_45%_24%/0.55)] dark:text-emerald-300 dark:hover:bg-[hsl(142_45%_24%/0.72)]",
                "disabled:bg-[hsl(var(--muted)/0.28)] disabled:text-muted-foreground",
              )}
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
              size="icon"
              className={cn(
                "h-7 w-7 rounded-full border border-transparent bg-[#e6f4ea] text-[#188038] transition-colors duration-150",
                "hover:bg-[#ceead6] dark:bg-[hsl(142_45%_24%/0.55)] dark:text-emerald-300 dark:hover:bg-[hsl(142_45%_24%/0.72)]",
              )}
              onClick={sidebar.onOpenAddAccount}
              aria-label="添加邮箱"
              title="添加邮箱"
            >
              <MailPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {sidebar.accountsLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-[hsl(var(--background)/0.72)] px-3 py-3 text-xs text-[#5f6368]  dark:text-slate-300">
            正在加载邮箱账号...
          </div>
        ) : sidebar.accounts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-[hsl(var(--background)/0.72)] px-3 py-3 text-xs text-[#5f6368] dark:text-slate-300">
            点击“添加邮箱”开始配置。
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
                      className="group/account rounded-xl px-2 py-1.5"
                    >
                      <div className="flex w-full items-center justify-between text-xs text-[#5f6368] dark:text-slate-400">
                        <button
                          type="button"
                          onClick={() =>
                            sidebar.onToggleAccount(group.account.emailAddress)
                          }
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
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-opacity duration-150 hover:text-destructive",
                              "opacity-0 pointer-events-none group-hover/account:opacity-100 group-hover/account:pointer-events-auto",
                            )}
                            title="删除邮箱账户"
                            onClick={(e) => {
                              e.stopPropagation();
                              const label =
                                group.account.label ??
                                group.account.emailAddress;
                              if (
                                window.confirm(
                                  `确定要删除邮箱账户「${label}」吗？该账户的所有邮件数据将被清除。`,
                                )
                              ) {
                                sidebar.onRemoveAccount(
                                  group.account.emailAddress,
                                );
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
                            <div className="rounded-md bg-[hsl(var(--background)/0.72)] px-2 py-2 text-[11px] text-[#5f6368] dark:bg-slate-800/65 dark:text-slate-300">
                              正在加载文件夹...
                            </div>
                          ) : group.mailboxTree.length ? (
                            <div className="space-y-1">
                              <EmailMailboxTree
                                accountEmail={group.account.emailAddress}
                                nodes={group.mailboxTree}
                                activeView={sidebar.activeView}
                                expandedMailboxes={sidebar.expandedMailboxes}
                                mailboxUnreadMap={sidebar.mailboxUnreadMap}
                                dragInsertTarget={sidebar.dragInsertTarget}
                                draggingMailboxId={sidebar.draggingMailboxId}
                                onSelectMailbox={sidebar.onSelectMailbox}
                                onToggleMailboxExpand={
                                  sidebar.onToggleMailboxExpand
                                }
                                onHoverMailbox={sidebar.onHoverMailbox}
                                onClearHover={sidebar.onClearHover}
                                onDropMailboxOrder={sidebar.onDropMailboxOrder}
                                onDragStartMailbox={sidebar.onDragStartMailbox}
                                onDragEndMailbox={sidebar.onDragEndMailbox}
                                resolveOrderedMailboxNodes={
                                  sidebar.resolveOrderedMailboxNodes
                                }
                              />
                            </div>
                          ) : (
                            <div className="rounded-md bg-[hsl(var(--background)/0.72)] px-2 py-2 text-[11px] text-[#5f6368] dark:bg-slate-800/65 dark:text-slate-300">
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

      {onStartCompose ? (
        <Button
          type="button"
          variant="default"
          size="default"
          className="h-12 w-full justify-start gap-2 rounded-2xl bg-sky-100 px-4 text-sm font-semibold text-sky-900 shadow-none transition-colors duration-150 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-100 dark:hover:bg-sky-900/70"
          onClick={onStartCompose}
        >
          <PenSquare className="h-4 w-4" />
          写邮件
        </Button>
      ) : null}
    </aside>
  );
}
