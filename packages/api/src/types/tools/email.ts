import { z } from 'zod'

export const emailQueryToolDef = {
  id: 'email-query',
  name: '邮件查询',
  description:
    '触发：当用户提到邮件、收件箱、邮箱、未读邮件，或询问"有没有新邮件"、"查看邮件"、"搜索邮件"时调用。用途：查询邮件账户、邮箱文件夹、邮件列表、邮件详情、搜索邮件、未读统计。返回：{ ok: true, data: { mode, ... } }。不适用：需要发送、删除、移动邮件时不要使用，改用 email-mutate。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：查看未读邮件。'),
    mode: z
      .enum([
        'list-accounts',
        'list-mailboxes',
        'list-messages',
        'list-unified',
        'get-message',
        'search',
        'unread-stats',
      ])
      .describe(
        '查询模式：list-accounts 返回邮件账户列表，list-mailboxes 返回邮箱文件夹，list-messages 返回指定邮箱的邮件列表，list-unified 返回统一收件箱邮件，get-message 返回邮件详情，search 搜索邮件，unread-stats 返回未读统计',
      ),
    accountEmail: z
      .string()
      .optional()
      .describe(
        '邮件账户地址（list-mailboxes/list-messages/search 时必填，list-unified 时可选用于筛选）',
      ),
    mailbox: z
      .string()
      .optional()
      .describe('邮箱文件夹路径（list-messages 时必填，list-unified scope=mailbox 时必填）'),
    scope: z
      .enum(['all-inboxes', 'flagged', 'drafts', 'sent', 'mailbox'])
      .optional()
      .describe('统一邮箱范围（list-unified 时必填）'),
    messageId: z
      .string()
      .optional()
      .describe('邮件 ID（get-message 时必填）'),
    query: z
      .string()
      .optional()
      .describe('搜索关键词（search 时必填）'),
    cursor: z
      .string()
      .optional()
      .describe('分页游标（list-messages/list-unified 时可选）'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('每页数量，默认 10，上限 50'),
  }),
  component: null,
} as const

export const emailMutateToolDef = {
  id: 'email-mutate',
  name: '邮件操作',
  description:
    '触发：当你需要发送邮件、标记已读、标记星标、删除邮件、移动邮件，或批量操作邮件时调用。用途：执行邮件变更操作。返回：{ ok: true, data: { action, ... } }。不适用：仅需读取邮件时不要使用，改用 email-query。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：发送邮件给张三。'),
    action: z
      .enum([
        'send',
        'mark-read',
        'flag',
        'delete',
        'move',
        'batch-mark-read',
        'batch-delete',
        'batch-move',
      ])
      .describe(
        '操作类型：send 发送邮件，mark-read 标记已读，flag 标记/取消星标，delete 删除邮件，move 移动邮件，batch-mark-read/batch-delete/batch-move 批量操作',
      ),
    accountEmail: z
      .string()
      .optional()
      .describe('发件账户地址（send 时必填）'),
    to: z
      .array(z.string())
      .optional()
      .describe('收件人列表（send 时必填）'),
    cc: z
      .array(z.string())
      .optional()
      .describe('抄送列表（send 时可选）'),
    bcc: z
      .array(z.string())
      .optional()
      .describe('密送列表（send 时可选）'),
    subject: z
      .string()
      .optional()
      .describe('邮件主题（send 时必填）'),
    bodyText: z
      .string()
      .optional()
      .describe('邮件正文纯文本（send 时必填）'),
    inReplyTo: z
      .string()
      .optional()
      .describe('回复的邮件 Message-ID（回复邮件时可选）'),
    references: z
      .array(z.string())
      .optional()
      .describe('引用的邮件 Message-ID 列表（回复邮件时可选）'),
    messageId: z
      .string()
      .optional()
      .describe('邮件 ID（mark-read/flag/delete/move 时必填）'),
    flagged: z
      .boolean()
      .optional()
      .describe('是否标记星标（flag 时必填）'),
    toMailbox: z
      .string()
      .optional()
      .describe('目标邮箱文件夹路径（move/batch-move 时必填）'),
    messageIds: z
      .array(z.string())
      .optional()
      .describe('邮件 ID 列表（batch-mark-read/batch-delete/batch-move 时必填）'),
  }),
  needsApproval: true,
  component: null,
} as const
