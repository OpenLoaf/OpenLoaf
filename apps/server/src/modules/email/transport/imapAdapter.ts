import Imap from "imap";
import { simpleParser } from "mailparser";

import { logger } from "@/common/logger";
import { sanitizeEmailHtml } from "../emailSanitize";
import type { DownloadAttachmentResult, EmailTransportAdapter, TransportMailbox, TransportMessage } from "./types";

/** IMAP close timeout in ms. */
const CLOSE_TIMEOUT_MS = 5000;

/** IMAP connection configuration. */
type ImapConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
};

/** Connect to IMAP server and wait until ready. */
async function connectImap(imap: Imap): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    imap.once("ready", resolve);
    imap.once("error", reject);
    imap.connect();
  });
}

/** Open IMAP mailbox. */
async function openMailbox(
  imap: Imap,
  mailboxPath: string,
  readOnly = true,
): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox(mailboxPath, readOnly, (error, box) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(box);
    });
  });
}

/** Search all message UIDs in mailbox. */
async function searchAllUids(imap: Imap): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search(["ALL"], (error, results) => {
      if (error) {
        reject(error);
        return;
      }
      resolve((results ?? []).map((uid) => Number(uid)).filter((uid) => uid > 0));
    });
  });
}

/** Read a stream to buffer. */
async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

/** Parse messages for a UID list. */
async function parseMessages(imap: Imap, uids: number[]) {
  const tasks: Array<Promise<{
    uid: number;
    flags: string[];
    size?: number;
    messageId?: string;
    subject?: string;
    from?: unknown;
    to?: unknown;
    cc?: unknown;
    bcc?: unknown;
    date?: Date;
    snippet?: string;
    bodyHtml?: string;
    bodyHtmlRaw?: string;
    bodyText?: string;
    attachments?: Array<{
      filename?: string;
      contentType?: string;
      size?: number;
      cid?: string;
    }>;
  }>> = [];
  const fetcher = imap.fetch(uids, { bodies: "", struct: true });

  fetcher.on("message", (msg) => {
    let uid = 0;
    let size: number | undefined;
    let flags: string[] = [];
    let rawPromise: Promise<Buffer> | null = null;
    msg.on("body", (stream) => {
      rawPromise = readStream(stream);
    });
    msg.once("attributes", (attrs) => {
      uid = Number(attrs.uid ?? 0);
      flags = Array.isArray(attrs.flags) ? attrs.flags.map(String) : [];
      size = typeof attrs.size === "number" ? attrs.size : undefined;
    });
    const task = new Promise<{
      uid: number;
      flags: string[];
      size?: number;
      messageId?: string;
      subject?: string;
      from?: unknown;
      to?: unknown;
      cc?: unknown;
      bcc?: unknown;
      date?: Date;
      snippet?: string;
      bodyHtml?: string;
      bodyHtmlRaw?: string;
      bodyText?: string;
      attachments?: Array<{
        filename?: string;
        contentType?: string;
        size?: number;
        cid?: string;
      }>;
    }>((resolve, reject) => {
      msg.once("end", async () => {
        try {
          const raw = rawPromise ? await rawPromise : Buffer.alloc(0);
          const parsed = await simpleParser(raw);
          const text = parsed.text?.replace(/\s+/g, " ").trim() ?? "";
          const snippet = text ? text.slice(0, 200) : undefined;
          const rawHtml = parsed.html ? String(parsed.html) : undefined;
          const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
          const bodyHtmlRaw = rawHtml && rawHtml !== bodyHtml ? rawHtml : undefined;
          const attachments = parsed.attachments?.map(
            (attachment: {
              filename?: string;
              contentType?: string;
              size?: number;
              cid?: string;
            }) => ({
            filename: attachment.filename ?? undefined,
            contentType: attachment.contentType ?? undefined,
            size: typeof attachment.size === "number" ? attachment.size : undefined,
            cid: attachment.cid ?? undefined,
          }),
          );
          resolve({
            uid,
            flags,
            size,
            messageId: parsed.messageId ?? undefined,
            subject: parsed.subject ?? undefined,
            from: parsed.from ?? undefined,
            to: parsed.to ?? undefined,
            cc: parsed.cc ?? undefined,
            bcc: parsed.bcc ?? undefined,
            date: parsed.date ?? undefined,
            snippet,
            bodyHtml,
            bodyHtmlRaw,
            bodyText: parsed.text ?? undefined,
            attachments: attachments?.length ? attachments : undefined,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    tasks.push(task);
  });

  await new Promise<void>((resolve, reject) => {
    fetcher.once("error", reject);
    fetcher.once("end", resolve);
  });

  return Promise.all(tasks);
}

/** Add flags to IMAP message. */
async function addImapFlags(imap: Imap, uid: number, flags: string[]) {
  await new Promise<void>((resolve, reject) => {
    imap.addFlags(uid, flags, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Remove flags from IMAP message. */
async function removeImapFlags(imap: Imap, uid: number, flags: string[]) {
  await new Promise<void>((resolve, reject) => {
    imap.delFlags(uid, flags, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Fetch mailbox tree. */
async function fetchImapMailboxes(imap: Imap): Promise<Imap.MailBoxes> {
  return new Promise((resolve, reject) => {
    imap.getBoxes((error, boxes) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(boxes);
    });
  });
}

/** Flatten mailbox tree into entries. */
function flattenMailboxes(
  boxes: Imap.MailBoxes,
  parentPath: string | null = null,
): TransportMailbox[] {
  const entries: TransportMailbox[] = [];
  Object.entries(boxes).forEach(([name, box]) => {
    const delimiter = typeof box.delimiter === "string" ? box.delimiter : "/";
    const path = parentPath ? `${parentPath}${delimiter}${name}` : name;
    const attributes = Array.isArray(box.attribs) ? box.attribs.map(String) : [];
    entries.push({
      path,
      name,
      parentPath,
      delimiter,
      attributes,
    });
    if (box.children) {
      entries.push(...flattenMailboxes(box.children, path));
    }
  });
  return entries;
}

/** Safely close an IMAP connection with timeout. */
async function safeCloseImap(imap: Imap, context: Record<string, unknown>): Promise<void> {
  logger.debug(context, "email imap closing");
  let settled = false;
  const finish = (reason: "end" | "close" | "timeout") => {
    if (settled) return;
    settled = true;
    logger.debug({ ...context, reason }, "email imap closed (finalize)");
  };
  const timeout = setTimeout(() => {
    if (settled) return;
    logger.warn(context, "email imap end timeout");
    try {
      imap.destroy();
    } catch {
      // 逻辑：忽略 destroy 失败，避免影响主流程。
    }
    finish("timeout");
  }, CLOSE_TIMEOUT_MS);
  const endPromise = new Promise<void>((resolve) => {
    const done = (reason: "end" | "close") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      logger.debug({ ...context, reason }, "email imap closed (signal)");
      resolve();
    };
    imap.once("end", () => done("end"));
    imap.once("close", () => done("close"));
  });
  imap.end();
  await endPromise;
}

/** IMAP transport adapter. */
export class ImapTransportAdapter implements EmailTransportAdapter {
  readonly type = "imap" as const;
  private readonly config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  /** Create a fresh IMAP connection. */
  private createImap(): Imap {
    const imap = new Imap({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
    });
    imap.on("error", (error) => {
      logger.error(
        { err: error, accountEmail: this.config.user },
        "email imap error",
      );
    });
    return imap;
  }

  /** List all mailboxes from the IMAP server. */
  async listMailboxes(): Promise<TransportMailbox[]> {
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      logger.debug(
        {
          host: this.config.host,
          port: this.config.port,
          tls: this.config.tls,
          accountEmail: this.config.user,
        },
        "email imap connecting",
      );
      await connectImap(imap);
      logger.debug({ accountEmail: this.config.user }, "email imap ready");
      const boxes = await fetchImapMailboxes(imap);
      return flattenMailboxes(boxes);
    } finally {
      if (imap) {
        await safeCloseImap(imap, { accountEmail: this.config.user });
      }
    }
  }

  /** Fetch recent messages from a mailbox. */
  async fetchRecentMessages(input: {
    mailboxPath: string;
    limit: number;
    sinceExternalId?: string;
  }): Promise<TransportMessage[]> {
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      logger.debug(
        {
          host: this.config.host,
          port: this.config.port,
          tls: this.config.tls,
          accountEmail: this.config.user,
        },
        "email imap connecting",
      );
      await connectImap(imap);
      logger.debug(
        { accountEmail: this.config.user, mailboxPath: input.mailboxPath },
        "email imap ready",
      );
      await openMailbox(imap, input.mailboxPath);

      const uids = await searchAllUids(imap);
      logger.debug(
        {
          accountEmail: this.config.user,
          mailboxPath: input.mailboxPath,
          totalUids: uids.length,
        },
        "email mailbox uids fetched",
      );
      if (!uids.length) {
        return [];
      }

      // 逻辑：如果指定了 sinceExternalId，只取 UID 大于该值的消息。
      let candidateUids = uids;
      if (input.sinceExternalId) {
        const sinceUid = parseInt(input.sinceExternalId, 10);
        if (!Number.isNaN(sinceUid)) {
          candidateUids = uids.filter((uid) => uid > sinceUid);
        }
      }
      if (!candidateUids.length) {
        return [];
      }

      const recentUids = candidateUids.slice(-input.limit);
      logger.debug(
        {
          accountEmail: this.config.user,
          mailboxPath: input.mailboxPath,
          recentCount: recentUids.length,
          recentFirst: recentUids[0],
          recentLast: recentUids[recentUids.length - 1],
        },
        "email mailbox recent uids selected",
      );

      const parsedMessages = await parseMessages(imap, recentUids);
      logger.debug(
        {
          accountEmail: this.config.user,
          mailboxPath: input.mailboxPath,
          parsedCount: parsedMessages.length,
        },
        "email messages parsed",
      );

      return parsedMessages
        .filter((msg) => msg.uid > 0)
        .map((msg) => ({
          externalId: String(msg.uid),
          messageId: msg.messageId,
          subject: msg.subject,
          from: msg.from,
          to: msg.to,
          cc: msg.cc,
          bcc: msg.bcc,
          date: msg.date,
          snippet: msg.snippet,
          bodyHtml: msg.bodyHtml,
          bodyHtmlRaw: msg.bodyHtmlRaw,
          bodyText: msg.bodyText,
          flags: msg.flags,
          size: msg.size,
          attachments: msg.attachments?.map((att) => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
          })),
        }));
    } finally {
      if (imap) {
        await safeCloseImap(imap, {
          accountEmail: this.config.user,
          mailboxPath: input.mailboxPath,
        });
      }
    }
  }

  /** Mark a message as read on the IMAP server. */
  async markAsRead(mailboxPath: string, externalId: string): Promise<void> {
    const uid = parseInt(externalId, 10);
    if (Number.isNaN(uid) || uid <= 0) {
      throw new Error(`Invalid externalId: ${externalId}`);
    }
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      logger.debug(
        {
          host: this.config.host,
          port: this.config.port,
          tls: this.config.tls,
          accountEmail: this.config.user,
        },
        "email imap connecting",
      );
      await connectImap(imap);
      logger.debug(
        { accountEmail: this.config.user, mailboxPath },
        "email imap ready",
      );
      await openMailbox(imap, mailboxPath, false);
      await addImapFlags(imap, uid, ["\\Seen"]);
      logger.debug(
        { accountEmail: this.config.user, mailboxPath, uid },
        "email message marked read",
      );
    } finally {
      if (imap) {
        await safeCloseImap(imap, {
          accountEmail: this.config.user,
          mailboxPath,
          uid,
        });
      }
    }
  }

  /** Set or remove flagged state on the IMAP server. */
  async setFlagged(mailboxPath: string, externalId: string, flagged: boolean): Promise<void> {
    const uid = parseInt(externalId, 10);
    if (Number.isNaN(uid) || uid <= 0) {
      throw new Error(`Invalid externalId: ${externalId}`);
    }
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      logger.debug(
        {
          host: this.config.host,
          port: this.config.port,
          tls: this.config.tls,
          accountEmail: this.config.user,
        },
        "email imap connecting",
      );
      await connectImap(imap);
      logger.debug(
        { accountEmail: this.config.user, mailboxPath },
        "email imap ready",
      );
      await openMailbox(imap, mailboxPath, false);
      // 逻辑：根据目标状态添加或移除星标。
      if (flagged) {
        await addImapFlags(imap, uid, ["\\Flagged"]);
      } else {
        await removeImapFlags(imap, uid, ["\\Flagged"]);
      }
      logger.debug(
        { accountEmail: this.config.user, mailboxPath, uid, flagged },
        "email message flagged updated",
      );
    } finally {
      if (imap) {
        await safeCloseImap(imap, {
          accountEmail: this.config.user,
          mailboxPath,
          uid,
        });
      }
    }
  }

  /** Delete message via IMAP (add \Deleted flag + expunge). */
  async deleteMessage(mailboxPath: string, externalId: string): Promise<void> {
    const uid = parseInt(externalId, 10);
    if (Number.isNaN(uid) || uid <= 0) {
      throw new Error(`Invalid externalId: ${externalId}`);
    }
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      await connectImap(imap);
      await openMailbox(imap, mailboxPath, false);
      await addImapFlags(imap, uid, ["\\Deleted"]);
      await new Promise<void>((resolve, reject) => {
        imap!.expunge((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      logger.debug({ mailboxPath, uid }, "imap deleteMessage done");
    } finally {
      if (imap) {
        await safeCloseImap(imap, { accountEmail: this.config.user, mailboxPath, uid });
      }
    }
  }

  /** Move message between IMAP mailboxes (copy + delete). */
  async moveMessage(fromMailbox: string, toMailbox: string, externalId: string): Promise<void> {
    const uid = parseInt(externalId, 10);
    if (Number.isNaN(uid) || uid <= 0) {
      throw new Error(`Invalid externalId: ${externalId}`);
    }
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      await connectImap(imap);
      await openMailbox(imap, fromMailbox, false);
      // 逻辑：先复制到目标邮箱，再在源邮箱标记删除并清除。
      await new Promise<void>((resolve, reject) => {
        imap!.copy([uid], toMailbox, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await addImapFlags(imap, uid, ["\\Deleted"]);
      await new Promise<void>((resolve, reject) => {
        imap!.expunge((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      logger.debug({ fromMailbox, toMailbox, uid }, "imap moveMessage done");
    } finally {
      if (imap) {
        await safeCloseImap(imap, { accountEmail: this.config.user, fromMailbox, toMailbox, uid });
      }
    }
  }

  /** Test IMAP connection by listing mailboxes. */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      await connectImap(imap);
      await fetchImapMailboxes(imap);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    } finally {
      if (imap) {
        await safeCloseImap(imap, { accountEmail: this.config.user });
      }
    }
  }

  /** Download attachment by index from IMAP message. */
  async downloadAttachment(
    mailboxPath: string,
    externalId: string,
    attachmentIndex: number,
  ): Promise<DownloadAttachmentResult> {
    const uid = parseInt(externalId, 10);
    if (Number.isNaN(uid) || uid <= 0) {
      throw new Error(`Invalid externalId: ${externalId}`);
    }
    let imap: Imap | null = null;
    try {
      imap = this.createImap();
      await connectImap(imap);
      await openMailbox(imap, mailboxPath, true);

      const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
        const fetch = imap!.fetch([uid], { bodies: "", struct: true });
        let buffer = Buffer.alloc(0);
        fetch.on("message", (msg) => {
          msg.on("body", (stream) => {
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => {
              buffer = Buffer.concat(chunks);
            });
          });
        });
        fetch.on("error", reject);
        fetch.on("end", () => resolve(buffer));
      });

      const parsed = await simpleParser(rawBuffer);
      const attachments = parsed.attachments ?? [];
      if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
        throw new Error(`附件索引 ${attachmentIndex} 超出范围（共 ${attachments.length} 个附件）。`);
      }
      const att = attachments[attachmentIndex]!;
      return {
        filename: att.filename ?? "attachment",
        contentType: att.contentType ?? "application/octet-stream",
        content: att.content ?? Buffer.alloc(0),
      };
    } finally {
      if (imap) {
        await safeCloseImap(imap, {
          accountEmail: this.config.user,
          mailboxPath,
          uid,
        });
      }
    }
  }

  /** No-op since connections are per-call. */
  async dispose(): Promise<void> {
    // 逻辑：每次方法调用创建独立连接，无需全局清理。
  }
}
