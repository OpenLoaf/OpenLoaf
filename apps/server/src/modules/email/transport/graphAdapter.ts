import { logger } from "@/common/logger";
import { sanitizeEmailHtml } from "../emailSanitize";
import type { DownloadAttachmentResult, EmailTransportAdapter, SendMessageInput, SendMessageResult, TransportMailbox, TransportMessage } from "./types";

/** Microsoft Graph API base URL. */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Graph adapter configuration. */
type GraphAdapterConfig = {
  getAccessToken: () => Promise<string>;
};

/** Map Graph wellKnownName to IMAP-style attribute. */
function mapWellKnownAttribute(wellKnownName: string | null | undefined): string | null {
  if (!wellKnownName) return null;
  const mapping: Record<string, string> = {
    inbox: "\\Inbox",
    sentitems: "\\Sent",
    drafts: "\\Drafts",
    junkemail: "\\Junk",
    deleteditems: "\\Trash",
    archive: "\\Archive",
  };
  return mapping[wellKnownName.toLowerCase()] ?? null;
}

/** Parse a Graph emailAddress object into address envelope format. */
function parseGraphRecipients(
  recipients: Array<{ emailAddress: { address?: string; name?: string } }> | undefined,
): { value: Array<{ address: string; name: string }> } | undefined {
  if (!recipients?.length) return undefined;
  return {
    value: recipients.map((r) => ({
      address: r.emailAddress?.address ?? "",
      name: r.emailAddress?.name ?? "",
    })),
  };
}

/** Microsoft Graph API transport adapter. */
export class GraphTransportAdapter implements EmailTransportAdapter {
  readonly type = "graph" as const;
  private readonly config: GraphAdapterConfig;

  constructor(config: GraphAdapterConfig) {
    this.config = config;
  }

  /** Build authorization headers with a fresh access token. */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.config.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  /** List all mail folders from Microsoft Graph. */
  async listMailboxes(): Promise<TransportMailbox[]> {
    logger.debug("graph listMailboxes start");
    const headers = await this.authHeaders();
    const result: TransportMailbox[] = [];

    let url: string | null =
      `${GRAPH_BASE}/me/mailFolders?$top=100&$expand=childFolders($top=100)`;

    while (url) {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = await response.text();
        logger.error({ status: response.status, body }, "graph listMailboxes failed");
        throw new Error(`Graph listMailboxes failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        value: Array<{
          id: string;
          displayName: string;
          parentFolderId?: string;
          wellKnownName?: string;
          childFolders?: Array<{
            id: string;
            displayName: string;
            parentFolderId?: string;
            wellKnownName?: string;
          }>;
        }>;
        "@odata.nextLink"?: string;
      };

      for (const folder of data.value) {
        const attr = mapWellKnownAttribute(folder.wellKnownName);
        result.push({
          path: folder.id,
          name: folder.displayName,
          parentPath: folder.parentFolderId ?? null,
          attributes: attr ? [attr] : [],
        });

        // 逻辑：展开子文件夹。
        if (folder.childFolders?.length) {
          for (const child of folder.childFolders) {
            const childAttr = mapWellKnownAttribute(child.wellKnownName);
            result.push({
              path: child.id,
              name: child.displayName,
              parentPath: child.parentFolderId ?? null,
              attributes: childAttr ? [childAttr] : [],
            });
          }
        }
      }

      url = data["@odata.nextLink"] ?? null;
    }

    logger.debug({ count: result.length }, "graph listMailboxes done");
    return result;
  }

  /** Fetch recent messages from a mail folder. */
  async fetchRecentMessages(input: {
    mailboxPath: string;
    limit: number;
    sinceExternalId?: string;
  }): Promise<TransportMessage[]> {
    logger.debug(
      { mailboxPath: input.mailboxPath, limit: input.limit },
      "graph fetchRecentMessages start",
    );
    const headers = await this.authHeaders();

    const selectFields = [
      "id",
      "subject",
      "from",
      "toRecipients",
      "ccRecipients",
      "bccRecipients",
      "receivedDateTime",
      "isRead",
      "flag",
      "bodyPreview",
      "body",
      "hasAttachments",
      "internetMessageId",
    ].join(",");

    const url =
      `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(input.mailboxPath)}/messages` +
      `?$top=${input.limit}&$orderby=receivedDateTime desc&$select=${selectFields}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body, mailboxPath: input.mailboxPath },
        "graph fetchRecentMessages failed",
      );
      throw new Error(`Graph fetchRecentMessages failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      value: Array<{
        id: string;
        subject?: string;
        from?: { emailAddress: { address?: string; name?: string } };
        toRecipients?: Array<{ emailAddress: { address?: string; name?: string } }>;
        ccRecipients?: Array<{ emailAddress: { address?: string; name?: string } }>;
        bccRecipients?: Array<{ emailAddress: { address?: string; name?: string } }>;
        receivedDateTime?: string;
        isRead?: boolean;
        flag?: { flagStatus?: string };
        bodyPreview?: string;
        body?: { contentType?: string; content?: string };
        hasAttachments?: boolean;
        internetMessageId?: string;
      }>;
    };

    // 逻辑：如果指定了 sinceExternalId，跳过该 ID 及之前的消息。
    let messages = data.value;
    if (input.sinceExternalId) {
      const idx = messages.findIndex((m) => m.id === input.sinceExternalId);
      if (idx >= 0) {
        messages = messages.slice(0, idx);
      }
    }

    const result: TransportMessage[] = messages.map((msg) => {
      const flags: string[] = [];
      if (msg.isRead) flags.push("\\Seen");
      if (msg.flag?.flagStatus === "flagged") flags.push("\\Flagged");

      const isHtml = msg.body?.contentType?.toLowerCase() === "html";
      const rawHtml = isHtml && msg.body?.content ? msg.body.content : undefined;
      const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
      const bodyHtmlRaw = rawHtml && rawHtml !== bodyHtml ? rawHtml : undefined;
      const bodyText = !isHtml && msg.body?.content ? msg.body.content : undefined;

      return {
        externalId: msg.id,
        messageId: msg.internetMessageId ?? undefined,
        subject: msg.subject ?? undefined,
        from: msg.from
          ? { value: [{ address: msg.from.emailAddress?.address ?? "", name: msg.from.emailAddress?.name ?? "" }] }
          : undefined,
        to: parseGraphRecipients(msg.toRecipients),
        cc: parseGraphRecipients(msg.ccRecipients),
        bcc: parseGraphRecipients(msg.bccRecipients),
        date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined,
        snippet: msg.bodyPreview ?? undefined,
        bodyHtml,
        bodyHtmlRaw,
        bodyText,
        flags,
      };
    });

    logger.debug(
      { mailboxPath: input.mailboxPath, count: result.length },
      "graph fetchRecentMessages done",
    );
    return result;
  }

  /** Mark a message as read via Graph API. */
  async markAsRead(mailboxPath: string, externalId: string): Promise<void> {
    logger.debug({ mailboxPath, externalId }, "graph markAsRead start");
    const headers = await this.authHeaders();

    const response = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isRead: true }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body, externalId },
        "graph markAsRead failed",
      );
      throw new Error(`Graph markAsRead failed: ${response.status}`);
    }

    logger.debug({ mailboxPath, externalId }, "graph markAsRead done");
  }

  /** Set or remove flagged state via Graph API. */
  async setFlagged(mailboxPath: string, externalId: string, flagged: boolean): Promise<void> {
    logger.debug({ mailboxPath, externalId, flagged }, "graph setFlagged start");
    const headers = await this.authHeaders();

    const response = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        flag: { flagStatus: flagged ? "flagged" : "notFlagged" },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body, externalId, flagged },
        "graph setFlagged failed",
      );
      throw new Error(`Graph setFlagged failed: ${response.status}`);
    }

    logger.debug({ mailboxPath, externalId, flagged }, "graph setFlagged done");
  }

  /** Delete message via Graph API. */
  async deleteMessage(_mailboxPath: string, externalId: string): Promise<void> {
    logger.debug({ externalId }, "graph deleteMessage start");
    const headers = await this.authHeaders();
    const response = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(externalId)}`,
      { method: "DELETE", headers },
    );
    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "graph deleteMessage failed");
      throw new Error(`Graph deleteMessage failed: ${response.status}`);
    }
    logger.debug({ externalId }, "graph deleteMessage done");
  }

  /** Move message via Graph API. */
  async moveMessage(_fromMailbox: string, toMailbox: string, externalId: string): Promise<void> {
    logger.debug({ toMailbox, externalId }, "graph moveMessage start");
    const headers = await this.authHeaders();
    const response = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(externalId)}/move`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ destinationId: toMailbox }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "graph moveMessage failed");
      throw new Error(`Graph moveMessage failed: ${response.status}`);
    }
    logger.debug({ toMailbox, externalId }, "graph moveMessage done");
  }

  /** Download attachment via Graph API. */
  async downloadAttachment(
    _mailboxPath: string,
    externalId: string,
    attachmentIndex: number,
  ): Promise<DownloadAttachmentResult> {
    logger.debug({ externalId, attachmentIndex }, "graph downloadAttachment start");
    const headers = await this.authHeaders();

    const listResponse = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(externalId)}/attachments`,
      { headers },
    );
    if (!listResponse.ok) {
      throw new Error(`Graph listAttachments failed: ${listResponse.status}`);
    }
    const listData = (await listResponse.json()) as {
      value?: Array<{
        id?: string;
        name?: string;
        contentType?: string;
        contentBytes?: string;
      }>;
    };
    const attachments = listData.value ?? [];
    if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
      throw new Error(`附件索引 ${attachmentIndex} 超出范围。`);
    }
    const att = attachments[attachmentIndex]!;
    const content = Buffer.from(att.contentBytes ?? "", "base64");

    return {
      filename: att.name ?? "attachment",
      contentType: att.contentType ?? "application/octet-stream",
      content,
    };
  }

  /** Send email via Microsoft Graph API. */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    logger.debug({ to: input.to }, "graph sendMessage start");
    const headers = await this.authHeaders();

    const toRecipients = input.to.map((addr) => ({
      emailAddress: { address: addr },
    }));
    const ccRecipients = input.cc?.map((addr) => ({
      emailAddress: { address: addr },
    }));
    const bccRecipients = input.bcc?.map((addr) => ({
      emailAddress: { address: addr },
    }));

    const payload: Record<string, unknown> = {
      message: {
        subject: input.subject,
        body: {
          contentType: input.bodyHtml ? "HTML" : "Text",
          content: input.bodyHtml ?? input.bodyText ?? "",
        },
        toRecipients,
        ccRecipients: ccRecipients ?? [],
        bccRecipients: bccRecipients ?? [],
      },
    };

    const response = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "graph sendMessage failed");
      throw new Error(`Graph sendMessage failed: ${response.status}`);
    }

    logger.debug("graph sendMessage done");
    return { ok: true };
  }

  /** No-op since Graph uses stateless HTTP requests. */
  async dispose(): Promise<void> {
    // 逻辑：Graph 使用无状态 HTTP 请求，无需清理。
  }
}
