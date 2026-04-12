/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

export const emailQueryToolDef = {
  id: 'EmailQuery',
  readonly: true,
  name: 'Query Email',
  description:
    'Query email accounts, mailboxes, messages, search, and unread stats. See email-ops skill for usage.',
  parameters: z.object({
    mode: z.enum([
      'list-accounts',
      'list-mailboxes',
      'list-messages',
      'list-unified',
      'get-message',
      'search',
      'unread-stats',
    ]),
    accountEmail: z
      .string()
      .optional()
      .describe('Required for list-mailboxes/list-messages/search; optional filter for list-unified.'),
    mailbox: z
      .string()
      .optional()
      .describe('Required for list-messages and list-unified with scope=mailbox.'),
    scope: z
      .enum(['all-inboxes', 'flagged', 'drafts', 'sent', 'mailbox'])
      .optional()
      .describe('Required for list-unified.'),
    messageId: z.string().optional().describe('Required for get-message.'),
    query: z.string().optional().describe('Required for search.'),
    cursor: z.string().optional(),
    pageSize: z.number().int().min(1).max(50).optional().default(10),
  }),
  component: null,
} as const

export const emailMutateToolDef = {
  id: 'EmailMutate',
  readonly: false,
  name: 'Mutate Email',
  description:
    'Send, mark-read, flag, delete, move email messages (single and batch). See email-ops skill for usage.',
  parameters: z.object({
    action: z.enum([
      'send',
      'mark-read',
      'flag',
      'delete',
      'move',
      'batch-mark-read',
      'batch-delete',
      'batch-move',
    ]),
    accountEmail: z.string().optional().describe('Required for send.'),
    to: z.array(z.string()).optional().describe('Required for send.'),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    subject: z.string().optional().describe('Required for send.'),
    bodyText: z.string().optional().describe('Plain text; required for send.'),
    inReplyTo: z.string().optional().describe('Message-ID being replied to.'),
    references: z.array(z.string()).optional().describe('Referenced Message-IDs.'),
    messageId: z.string().optional().describe('Required for mark-read/flag/delete/move.'),
    flagged: z.boolean().optional().describe('Required for flag.'),
    toMailbox: z.string().optional().describe('Required for move/batch-move.'),
    messageIds: z.array(z.string()).optional().describe('Required for batch-mark-read/batch-delete/batch-move.'),
  }),
  needsApproval: true,
  component: null,
} as const
