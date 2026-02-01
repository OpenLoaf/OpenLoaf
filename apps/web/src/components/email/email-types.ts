export type EmailAccountView = {
  /** Email address. */
  emailAddress: string;
  /** Account label. */
  label?: string;
  /** Account status. */
  status: {
    lastSyncAt?: string;
    lastError?: string | null;
  };
};

export type EmailMessageSummary = {
  /** Message id. */
  id: string;
  /** Account email. */
  accountEmail: string;
  /** Mailbox key. */
  mailbox: string;
  /** Sender label. */
  from: string;
  /** Subject. */
  subject: string;
  /** Preview text. */
  preview: string;
  /** Time label. */
  time?: string;
  /** Unread flag. */
  unread: boolean;
  /** Attachment presence. */
  hasAttachments: boolean;
  /** Private sender flag. */
  isPrivate: boolean;
};

export type EmailMessageDetail = {
  /** Message id. */
  id: string;
  /** Account email. */
  accountEmail: string;
  /** Mailbox key. */
  mailbox: string;
  /** Subject. */
  subject?: string;
  /** Sender list. */
  from: string[];
  /** Recipient list. */
  to: string[];
  /** Cc list. */
  cc: string[];
  /** Bcc list. */
  bcc: string[];
  /** ISO date string. */
  date?: string;
  /** HTML body. */
  bodyHtml?: string;
  /** Text body. */
  bodyText?: string;
  /** Attachment list. */
  attachments: Array<{
    filename?: string;
    contentType?: string;
    size?: number;
  }>;
  /** Flags. */
  flags: string[];
  /** From email address. */
  fromAddress?: string;
  /** Private sender flag. */
  isPrivate: boolean;
};

export type ForwardDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type EmailMailboxView = {
  /** Mailbox path. */
  path: string;
  /** Display name. */
  name: string;
  /** Parent mailbox path. */
  parentPath?: string | null;
  /** IMAP delimiter. */
  delimiter?: string;
  /** IMAP attributes. */
  attributes: string[];
  /** Sort order. */
  sort?: number;
};

export type MailboxNode = EmailMailboxView & {
  children: MailboxNode[];
};

export type UnifiedMailboxScope =
  | "all-inboxes"
  | "flagged"
  | "drafts"
  | "sent"
  | "mailbox";

export type UnifiedMailboxView = {
  /** View scope. */
  scope: UnifiedMailboxScope;
  /** Account email (mailbox scope). */
  accountEmail?: string;
  /** Mailbox path (mailbox scope). */
  mailbox?: string;
  /** Display label. */
  label: string;
};

export type MailboxDragItem = {
  accountEmail: string;
  parentPath: string | null;
  mailboxPath: string;
};

export type EmailAccountFormState = {
  emailAddress: string;
  label: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  password: string;
};

export const DEFAULT_FORM: EmailAccountFormState = {
  emailAddress: "",
  label: "",
  imapHost: "",
  imapPort: 993,
  imapTls: true,
  smtpHost: "",
  smtpPort: 465,
  smtpTls: true,
  password: "",
};

export const MESSAGE_PAGE_SIZE = 20;
