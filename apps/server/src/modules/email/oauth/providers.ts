/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { OAuthProviderConfig } from "./types";

/** Microsoft Graph OAuth provider configuration. */
const microsoftProvider: OAuthProviderConfig = {
  id: "microsoft",
  name: "Microsoft",
  authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  scopes: [
    "Mail.ReadWrite",
    "Mail.Send",
    "MailboxSettings.Read",
    "offline_access",
    "User.Read",
  ],
  clientIdEnvKey: "EMAIL_OAUTH_MICROSOFT_CLIENT_ID",
  clientSecretEnvKey: "EMAIL_OAUTH_MICROSOFT_CLIENT_SECRET",
  usePKCE: true,
  userInfoEndpoint: "https://graph.microsoft.com/v1.0/me",
  parseUserEmail: (data: Record<string, unknown>): string => {
    // 逻辑：优先使用 mail 字段，回退到 userPrincipalName。
    const mail = data.mail ?? data.userPrincipalName;
    if (typeof mail !== "string" || !mail) {
      throw new Error("无法从 Microsoft 用户信息中获取邮箱地址。");
    }
    return mail.trim().toLowerCase();
  },
};

/** Google Gmail OAuth provider configuration. */
const googleProvider: OAuthProviderConfig = {
  id: "google",
  name: "Google",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "email",
  ],
  clientIdEnvKey: "EMAIL_OAUTH_GOOGLE_CLIENT_ID",
  clientSecretEnvKey: "EMAIL_OAUTH_GOOGLE_CLIENT_SECRET",
  usePKCE: true,
  userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
  parseUserEmail: (data: Record<string, unknown>): string => {
    const email = data.email;
    if (typeof email !== "string" || !email) {
      throw new Error("无法从 Google 用户信息中获取邮箱地址。");
    }
    return email.trim().toLowerCase();
  },
};

/** All supported OAuth providers keyed by id. */
const providers: Record<string, OAuthProviderConfig> = {
  microsoft: microsoftProvider,
  google: googleProvider,
};

/** Get OAuth provider config by id. */
export function getOAuthProvider(providerId: string): OAuthProviderConfig {
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`不支持的 OAuth 提供商：${providerId}`);
  }
  return provider;
}

/** List all supported OAuth provider ids. */
export function listOAuthProviderIds(): string[] {
  return Object.keys(providers);
}
