export type TransportMessage = {
  externalId: string;
  messageId?: string;
  subject?: string;
  from?: unknown;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  date?: Date;
  snippet?: string;
  bodyHtml?: string;
  bodyText?: string;
  flags: string[];
  size?: number;
  attachments?: Array<{ filename?: string; contentType?: string; size?: number }>;
};

export type TransportMailbox = {
  path: string;
  name: string;
  parentPath: string | null;
  delimiter?: string;
  attributes: string[];
};

export type SendMessageInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string[];
};

export type SendMessageResult = {
  ok: boolean;
  messageId?: string;
};

export type DownloadAttachmentResult = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export interface EmailTransportAdapter {
  readonly type: "imap" | "graph" | "gmail";
  listMailboxes(): Promise<TransportMailbox[]>;
  fetchRecentMessages(input: {
    mailboxPath: string;
    limit: number;
    sinceExternalId?: string;
  }): Promise<TransportMessage[]>;
  markAsRead(mailboxPath: string, externalId: string): Promise<void>;
  setFlagged(mailboxPath: string, externalId: string, flagged: boolean): Promise<void>;
  sendMessage?(input: SendMessageInput): Promise<SendMessageResult>;
  downloadAttachment?(mailboxPath: string, externalId: string, attachmentIndex: number): Promise<DownloadAttachmentResult>;
  moveMessage?(fromMailbox: string, toMailbox: string, externalId: string): Promise<void>;
  deleteMessage?(mailboxPath: string, externalId: string): Promise<void>;
  testConnection?(): Promise<{ ok: boolean; error?: string }>;
  dispose(): Promise<void>;
}
