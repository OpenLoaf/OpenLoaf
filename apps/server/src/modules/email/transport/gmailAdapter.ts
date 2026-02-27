/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { logger } from "@/common/logger";
import { sanitizeEmailHtml } from "../emailSanitize";
import type { DownloadAttachmentResult, EmailTransportAdapter, SendMessageInput, SendMessageResult, TransportMailbox, TransportMessage } from "./types";

/** Gmail API base URL. */
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Gmail adapter configuration. */
type GmailAdapterConfig = {
  getAccessToken: () => Promise<string>;
};

/** System labels to include when listing mailboxes. */
const INCLUDED_SYSTEM_LABELS = new Set([
  "INBOX",
  "SENT",
  "DRAFT",
  "SPAM",
  "TRASH",
  "STARRED",
  "IMPORTANT",
]);

/** Map Gmail label id to IMAP-style attribute. */
function mapLabelAttribute(labelId: string): string | null {
  const mapping: Record<string, string> = {
    INBOX: "\\Inbox",
    SENT: "\\Sent",
    DRAFT: "\\Drafts",
    SPAM: "\\Junk",
    TRASH: "\\Trash",
    STARRED: "\\Flagged",
  };
  return mapping[labelId] ?? null;
}

/** Decode base64url-encoded string to UTF-8. */
function decodeBase64Url(encoded: string): string {
  // 逻辑：将 base64url 转换为标准 base64，然后解码。
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Parse an RFC 2822 address string into { address, name }. */
function parseAddressHeader(
  header: string | undefined,
): { value: Array<{ address: string; name: string }> } | undefined {
  if (!header) return undefined;

  const addresses = header.split(",").map((part) => {
    const trimmed = part.trim();
    // 逻辑：匹配 "Name <email>" 或纯 "email" 格式。
    const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (match && match[1] && match[2]) {
      return {
        name: match[1].replace(/^["']|["']$/g, "").trim(),
        address: match[2].trim(),
      };
    }
    return { name: "", address: trimmed };
  });

  return addresses.length ? { value: addresses } : undefined;
}

/** Find a MIME part by content type in a Gmail message payload. */
function findMimePart(
  payload: GmailMessagePayload,
  mimeType: string,
): GmailMessagePart | null {
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findMimePart(part, mimeType);
      if (found) return found;
    }
  }
  return null;
}

/** Gmail message payload part type. */
type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailMessagePart[];
};

/** Gmail message payload type. */
type GmailMessagePayload = GmailMessagePart;

/** Gmail API transport adapter. */
export class GmailTransportAdapter implements EmailTransportAdapter {
  readonly type = "gmail" as const;
  private readonly config: GmailAdapterConfig;

  constructor(config: GmailAdapterConfig) {
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

  /** List mailboxes (labels) from Gmail. */
  async listMailboxes(): Promise<TransportMailbox[]> {
    logger.debug("gmail listMailboxes start");
    const headers = await this.authHeaders();

    const response = await fetch(`${GMAIL_BASE}/labels`, { headers });
    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "gmail listMailboxes failed");
      throw new Error(`Gmail listMailboxes failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      labels: Array<{
        id: string;
        name: string;
        type?: string;
      }>;
    };

    const result: TransportMailbox[] = (data.labels ?? [])
      .filter((label) => {
        // 逻辑：包含指定的系统标签和所有用户标签。
        if (label.type === "user") return true;
        return INCLUDED_SYSTEM_LABELS.has(label.id);
      })
      .map((label) => {
        const attr = mapLabelAttribute(label.id);
        return {
          path: label.id,
          name: label.name,
          parentPath: null,
          attributes: attr ? [attr] : [],
        };
      });

    logger.debug({ count: result.length }, "gmail listMailboxes done");
    return result;
  }

  /** Fetch recent messages from a Gmail label. */
  async fetchRecentMessages(input: {
    mailboxPath: string;
    limit: number;
    sinceExternalId?: string;
  }): Promise<TransportMessage[]> {
    logger.debug(
      { mailboxPath: input.mailboxPath, limit: input.limit },
      "gmail fetchRecentMessages start",
    );
    const headers = await this.authHeaders();

    // 逻辑：获取消息 ID 列表。
    const listUrl =
      `${GMAIL_BASE}/messages?labelIds=${encodeURIComponent(input.mailboxPath)}` +
      `&maxResults=${input.limit}`;

    const listResponse = await fetch(listUrl, { headers });
    if (!listResponse.ok) {
      const body = await listResponse.text();
      logger.error(
        { status: listResponse.status, body, mailboxPath: input.mailboxPath },
        "gmail fetchRecentMessages list failed",
      );
      throw new Error(`Gmail fetchRecentMessages list failed: ${listResponse.status}`);
    }

    const listData = (await listResponse.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
    };

    if (!listData.messages?.length) {
      logger.debug({ mailboxPath: input.mailboxPath }, "gmail fetchRecentMessages empty");
      return [];
    }

    let messageIds = listData.messages.map((m) => m.id);

    // 逻辑：如果指定了 sinceExternalId，跳过该 ID 及之后的消息。
    if (input.sinceExternalId) {
      const idx = messageIds.findIndex((id) => id === input.sinceExternalId);
      if (idx >= 0) {
        messageIds = messageIds.slice(0, idx);
      }
    }

    // 逻辑：逐条获取完整消息内容。
    const result: TransportMessage[] = [];
    for (const msgId of messageIds) {
      try {
        const msgResponse = await fetch(
          `${GMAIL_BASE}/messages/${encodeURIComponent(msgId)}?format=full`,
          { headers },
        );
        if (!msgResponse.ok) {
          logger.warn(
            { status: msgResponse.status, messageId: msgId },
            "gmail fetchRecentMessages get message failed, skipping",
          );
          continue;
        }

        const msg = (await msgResponse.json()) as {
          id: string;
          threadId: string;
          labelIds?: string[];
          snippet?: string;
          internalDate?: string;
          payload?: GmailMessagePayload;
        };

        const getHeader = (name: string): string | undefined => {
          const header = msg.payload?.headers?.find(
            (h) => h.name.toLowerCase() === name.toLowerCase(),
          );
          return header?.value;
        };

        // 逻辑：根据标签判断消息标记状态。
        const flags: string[] = [];
        const labelIds = msg.labelIds ?? [];
        if (!labelIds.includes("UNREAD")) flags.push("\\Seen");
        if (labelIds.includes("STARRED")) flags.push("\\Flagged");
        if (labelIds.includes("DRAFT")) flags.push("\\Draft");

        // 逻辑：提取 HTML 和纯文本正文。
        let bodyHtml: string | undefined;
        let bodyHtmlRaw: string | undefined;
        let bodyText: string | undefined;

        if (msg.payload) {
          const htmlPart = findMimePart(msg.payload, "text/html");
          if (htmlPart?.body?.data) {
            const rawHtml = decodeBase64Url(htmlPart.body.data);
            bodyHtml = sanitizeEmailHtml(rawHtml);
            bodyHtmlRaw = rawHtml !== bodyHtml ? rawHtml : undefined;
          }

          const textPart = findMimePart(msg.payload, "text/plain");
          if (textPart?.body?.data) {
            bodyText = decodeBase64Url(textPart.body.data);
          }
        }

        // 逻辑：解析日期，优先使用 Date 头，回退到 internalDate。
        const dateHeader = getHeader("Date");
        let date: Date | undefined;
        if (dateHeader) {
          const parsed = new Date(dateHeader);
          date = Number.isNaN(parsed.getTime()) ? undefined : parsed;
        }
        if (!date && msg.internalDate) {
          date = new Date(Number(msg.internalDate));
        }

        result.push({
          externalId: msg.id,
          messageId: getHeader("Message-ID") ?? undefined,
          subject: getHeader("Subject") ?? undefined,
          from: parseAddressHeader(getHeader("From")),
          to: parseAddressHeader(getHeader("To")),
          cc: parseAddressHeader(getHeader("Cc")),
          bcc: parseAddressHeader(getHeader("Bcc")),
          date,
          snippet: msg.snippet ?? undefined,
          bodyHtml,
          bodyHtmlRaw,
          bodyText,
          flags,
        });
      } catch (error) {
        logger.error(
          { err: error, messageId: msgId },
          "gmail fetchRecentMessages parse error, skipping",
        );
      }
    }

    logger.debug(
      { mailboxPath: input.mailboxPath, count: result.length },
      "gmail fetchRecentMessages done",
    );
    return result;
  }

  /** Mark a message as read by removing the UNREAD label. */
  async markAsRead(mailboxPath: string, externalId: string): Promise<void> {
    logger.debug({ mailboxPath, externalId }, "gmail markAsRead start");
    const headers = await this.authHeaders();

    const response = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(externalId)}/modify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body, externalId },
        "gmail markAsRead failed",
      );
      throw new Error(`Gmail markAsRead failed: ${response.status}`);
    }

    logger.debug({ mailboxPath, externalId }, "gmail markAsRead done");
  }

  /** Set or remove starred state via Gmail label modification. */
  async setFlagged(mailboxPath: string, externalId: string, flagged: boolean): Promise<void> {
    logger.debug({ mailboxPath, externalId, flagged }, "gmail setFlagged start");
    const headers = await this.authHeaders();

    const body = flagged
      ? { addLabelIds: ["STARRED"] }
      : { removeLabelIds: ["STARRED"] };

    const response = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(externalId)}/modify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const respBody = await response.text();
      logger.error(
        { status: response.status, body: respBody, externalId, flagged },
        "gmail setFlagged failed",
      );
      throw new Error(`Gmail setFlagged failed: ${response.status}`);
    }

    logger.debug({ mailboxPath, externalId, flagged }, "gmail setFlagged done");
  }

  /** Delete message via Gmail API (move to trash). */
  async deleteMessage(_mailboxPath: string, externalId: string): Promise<void> {
    logger.debug({ externalId }, "gmail deleteMessage start");
    const headers = await this.authHeaders();
    const response = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(externalId)}/trash`,
      { method: "POST", headers },
    );
    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "gmail deleteMessage failed");
      throw new Error(`Gmail deleteMessage failed: ${response.status}`);
    }
    logger.debug({ externalId }, "gmail deleteMessage done");
  }

  /** Move message via Gmail API (modify labels). */
  async moveMessage(fromMailbox: string, toMailbox: string, externalId: string): Promise<void> {
    logger.debug({ fromMailbox, toMailbox, externalId }, "gmail moveMessage start");
    const headers = await this.authHeaders();
    const response = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(externalId)}/modify`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          addLabelIds: [toMailbox],
          removeLabelIds: [fromMailbox],
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "gmail moveMessage failed");
      throw new Error(`Gmail moveMessage failed: ${response.status}`);
    }
    logger.debug({ fromMailbox, toMailbox, externalId }, "gmail moveMessage done");
  }

  /** Download attachment via Gmail API. */
  async downloadAttachment(
    _mailboxPath: string,
    externalId: string,
    attachmentIndex: number,
  ): Promise<DownloadAttachmentResult> {
    logger.debug({ externalId, attachmentIndex }, "gmail downloadAttachment start");
    const headers = await this.authHeaders();

    // 逻辑：先获取邮件元数据以找到附件 ID。
    const msgResponse = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(externalId)}?format=full`,
      { headers },
    );
    if (!msgResponse.ok) {
      throw new Error(`Gmail getMessage failed: ${msgResponse.status}`);
    }
    const msgData = (await msgResponse.json()) as {
      payload?: {
        parts?: Array<{
          filename?: string;
          mimeType?: string;
          body?: { attachmentId?: string; size?: number };
        }>;
      };
    };

    const parts = (msgData.payload?.parts ?? []).filter(
      (p) => p.body?.attachmentId,
    );
    if (attachmentIndex < 0 || attachmentIndex >= parts.length) {
      throw new Error(`附件索引 ${attachmentIndex} 超出范围。`);
    }
    const part = parts[attachmentIndex]!;
    const attachmentId = part.body!.attachmentId!;

    const attResponse = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(externalId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers },
    );
    if (!attResponse.ok) {
      throw new Error(`Gmail downloadAttachment failed: ${attResponse.status}`);
    }
    const attData = (await attResponse.json()) as { data?: string };
    const base64Data = (attData.data ?? "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const content = Buffer.from(base64Data, "base64");

    return {
      filename: part.filename ?? "attachment",
      contentType: part.mimeType ?? "application/octet-stream",
      content,
    };
  }

  /** Send email via Gmail API. */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    logger.debug({ to: input.to }, "gmail sendMessage start");
    const headers = await this.authHeaders();

    const lines: string[] = [];
    lines.push(`To: ${input.to.join(", ")}`);
    if (input.cc?.length) lines.push(`Cc: ${input.cc.join(", ")}`);
    if (input.bcc?.length) lines.push(`Bcc: ${input.bcc.join(", ")}`);
    lines.push(`Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`);
    lines.push("MIME-Version: 1.0");
    if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
    if (input.references?.length) lines.push(`References: ${input.references.join(" ")}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(input.bodyText ?? "");

    const raw = Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch(`${GMAIL_BASE}/messages/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      const respBody = await response.text();
      logger.error({ status: response.status, body: respBody }, "gmail sendMessage failed");
      throw new Error(`Gmail sendMessage failed: ${response.status}`);
    }

    const data = (await response.json()) as { id?: string };
    logger.debug({ messageId: data.id }, "gmail sendMessage done");
    return { ok: true, messageId: data.id };
  }

  /** No-op since Gmail uses stateless HTTP requests. */
  async dispose(): Promise<void> {
    // 逻辑：Gmail 使用无状态 HTTP 请求，无需清理。
  }
}
