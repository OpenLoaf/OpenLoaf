import { z } from "zod";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

const passwordAccountInputSchema = z.object({
  authType: z.literal("password"),
  workspaceId: z.string().min(1),
  emailAddress: z.string().min(1),
  label: z.string().optional(),
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1),
    tls: z.boolean(),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1),
    tls: z.boolean(),
  }),
  password: z.string().min(1),
});

const oauthAccountInputSchema = z.object({
  authType: z.enum(["oauth2-graph", "oauth2-gmail"]),
  workspaceId: z.string().min(1),
  emailAddress: z.string().min(1),
  label: z.string().optional(),
});

const emailAccountInputSchema = z.discriminatedUnion("authType", [
  passwordAccountInputSchema,
  oauthAccountInputSchema,
]);

const listAccountsInputSchema = z.object({
  workspaceId: z.string().min(1),
});

const emailAccountViewSchema = z.object({
  emailAddress: z.string(),
  label: z.string().optional(),
  status: z.object({
    lastSyncAt: z.string().optional(),
    lastError: z.string().nullable().optional(),
  }),
});

const removeAccountInputSchema = z.object({
  workspaceId: z.string().min(1),
  emailAddress: z.string().min(1),
});

const listMessagesInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
  mailbox: z.string().min(1),
  cursor: z.string().nullable().optional(),
  pageSize: z.number().int().min(1).max(200).nullable().optional(),
});

const listMailboxesInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
});

const markMessageReadInputSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const setMessageFlaggedInputSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  flagged: z.boolean(),
});

const listMailboxStatsInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
});

/** List unread count input. */
const listUnreadCountInputSchema = z.object({
  workspaceId: z.string().min(1),
});

/** List mailbox unread stats input. */
const listMailboxUnreadStatsInputSchema = z.object({
  workspaceId: z.string().min(1),
});

/** Unified mailbox scope. */
const unifiedMailboxScopeSchema = z.enum([
  "all-inboxes",
  "flagged",
  "drafts",
  "sent",
  "mailbox",
]);

/** Unified messages input. */
const listUnifiedMessagesInputSchema = z.object({
  workspaceId: z.string().min(1),
  scope: unifiedMailboxScopeSchema,
  accountEmail: z.string().min(1).optional(),
  mailbox: z.string().min(1).optional(),
  cursor: z.string().nullable().optional(),
  pageSize: z.number().int().min(1).max(200).nullable().optional(),
});

/** Unified unread stats input. */
const listUnifiedUnreadStatsInputSchema = z.object({
  workspaceId: z.string().min(1),
});

/** Update mailbox sorts input. */
const updateMailboxSortsInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
  parentPath: z.string().nullable().optional(),
  sorts: z.array(
    z.object({
      mailboxPath: z.string().min(1),
      sort: z.number().int(),
    }),
  ),
});

const syncMailboxInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
  mailbox: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
});

const syncMailboxesInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
});

const syncMailboxOutputSchema = z.object({
  ok: z.boolean(),
});

const getMessageInputSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const setPrivateSenderInputSchema = z.object({
  workspaceId: z.string().min(1),
  senderEmail: z.string().min(1),
});

const removePrivateSenderInputSchema = z.object({
  workspaceId: z.string().min(1),
  senderEmail: z.string().min(1),
});

const emailMessageSummarySchema = z.object({
  id: z.string(),
  accountEmail: z.string(),
  mailbox: z.string(),
  from: z.string(),
  subject: z.string(),
  preview: z.string(),
  time: z.string().optional(),
  unread: z.boolean(),
  hasAttachments: z.boolean(),
  isPrivate: z.boolean(),
});

const emailMailboxSchema = z.object({
  path: z.string(),
  name: z.string(),
  parentPath: z.string().nullable().optional(),
  delimiter: z.string().optional(),
  attributes: z.array(z.string()),
  sort: z.number().int().optional(),
});

const mailboxStatsSchema = z.object({
  mailbox: z.string(),
  count: z.number().int(),
});

const emailMessagePageSchema = z.object({
  items: z.array(emailMessageSummarySchema),
  nextCursor: z.string().nullable(),
});

/** Unread count payload. */
const unreadCountSchema = z.object({
  count: z.number().int(),
});

/** Mailbox unread stats payload. */
const mailboxUnreadStatsSchema = z.object({
  accountEmail: z.string(),
  mailboxPath: z.string(),
  unreadCount: z.number().int(),
});

/** Unified unread stats payload. */
const unifiedUnreadStatsSchema = z.object({
  allInboxes: z.number().int(),
  flagged: z.number().int(),
  drafts: z.number().int(),
  sent: z.number().int(),
});

const emailMessageDetailSchema = z.object({
  id: z.string(),
  accountEmail: z.string(),
  mailbox: z.string(),
  subject: z.string().optional(),
  from: z.array(z.string()),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  date: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  attachments: z.array(
    z.object({
      filename: z.string().optional(),
      contentType: z.string().optional(),
      size: z.number().int().optional(),
    }),
  ),
  flags: z.array(z.string()),
  fromAddress: z.string().optional(),
  isPrivate: z.boolean(),
});

export const emailSchemas = {
  listAccounts: {
    input: listAccountsInputSchema,
    output: z.array(emailAccountViewSchema),
  },
  addAccount: {
    input: emailAccountInputSchema,
    output: emailAccountViewSchema,
  },
  removeAccount: {
    input: removeAccountInputSchema,
    output: syncMailboxOutputSchema,
  },
  listMessages: {
    input: listMessagesInputSchema,
    output: emailMessagePageSchema,
  },
  listMailboxes: {
    input: listMailboxesInputSchema,
    output: z.array(emailMailboxSchema),
  },
  markMessageRead: {
    input: markMessageReadInputSchema,
    output: syncMailboxOutputSchema,
  },
  setMessageFlagged: {
    input: setMessageFlaggedInputSchema,
    output: syncMailboxOutputSchema,
  },
  listMailboxStats: {
    input: listMailboxStatsInputSchema,
    output: z.array(mailboxStatsSchema),
  },
  listUnreadCount: {
    input: listUnreadCountInputSchema,
    output: unreadCountSchema,
  },
  listMailboxUnreadStats: {
    input: listMailboxUnreadStatsInputSchema,
    output: z.array(mailboxUnreadStatsSchema),
  },
  listUnifiedMessages: {
    input: listUnifiedMessagesInputSchema,
    output: emailMessagePageSchema,
  },
  listUnifiedUnreadStats: {
    input: listUnifiedUnreadStatsInputSchema,
    output: unifiedUnreadStatsSchema,
  },
  updateMailboxSorts: {
    input: updateMailboxSortsInputSchema,
    output: syncMailboxOutputSchema,
  },
  syncMailbox: {
    input: syncMailboxInputSchema,
    output: syncMailboxOutputSchema,
  },
  syncMailboxes: {
    input: syncMailboxesInputSchema,
    output: syncMailboxOutputSchema,
  },
  getMessage: {
    input: getMessageInputSchema,
    output: emailMessageDetailSchema,
  },
  setPrivateSender: {
    input: setPrivateSenderInputSchema,
    output: syncMailboxOutputSchema,
  },
  removePrivateSender: {
    input: removePrivateSenderInputSchema,
    output: syncMailboxOutputSchema,
  },
};

export abstract class BaseEmailRouter {
  public static routeName = "email";

  /** Define the email router contract. */
  public static createRouter() {
    return t.router({
      listAccounts: shieldedProcedure
        .input(emailSchemas.listAccounts.input)
        .output(emailSchemas.listAccounts.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      addAccount: shieldedProcedure
        .input(emailSchemas.addAccount.input)
        .output(emailSchemas.addAccount.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      removeAccount: shieldedProcedure
        .input(emailSchemas.removeAccount.input)
        .output(emailSchemas.removeAccount.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      listMessages: shieldedProcedure
        .input(emailSchemas.listMessages.input)
        .output(emailSchemas.listMessages.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      listMailboxes: shieldedProcedure
        .input(emailSchemas.listMailboxes.input)
        .output(emailSchemas.listMailboxes.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      markMessageRead: shieldedProcedure
        .input(emailSchemas.markMessageRead.input)
        .output(emailSchemas.markMessageRead.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      setMessageFlagged: shieldedProcedure
        .input(emailSchemas.setMessageFlagged.input)
        .output(emailSchemas.setMessageFlagged.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      listMailboxStats: shieldedProcedure
        .input(emailSchemas.listMailboxStats.input)
        .output(emailSchemas.listMailboxStats.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      listUnreadCount: shieldedProcedure
        .input(emailSchemas.listUnreadCount.input)
        .output(emailSchemas.listUnreadCount.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      listMailboxUnreadStats: shieldedProcedure
        .input(emailSchemas.listMailboxUnreadStats.input)
        .output(emailSchemas.listMailboxUnreadStats.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      listUnifiedMessages: shieldedProcedure
        .input(emailSchemas.listUnifiedMessages.input)
        .output(emailSchemas.listUnifiedMessages.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      listUnifiedUnreadStats: shieldedProcedure
        .input(emailSchemas.listUnifiedUnreadStats.input)
        .output(emailSchemas.listUnifiedUnreadStats.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      updateMailboxSorts: shieldedProcedure
        .input(emailSchemas.updateMailboxSorts.input)
        .output(emailSchemas.updateMailboxSorts.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      syncMailbox: shieldedProcedure
        .input(emailSchemas.syncMailbox.input)
        .output(emailSchemas.syncMailbox.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      syncMailboxes: shieldedProcedure
        .input(emailSchemas.syncMailboxes.input)
        .output(emailSchemas.syncMailboxes.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getMessage: shieldedProcedure
        .input(emailSchemas.getMessage.input)
        .output(emailSchemas.getMessage.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      setPrivateSender: shieldedProcedure
        .input(emailSchemas.setPrivateSender.input)
        .output(emailSchemas.setPrivateSender.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      removePrivateSender: shieldedProcedure
        .input(emailSchemas.removePrivateSender.input)
        .output(emailSchemas.removePrivateSender.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const emailRouter = BaseEmailRouter.createRouter();
export type EmailRouter = typeof emailRouter;
