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
import { readEmailConfigFile } from "./emailConfigStore";
import { getEmailEnvValue } from "./emailEnvStore";
import { createTransport } from "./transport/factory";
import { sendViaSMTP } from "./transport/smtpSender";
import type { SendMessageInput, SendMessageResult } from "./transport/types";

type SendEmailParams = {
  workspaceId: string;
  accountEmail: string;
  input: SendMessageInput;
};

/** Send email through the appropriate channel based on account auth type. */
export async function sendEmail(params: SendEmailParams): Promise<SendMessageResult> {
  const { workspaceId, accountEmail, input } = params;
  const config = readEmailConfigFile(workspaceId);
  const account = config.emailAccounts.find(
    (a) => a.emailAddress.trim().toLowerCase() === accountEmail.trim().toLowerCase(),
  );

  if (!account) {
    throw new Error(`邮箱账号 ${accountEmail} 未找到。`);
  }

  logger.info({ accountEmail, authType: account.auth.type }, "sendEmail routing");

  switch (account.auth.type) {
    case "password": {
      if (!account.smtp) {
        throw new Error(`邮箱账号 ${accountEmail} 未配置 SMTP。`);
      }
      const password = getEmailEnvValue(account.auth.envKey);
      if (!password) {
        throw new Error(`邮箱账号 ${accountEmail} 密码未找到。`);
      }
      return sendViaSMTP(
        {
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.tls,
          user: account.emailAddress,
          password,
        },
        input,
      );
    }

    case "oauth2-gmail":
    case "oauth2-graph": {
      const transport = createTransport(
        {
          emailAddress: account.emailAddress,
          auth: account.auth,
        },
        { workspaceId },
      );
      try {
        if (!transport.sendMessage) {
          throw new Error(`${account.auth.type} 适配器不支持发送邮件。`);
        }
        return await transport.sendMessage(input);
      } finally {
        await transport.dispose();
      }
    }

    default:
      throw new Error(`不支持的认证类型。`);
  }
}
