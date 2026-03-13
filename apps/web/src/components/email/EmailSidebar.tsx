/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { DndProvider } from "react-dnd";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  MailPlus,
  PenSquare,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";

import { Button } from "@openloaf/ui/button";
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
  const { t } = useTranslation('common');
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
                "text-ol-blue",
              item.scope === "flagged" && "text-ol-amber",
              item.scope === "drafts" && "text-ol-purple",
              item.scope === "sent" && "text-ol-green",
              item.scope === "deleted" && "text-ol-red",
              item.scope === "mailbox" && "text-ol-text-auxiliary",
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
                        "text-ol-text-secondary",
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
            <div className="text-xs font-semibold text-ol-text-auxiliary">
              {t('email.mailboxList')}
            </div>
            {sidebar.isSyncingMailbox ? (
              <span className="text-[9px] text-ol-blue">{t('email.syncing')}</span>
            ) : sidebar.accounts.length > 0 ? (
              <span className="text-[9px] font-medium text-muted-foreground">
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
                "h-7 w-7 rounded-full border border-transparent bg-ol-green-bg text-ol-green transition-colors duration-150",
                "hover:bg-ol-green-bg-hover",
                "disabled:bg-muted/28 disabled:text-muted-foreground",
              )}
              onClick={sidebar.onSyncMailbox}
              disabled={!sidebar.canSyncMailbox || sidebar.isSyncingMailbox}
              aria-label={t('email.syncMailbox')}
              title={t('email.syncMailbox')}
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
                "h-7 w-7 rounded-full border border-transparent bg-ol-green-bg text-ol-green transition-colors duration-150",
                "hover:bg-ol-green-bg-hover",
              )}
              onClick={sidebar.onOpenAddAccount}
              aria-label={t('email.addMailbox')}
              title={t('email.addMailbox')}
            >
              <MailPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {sidebar.accountsLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-background/72 px-3 py-3 text-xs text-ol-text-auxiliary">
            {t('email.loadingAccounts')}
          </div>
        ) : sidebar.accounts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-background/72 px-3 py-3 text-xs text-ol-text-auxiliary">
            {t('email.emptyAccounts')}
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
                      <div className="flex w-full items-center justify-between text-xs text-ol-text-auxiliary">
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
                            title={t('email.deleteAccount')}
                            onClick={(e) => {
                              e.stopPropagation();
                              const label =
                                group.account.label ??
                                group.account.emailAddress;
                              if (
                                window.confirm(
                                  t('email.deleteAccountConfirm', { label }),
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
                            <div className="rounded-md bg-background/72 px-2 py-2 text-[11px] text-ol-text-auxiliary dark:bg-muted/42">
                              {t('email.loadingFolders')}
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
                            <div className="rounded-md bg-background/72 px-2 py-2 text-[11px] text-ol-text-auxiliary dark:bg-muted/42">
                              {t('email.emptyFolders')}
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
          className="h-12 w-full justify-start gap-2 rounded-2xl bg-ol-blue-bg px-4 text-sm font-semibold text-ol-blue shadow-none transition-colors duration-150 hover:bg-ol-blue-bg-hover"
          onClick={onStartCompose}
        >
          <PenSquare className="h-4 w-4" />
          {t('email.compose')}
        </Button>
      ) : null}
    </aside>
  );
}
