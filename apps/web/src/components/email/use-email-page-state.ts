/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from 'react'

import { trpcClient } from '@/utils/trpc'
import { trpc } from '@/utils/trpc'
import { useEmailCoreState } from './hooks/use-email-core-state'
import { useEmailSidebarState } from './hooks/use-email-sidebar-state'
import { useEmailMessageListState } from './hooks/use-email-message-list-state'
import { useEmailDetailState } from './hooks/use-email-detail-state'
import { useEmailAddDialogState } from './hooks/use-email-add-dialog-state'
import type { EmailPageState } from './email-page-state-types'

// ── 重新导出辅助类型 ──
export type {
  UnifiedItem,
  DragInsertTarget,
  AccountGroup,
  MailboxHoverInput,
  MailboxDropInput,
  MailboxOrderKeyInput,
} from './hooks/use-email-core-state'
export type {
  AddDialogState,
  DetailState,
  EmailPageState,
  MessageListState,
  SidebarState,
} from './email-page-state-types'

export function useEmailPageState(): EmailPageState {
  const core = useEmailCoreState()

  // ── IDLE 推送订阅 ──
  React.useEffect(() => {
    if (!core.hasConfiguredAccounts) return
    const subscription = trpcClient.email.onNewMail.subscribe(
      {},
      {
        onData(_event) {
          if (core.unifiedMessagesQueryKey) {
            core.queryClient.invalidateQueries({ queryKey: core.unifiedMessagesQueryKey })
          }
          core.queryClient.invalidateQueries({
            queryKey: trpc.email.listUnreadCount.queryOptions({}).queryKey,
          })
          core.queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({}).queryKey,
          })
          core.queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({}).queryKey,
          })
        },
        onError() {},
      },
    )
    return () => { subscription.unsubscribe() }
  }, [core.hasConfiguredAccounts, core.queryClient, core.unifiedMessagesQueryKey])

  const sidebar = useEmailSidebarState(core)
  const messageList = useEmailMessageListState(core)
  const detail = useEmailDetailState(core)
  const addDialog = useEmailAddDialogState(core)

  return { sidebar, messageList, detail, addDialog }
}
