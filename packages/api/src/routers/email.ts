import { z } from "zod";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

const emailAccountInputSchema = z.object({
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

const listMessagesInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
  mailbox: z.string().min(1),
});

const listMailboxesInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
});

const markMessageReadInputSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const listMailboxStatsInputSchema = z.object({
  workspaceId: z.string().min(1),
  accountEmail: z.string().min(1),
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

const emailMessageSummarySchema = z.object({
  id: z.string(),
  accountEmail: z.string(),
  mailbox: z.string(),
  from: z.string(),
  subject: z.string(),
  preview: z.string(),
  time: z.string().optional(),
  unread: z.boolean(),
});

const emailMailboxSchema = z.object({
  path: z.string(),
  name: z.string(),
  parentPath: z.string().nullable().optional(),
  delimiter: z.string().optional(),
  attributes: z.array(z.string()),
});

const mailboxStatsSchema = z.object({
  mailbox: z.string(),
  count: z.number().int(),
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
  listMessages: {
    input: listMessagesInputSchema,
    output: z.array(emailMessageSummarySchema),
  },
  listMailboxes: {
    input: listMailboxesInputSchema,
    output: z.array(emailMailboxSchema),
  },
  markMessageRead: {
    input: markMessageReadInputSchema,
    output: syncMailboxOutputSchema,
  },
  listMailboxStats: {
    input: listMailboxStatsInputSchema,
    output: z.array(mailboxStatsSchema),
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
      listMailboxStats: shieldedProcedure
        .input(emailSchemas.listMailboxStats.input)
        .output(emailSchemas.listMailboxStats.output)
        .query(async () => {
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
    });
  }
}

export const emailRouter = BaseEmailRouter.createRouter();
export type EmailRouter = typeof emailRouter;
