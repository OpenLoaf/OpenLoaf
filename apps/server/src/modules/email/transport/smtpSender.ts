/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import nodemailer from "nodemailer";

import { logger } from "@/common/logger";
import type { SendMessageInput, SendMessageResult } from "./types";

type SmtpSenderConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

/** Send email via SMTP using nodemailer. */
export async function sendViaSMTP(
  config: SmtpSenderConfig,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  logger.debug({ host: config.host, to: input.to }, "smtp send start");

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });

  try {
    const info = await transporter.sendMail({
      from: config.user,
      to: input.to.join(", "),
      cc: input.cc?.join(", "),
      bcc: input.bcc?.join(", "),
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
      inReplyTo: input.inReplyTo,
      references: input.references?.join(" "),
      attachments: input.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      })),
    });

    logger.debug({ messageId: info.messageId }, "smtp send done");
    return { ok: true, messageId: info.messageId };
  } finally {
    transporter.close();
  }
}

/** Test SMTP connection. */
export async function testSmtpConnection(
  config: SmtpSenderConfig,
): Promise<{ ok: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });

  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    transporter.close();
  }
}
